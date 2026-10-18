// Genera el icono de la app (AppIcon.iconset) con AppKit: un cuadrado redondeado grafito con un maletín y una franja naranja.
import AppKit
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
func render(_ px: Int) -> Data {
    let s = CGFloat(px), img = NSImage(size: NSSize(width: s, height: s))
    img.lockFocus()
    let r = NSRect(x: s * 0.06, y: s * 0.06, width: s * 0.88, height: s * 0.88), path = NSBezierPath(roundedRect: r, xRadius: s * 0.2, yRadius: s * 0.2)
    NSGradient(starting: NSColor(red: 0.20, green: 0.23, blue: 0.29, alpha: 1), ending: NSColor(red: 0.12, green: 0.14, blue: 0.18, alpha: 1))!.draw(in: path, angle: -90)
    NSColor(red: 0.90, green: 0.54, blue: 0.24, alpha: 1).setFill(); NSBezierPath(rect: NSRect(x: r.minX, y: r.minY, width: r.width, height: s * 0.05)).fill()
    if let sym = NSImage(systemSymbolName: "briefcase.fill", accessibilityDescription: nil)?.withSymbolConfiguration(.init(pointSize: s * 0.42, weight: .semibold)) {
        let tinted = NSImage(size: sym.size); tinted.lockFocus(); sym.draw(at: .zero, from: .zero, operation: .sourceOver, fraction: 1); NSColor.white.set(); NSRect(origin: .zero, size: sym.size).fill(using: .sourceAtop); tinted.unlockFocus()
        tinted.draw(in: NSRect(x: (s - sym.size.width) / 2, y: (s - sym.size.height) / 2 + s * 0.02, width: sym.size.width, height: sym.size.height))
    }
    img.unlockFocus()
    let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!; return rep.representation(using: .png, properties: [:])!
}
for (n, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128), ("128x128@2x", 256), ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    try? render(px).write(to: URL(fileURLWithPath: "\(out)/icon_\(n).png"))
}
