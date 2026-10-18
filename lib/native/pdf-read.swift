// Lectura de PDF con PDFKit. Uso: pdf-read text <pdf>  |  pdf-read png <pdf> <salida.png> [página]
import Foundation
import PDFKit
import AppKit

let a = CommandLine.arguments
guard a.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: a[2])) else { FileHandle.standardError.write(Data("no se pudo abrir el PDF\n".utf8)); exit(2) }
if a[1] == "text" {
    var out = ""; for i in 0..<min(doc.pageCount, 4) { out += (doc.page(at: i)?.string ?? "") + "\n" }
    print(out)
} else if a[1] == "png", a.count >= 4 {
    let idx = a.count >= 5 ? max(0, (Int(a[4]) ?? 1) - 1) : 0
    guard let page = doc.page(at: min(idx, doc.pageCount - 1)) else { exit(3) }
    let b = page.bounds(for: .mediaBox), scale = min(3.0, 2000.0 / max(b.width, b.height))
    let size = NSSize(width: b.width * scale, height: b.height * scale)
    let img = page.thumbnail(of: size, for: .mediaBox)
    guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { exit(4) }
    try? png.write(to: URL(fileURLWithPath: a[3]))
}
