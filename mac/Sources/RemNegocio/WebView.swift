import SwiftUI
import WebKit

/// La interfaz web de REM Negocio dentro de la ventana de la app.
struct WebView: NSViewRepresentable {
    let url: URL
    var hash: String = ""

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        let v = WKWebView(frame: .zero, configuration: cfg)
        v.navigationDelegate = context.coordinator
        v.uiDelegate = context.coordinator
        v.allowsBackForwardNavigationGestures = false
        v.setValue(false, forKey: "drawsBackground")
        var u = url; if !hash.isEmpty, let withHash = URL(string: url.absoluteString + hash) { u = withHash }
        v.load(URLRequest(url: u))
        context.coordinator.view = v
        return v
    }
    func updateNSView(_ v: WKWebView, context: Context) {
        if context.coordinator.lastHash != hash, !hash.isEmpty { context.coordinator.lastHash = hash; v.evaluateJavaScript("location.hash = '\(hash)'") }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        var view: WKWebView?
        var lastHash = ""
        private var destinations: [ObjectIdentifier: URL] = [:]

        // Enlaces externos → navegador; descargas → carpeta Descargas
        func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.shouldPerformDownload { decisionHandler(.download); return }
            if let u = action.request.url, let host = u.host, !["127.0.0.1", "localhost"].contains(host), u.scheme?.hasPrefix("http") == true {
                NSWorkspace.shared.open(u); decisionHandler(.cancel); return
            }
            decisionHandler(.allow)
        }
        func webView(_ w: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            if let http = response.response as? HTTPURLResponse, let cd = http.value(forHTTPHeaderField: "Content-Disposition"), cd.lowercased().hasPrefix("attachment") { decisionHandler(.download); return }
            decisionHandler(response.canShowMIMEType ? .allow : .download)
        }
        func webView(_ w: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
        func webView(_ w: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
            let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
            var dest = dir.appendingPathComponent(suggestedFilename.isEmpty ? "REM Negocio" : suggestedFilename)
            var n = 1
            let base = dest.deletingPathExtension().lastPathComponent, ext = dest.pathExtension
            while FileManager.default.fileExists(atPath: dest.path) { n += 1; dest = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)") }
            destinations[ObjectIdentifier(download)] = dest
            completionHandler(dest)
        }
        func downloadDidFinish(_ download: WKDownload) {
            if let d = destinations.removeValue(forKey: ObjectIdentifier(download)) { NSWorkspace.shared.activateFileViewerSelecting([d]) }
        }

        // <input type="file"> necesita un selector de archivos nativo
        func webView(_ w: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
            let p = NSOpenPanel(); p.canChooseFiles = true; p.canChooseDirectories = parameters.allowsDirectories; p.allowsMultipleSelection = parameters.allowsMultipleSelection
            p.begin { r in completionHandler(r == .OK ? p.urls : nil) }
        }
        // alert/confirm de la web
        func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "Aceptar"); a.addButton(withTitle: "Cancelar"); completionHandler(a.runModal() == .alertFirstButtonReturn)
        }
        func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
        }
    }
}
