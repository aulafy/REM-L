import Foundation
import Network

/// Arranca y vigila el servidor local de REM Negocio (Node), que vive dentro de la app.
@MainActor
final class ServerSupervisor: ObservableObject {
    enum State: Equatable { case stopped, starting, running, failed(String) }

    @Published private(set) var state: State = .stopped
    @Published private(set) var port = 4400
    let adminToken = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
    private(set) var adopted = false          // ya había un REM en marcha (versión web): se usa tal cual, sin token
    private var process: Process?
    private var stopping = false
    private var restarts = 0

    var baseURL: URL { URL(string: "http://127.0.0.1:\(port)/")! }
    var api: ServerAPI { ServerAPI(base: baseURL, token: adopted ? nil : adminToken) }

    // MARK: rutas de los recursos (empaquetados o, en desarrollo, variables de entorno)
    private var resources: URL? { Bundle.main.resourceURL }
    private func nodeURL() -> URL? {
        let env = ProcessInfo.processInfo.environment
        var candidates: [String] = []
        if let p = env["REM_NODE"] { candidates.append(p) }
        if let r = resources { candidates.append(r.appendingPathComponent("node").path) }
        candidates += ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }.map { URL(fileURLWithPath: $0) }
    }
    private func appDir() -> URL? {
        let env = ProcessInfo.processInfo.environment
        if let p = env["REM_APP_DIR"], FileManager.default.fileExists(atPath: p + "/server.mjs") { return URL(fileURLWithPath: p) }
        if let r = resources?.appendingPathComponent("app"), FileManager.default.fileExists(atPath: r.appendingPathComponent("server.mjs").path) { return r }
        return nil
    }

    func start() async {
        guard state != .starting else { return }
        state = .starting; stopping = false
        // ¿Ya hay un REM escuchando en el puerto habitual? (la versión web). Se adopta para no abrir dos servidores sobre los mismos datos.
        if await isREM(port: 4400) { port = 4400; adopted = true; state = .running; return }
        guard let node = nodeURL() else { state = .failed("No encuentro Node dentro de la aplicación."); return }
        guard let dir = appDir() else { state = .failed("No encuentro los archivos del servidor dentro de la aplicación."); return }
        guard let free = (4400...4420).first(where: { portFree($0) }) else { state = .failed("No hay ningún puerto libre entre el 4400 y el 4420."); return }
        port = free
        launch(node: node, dir: dir)
        await waitUntilUp()
    }

    private func launch(node: URL, dir: URL) {
        let p = Process()
        p.executableURL = node
        p.currentDirectoryURL = dir
        p.arguments = ["--disable-warning=ExperimentalWarning", dir.appendingPathComponent("server.mjs").path]
        var env = ProcessInfo.processInfo.environment
        env["REM_PORT"] = String(port)
        env["REM_ADMIN_TOKEN"] = adminToken
        if let bin = resources?.appendingPathComponent("bin"), FileManager.default.fileExists(atPath: bin.path) {
            env["REM_BIN_DIR"] = bin.path
            let mb = bin.appendingPathComponent("menubar").path
            if FileManager.default.isExecutableFile(atPath: mb) { env["REM_MENUBAR_BIN"] = mb }
        }
        p.environment = env
        let logDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/REM Negocio")
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        let logURL = logDir.appendingPathComponent("servidor.log")
        if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
        if let h = try? FileHandle(forWritingTo: logURL) { h.seekToEndOfFile(); p.standardOutput = h; p.standardError = h }
        p.terminationHandler = { [weak self] proc in
            Task { @MainActor in self?.terminated(status: proc.terminationStatus) }
        }
        do { try p.run(); process = p } catch { state = .failed("No se pudo arrancar el servidor: \(error.localizedDescription)") }
    }

    private func terminated(status: Int32) {
        process = nil
        guard !stopping else { return }
        restarts += 1
        if restarts > 5 { state = .failed("El servidor se ha detenido varias veces seguidas (código \(status)). Mira ~/Library/Logs/REM Negocio/servidor.log"); return }
        state = .starting
        Task {
            try? await Task.sleep(nanoseconds: UInt64(min(restarts, 4)) * 1_000_000_000)
            if let node = nodeURL(), let dir = appDir() { launch(node: node, dir: dir); await waitUntilUp() }
        }
    }

    private func waitUntilUp() async {
        for _ in 0..<80 {
            if await isREM(port: port) { state = .running; restarts = 0; return }
            try? await Task.sleep(nanoseconds: 250_000_000)
            if case .failed = state { return }
        }
        state = .failed("El servidor no responde. Mira ~/Library/Logs/REM Negocio/servidor.log")
    }

    func stop() {
        stopping = true
        process?.terminate()
        let p = process
        DispatchQueue.global().asyncAfter(deadline: .now() + 3) { if let p, p.isRunning { kill(p.processIdentifier, SIGKILL) } }
    }

    // MARK: utilidades
    func isREM(port: Int) async -> Bool {
        var req = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/api/lock")!)
        req.timeoutInterval = 1.5
        guard let (data, resp) = try? await URLSession.shared.data(for: req), (resp as? HTTPURLResponse)?.statusCode == 200,
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return j["pin"] != nil
    }
    private func portFree(_ p: Int) -> Bool {
        let s = socket(AF_INET, SOCK_STREAM, 0); guard s >= 0 else { return false }
        defer { close(s) }
        var addr = sockaddr_in(); addr.sin_family = sa_family_t(AF_INET); addr.sin_port = in_port_t(p).bigEndian; addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        return withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0 } }
    }
}
