// OCR local con Apple Vision. Uso: vision-ocr <imagen>  → imprime una línea de texto por renglón reconocido.
import Foundation
import Vision
import ImageIO

guard CommandLine.arguments.count > 1,
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { FileHandle.standardError.write(Data("no se pudo abrir la imagen\n".utf8)); exit(2) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true
req.recognitionLanguages = ["es-ES", "en-US"]
if CommandLine.arguments.contains("--cpu") { req.usesCPUOnly = true }
req.revision = VNRecognizeTextRequestRevision3
do { try VNImageRequestHandler(cgImage: img, options: [:]).perform([req]) } catch { FileHandle.standardError.write(Data("\(error)\n".utf8)); exit(3) }
let obs = (req.results ?? []).sorted { a, b in abs(a.boundingBox.midY - b.boundingBox.midY) > 0.012 ? a.boundingBox.midY > b.boundingBox.midY : a.boundingBox.minX < b.boundingBox.minX }
for o in obs { if let t = o.topCandidates(1).first?.string { print(t) } }
