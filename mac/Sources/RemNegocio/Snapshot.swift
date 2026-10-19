import SwiftUI
import AppKit

/// Modo de pruebas: `RemNegocio --snap-dir <carpeta>` arranca de verdad, recorre los pasos del asistente y guarda cada ventana en un PNG
/// (la propia app dibuja su ventana: no hace falta permiso de grabación de pantalla). Sale al terminar.
@MainActor
enum Snapshot {
    static var dir: String? { let a = CommandLine.arguments; if let i = a.firstIndex(of: "--snap-dir"), a.count > i + 1 { return a[i + 1] }; return nil }

    static func capture(_ name: String) {
        guard let dir, let base = NSApp.windows.first(where: { $0.contentView != nil && $0.isVisible && !$0.isSheet }), let win = Optional(base.attachedSheet ?? base), let v = win.contentView,
              let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { return }
        v.cacheDisplay(in: v.bounds, to: rep)
        if let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: "\(dir)/\(name).png")) }
    }

    static func tour() async {
        guard let dir else { return }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let model = AppModel.shared
        NSApp.appearance = NSAppearance(named: .aqua)
        for _ in 0..<60 { if case .wizard = model.phase { break }; try? await Task.sleep(nanoseconds: 250_000_000) }
        NSApp.windows.first?.setContentSize(NSSize(width: 1040, height: 720))
        for step in Step.allCases {
            model.step = step
            if step == .business { model.business = BusinessForm(name: "Estudio Marea Alta", nif: "B00000000", address: "Calle del Ejemplo 0", zip: "00000", city: "Ciudad Imaginaria", email: "hola@mareaalta.invalid", phone: "000 000 000") }
            if step == .done { model.completed = [.business, .billing] }
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            capture("paso-\(step.rawValue)-\(step)")
        }
        await model.finish()
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        capture("principal")
        model.showHealth = true
        try? await Task.sleep(nanoseconds: 1_800_000_000)
        capture("salud")
        model.showHealth = false; try? await Task.sleep(nanoseconds: 500_000_000)
        NSApp.terminate(nil)
    }
}
