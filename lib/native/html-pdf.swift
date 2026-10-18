// HTML → PDF con el WebKit de macOS (paginado A4). Uso: html-pdf <entrada.html> <salida.pdf>
// Sin JavaScript y sin red: solo renderiza el HTML local que recibe.
import Cocoa
import WebKit

final class Job: NSObject, WKNavigationDelegate {
    let wv: WKWebView, win: NSWindow, out: URL
    init(html: URL, out: URL) {
        let cfg = WKWebViewConfiguration(); cfg.defaultWebpagePreferences.allowsContentJavaScript = false
        wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 794, height: 1123), configuration: cfg)
        win = NSWindow(contentRect: wv.frame, styleMask: [.borderless], backing: .buffered, defer: false); win.contentView = wv
        self.out = out; super.init(); wv.navigationDelegate = self
        wv.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.printNow() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { FileHandle.standardError.write(Data("\(error)\n".utf8)); exit(2) }
    func printNow() {
        let pi = NSPrintInfo(); pi.paperSize = NSSize(width: 595.28, height: 841.89)
        pi.topMargin = 40; pi.bottomMargin = 40; pi.leftMargin = 40; pi.rightMargin = 40
        pi.jobDisposition = .save; pi.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = out
        pi.isHorizontallyCentered = false; pi.isVerticallyCentered = false
        let op = wv.printOperation(with: pi); op.showsPrintPanel = false; op.showsProgressPanel = false
        op.runModal(for: win, delegate: self, didRun: #selector(done(_:success:contextInfo:)), contextInfo: nil)
    }
    @objc func done(_ op: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) { exit(success ? 0 : 3) }
}

let a = CommandLine.arguments
guard a.count >= 3 else { FileHandle.standardError.write(Data("uso: html-pdf entrada.html salida.pdf\n".utf8)); exit(1) }
let app = NSApplication.shared; app.setActivationPolicy(.prohibited)
let job = Job(html: URL(fileURLWithPath: a[1]), out: URL(fileURLWithPath: a[2]))
DispatchQueue.main.asyncAfter(deadline: .now() + 45) { FileHandle.standardError.write(Data("tiempo agotado\n".utf8)); exit(4) }
withExtendedLifetime(job) { app.run() }
