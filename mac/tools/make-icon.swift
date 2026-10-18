// Genera el icono de la app (AppIcon.iconset + vista previa) con Core Graphics: cuerpo «squircle» continuo, luz cenital, borde de cristal,
// monograma «R» trazado con volumen y sombra suave. Uso: swiftc -O make-icon.swift -o make-icon && ./make-icon AppIcon.iconset
import AppKit
import CoreGraphics

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
let cs = CGColorSpace(name: CGColorSpace.displayP3) ?? CGColorSpaceCreateDeviceRGB()
func col(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor { CGColor(colorSpace: cs, components: [r, g, b, a])! }
func grad(_ stops: [(CGFloat, CGColor)]) -> CGGradient { CGGradient(colorsSpace: cs, colors: stops.map { $0.1 } as CFArray, locations: stops.map { $0.0 })! }

// Superelipse (n = 5): la curva continua de los iconos de Apple, más suave que un rectángulo con esquinas redondas
func squircle(_ r: CGRect, n: CGFloat = 5) -> CGPath {
    let p = CGMutablePath(), a = r.width / 2, b = r.height / 2, c = CGPoint(x: r.midX, y: r.midY), steps = 360
    for i in 0...steps {
        let t = CGFloat(i) / CGFloat(steps) * 2 * .pi, ct = cos(t), st = sin(t)
        let x = c.x + a * pow(abs(ct), 2 / n) * (ct < 0 ? -1 : 1), y = c.y + b * pow(abs(st), 2 / n) * (st < 0 ? -1 : 1)
        i == 0 ? p.move(to: CGPoint(x: x, y: y)) : p.addLine(to: CGPoint(x: x, y: y))
    }
    p.closeSubpath(); return p
}

// Monograma «R» (coordenadas de un lienzo de 1024, origen abajo-izquierda)
func monogram() -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 386, y: 290)); p.addLine(to: CGPoint(x: 386, y: 740))                       // asta
    p.move(to: CGPoint(x: 386, y: 740)); p.addLine(to: CGPoint(x: 556, y: 740))                       // parte alta del bucle
    p.addArc(center: CGPoint(x: 556, y: 642), radius: 98, startAngle: .pi / 2, endAngle: -.pi / 2, clockwise: true)
    p.addLine(to: CGPoint(x: 386, y: 544))                                                            // cierre del bucle
    p.move(to: CGPoint(x: 530, y: 544)); p.addLine(to: CGPoint(x: 694, y: 290))                       // pierna
    return p
}

func render(_ px: Int, flat: Bool = false) -> Data {
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: CGFloat(px) / 1024, y: CGFloat(px) / 1024); ctx.setAllowsAntialiasing(true); ctx.interpolationQuality = .high
    let body = flat ? CGRect(x: 0, y: 0, width: 1024, height: 1024) : CGRect(x: 100, y: 100, width: 824, height: 824), shape: CGPath = flat ? CGPath(rect: body, transform: nil) : squircle(body)
    ctx.translateBy(x: flat ? 0 : 0, y: 0)

    // 1) sombra de contacto y sombra ambiente
    if !flat { ctx.saveGState(); ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 30, color: col(0, 0, 0.1, 0.42)); ctx.addPath(shape); ctx.setFillColor(col(0.1, 0.2, 0.5)); ctx.fillPath(); ctx.restoreGState() }

    // 2) cuerpo: degradado profundo de azul
    ctx.saveGState(); ctx.addPath(shape); ctx.clip()
    ctx.drawLinearGradient(grad([(0, col(0.43, 0.62, 0.98)), (0.45, col(0.22, 0.42, 0.88)), (1, col(0.09, 0.19, 0.58))]), start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100), options: [])
    // resplandor cálido abajo a la derecha y luz fría arriba a la izquierda
    ctx.drawRadialGradient(grad([(0, col(1, 0.66, 0.40, 0.22)), (1, col(1, 0.66, 0.40, 0))]), startCenter: CGPoint(x: 800, y: 170), startRadius: 0, endCenter: CGPoint(x: 800, y: 170), endRadius: 520, options: [])
    ctx.drawRadialGradient(grad([(0, col(1, 1, 1, 0.34)), (1, col(1, 1, 1, 0))]), startCenter: CGPoint(x: 330, y: 900), startRadius: 0, endCenter: CGPoint(x: 330, y: 900), endRadius: 560, options: [])
    // brillo especular superior (media luna de cristal)
    let gloss = CGMutablePath(); gloss.addRect(CGRect(x: 100, y: 560, width: 824, height: 364)); ctx.saveGState(); ctx.addPath(gloss); ctx.clip()
    ctx.drawLinearGradient(grad([(0, col(1, 1, 1, 0.16)), (1, col(1, 1, 1, 0.0))]), start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 560), options: []); ctx.restoreGState()
    ctx.restoreGState()

    // 3) borde de luz (rim) y borde oscuro exterior
    if !flat { ctx.saveGState(); ctx.addPath(shape); ctx.setLineWidth(3.5); ctx.replacePathWithStrokedPath(); ctx.clip()
    ctx.drawLinearGradient(grad([(0, col(1, 1, 1, 0.75)), (0.5, col(1, 1, 1, 0.10)), (1, col(0.6, 0.8, 1, 0.35))]), start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100), options: []); ctx.restoreGState() }

    // 4) monograma: sombra proyectada, cuerpo con degradado y luz interior
    let r = monogram(), thick: CGFloat = 96
    ctx.saveGState(); ctx.setShadow(offset: CGSize(width: 0, height: -22), blur: 34, color: col(0.02, 0.07, 0.30, 0.55)); ctx.setLineCap(.round); ctx.setLineJoin(.round); ctx.setLineWidth(thick); ctx.setStrokeColor(col(1, 1, 1)); ctx.addPath(r); ctx.strokePath(); ctx.restoreGState()
    ctx.saveGState(); ctx.addPath(r); ctx.setLineCap(.round); ctx.setLineJoin(.round); ctx.setLineWidth(thick); ctx.replacePathWithStrokedPath(); ctx.clip()
    ctx.drawLinearGradient(grad([(0, col(1, 1, 1)), (0.55, col(0.93, 0.96, 1)), (1, col(0.74, 0.84, 1))]), start: CGPoint(x: 512, y: 760), end: CGPoint(x: 512, y: 215), options: [])
    // luz interior (arista superior del trazo)
    ctx.saveGState(); ctx.addPath(r); ctx.setLineCap(.round); ctx.setLineJoin(.round); ctx.setLineWidth(thick); ctx.replacePathWithStrokedPath(); ctx.clip()
    ctx.translateBy(x: 0, y: -7); ctx.addPath(r); ctx.setLineWidth(thick); ctx.replacePathWithStrokedPath(); ctx.restoreGState()

    let img = ctx.makeImage()!, rep = NSBitmapImageRep(cgImage: img); return rep.representation(using: .png, properties: [:])!
}

for (n, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128), ("128x128@2x", 256), ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    try? render(px).write(to: URL(fileURLWithPath: "\(out)/icon_\(n).png"))
}
try? render(1024).write(to: URL(fileURLWithPath: "\(out)/../AppIcon-1024.png"))
try? render(1024, flat: true).write(to: URL(fileURLWithPath: "\(out)/../AppIcon-flat-1024.png"))
