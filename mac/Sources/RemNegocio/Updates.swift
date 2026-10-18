import Foundation
import AppKit

/// Comprobación de actualizaciones a petición: consulta la última versión publicada en GitHub y abre la página de descarga.
/// Solo se conecta cuando la persona lo pide; no envía ningún dato (es una consulta pública de lectura).
enum Updates {
    static let repo = "aulafy/REM-L"
    static var current: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0" }

    /// Compara versiones tipo 1.2.10 (ignora una «v» inicial y sufijos como -beta).
    static func isNewer(_ a: String, than b: String) -> Bool {
        func parts(_ s: String) -> [Int] { s.trimmingCharacters(in: CharacterSet(charactersIn: "vV")).split(separator: "-").first.map { $0.split(separator: ".").map { Int($0) ?? 0 } } ?? [] }
        let x = parts(a), y = parts(b)
        for i in 0..<max(x.count, y.count) { let p = i < x.count ? x[i] : 0, q = i < y.count ? y[i] : 0; if p != q { return p > q } }
        return false
    }

    @MainActor static func check() async {
        let alert = NSAlert()
        do {
            var req = URLRequest(url: URL(string: "https://api.github.com/repos/\(repo)/releases/latest")!)
            req.timeoutInterval = 10; req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            let (data, resp) = try await URLSession.shared.data(for: req)
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if status == 404 { alert.messageText = "Estás al día"; alert.informativeText = "Todavía no hay versiones publicadas para descargar. Tienes la versión \(current)." }
            else if status == 200, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let tag = j["tag_name"] as? String {
                if isNewer(tag, than: current) {
                    alert.messageText = "Hay una versión nueva: \(tag)"; alert.informativeText = "Tienes la \(current). ¿Abrir la página de descarga?"
                    alert.addButton(withTitle: "Abrir la descarga"); alert.addButton(withTitle: "Ahora no")
                    if alert.runModal() == .alertFirstButtonReturn, let u = (j["html_url"] as? String).flatMap(URL.init(string:)) { NSWorkspace.shared.open(u) }
                    return
                }
                alert.messageText = "Estás al día"; alert.informativeText = "Tienes la versión \(current), la más reciente."
            } else { alert.messageText = "No se pudo comprobar"; alert.informativeText = "GitHub respondió \(status). Inténtalo más tarde." }
        } catch { alert.messageText = "No se pudo comprobar"; alert.informativeText = "Parece que no hay conexión a internet." }
        alert.runModal()
    }
}
