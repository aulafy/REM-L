// Icono en la barra de menús de macOS: contadores de lo pendiente y acceso rápido a la app.
// Uso: menubar <urlBase> <token> [segundosEntreConsultas]. Sale solo si el servidor deja de responder (3 fallos) o con código 3 si la persona elige «Quitar el icono».
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { FileHandle.standardError.write(Data("uso: menubar <url> <token> [segundos]\n".utf8)); exit(2) }
let base = URL(string: args[1]) ?? URL(string: "http://127.0.0.1:4400")!
let token = args[2]
let every = args.count >= 4 ? max(0.2, Double(args[3]) ?? 30) : 30

final class Bar: NSObject, NSApplicationDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    var fails = 0
    var timer: Timer?

    func applicationDidFinishLaunching(_ n: Notification) {
        if let b = item.button {
            let img = NSImage(systemSymbolName: "briefcase", accessibilityDescription: "REM Negocio")
            img?.isTemplate = true
            b.image = img
            if img == nil { b.title = "REM" }
        }
        render(nil)
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: every, repeats: true) { [weak self] _ in self?.poll() }
    }

    func poll() {
        var comps = URLComponents(url: base.appendingPathComponent("api/menubar"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "t", value: token)]
        var req = URLRequest(url: comps.url!); req.timeoutInterval = 5
        URLSession.shared.dataTask(with: req) { data, resp, _ in
            DispatchQueue.main.async {
                if let d = data, (resp as? HTTPURLResponse)?.statusCode == 200, let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                    self.fails = 0; self.render(j)
                } else {
                    self.fails += 1
                    if self.fails >= 3 { NSApp.terminate(nil) }
                }
            }
        }.resume()
    }

    func render(_ j: [String: Any]?) {
        let msgs = j?["messages"] as? Int ?? 0, over = j?["overdue"] as? Int ?? 0, tasks = j?["tasks"] as? Int ?? 0, appr = j?["approvals"] as? Int ?? 0
        let total = msgs + appr
        item.button?.title = total > 0 ? " \(total)" : ""
        let m = NSMenu()
        func info(_ t: String) { let i = NSMenuItem(title: t, action: nil, keyEquivalent: ""); i.isEnabled = false; m.addItem(i) }
        info(j == nil ? "Conectando…" : "REM Negocio")
        if j != nil {
            m.addItem(.separator())
            info(msgs == 1 ? "1 mensaje por responder" : "\(msgs) mensajes por responder")
            if appr > 0 { info(appr == 1 ? "1 propuesta por aprobar" : "\(appr) propuestas por aprobar") }
            info(over == 1 ? "1 factura vencida" : "\(over) facturas vencidas")
            info(tasks == 1 ? "1 tarea para hoy" : "\(tasks) tareas para hoy")
        }
        m.addItem(.separator())
        let open = NSMenuItem(title: "Abrir REM Negocio", action: #selector(openApp), keyEquivalent: "o"); open.target = self; m.addItem(open)
        let quit = NSMenuItem(title: "Quitar el icono", action: #selector(quitIcon), keyEquivalent: ""); quit.target = self; m.addItem(quit)
        item.menu = m
    }

    @objc func openApp() { NSWorkspace.shared.open(base) }
    @objc func quitIcon() { exit(3) }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let bar = Bar()
app.delegate = bar
app.run()
