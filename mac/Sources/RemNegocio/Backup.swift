import SwiftUI
import AppKit
import UniformTypeIdentifiers

// MARK: 3 · Copias de seguridad
struct BackupStep: View {
    enum Phase { case intro, passphrase, code, running, done }
    struct Task_: Identifiable { let id: Int; let title: String; var state: Bool? = nil; var detail = "" }

    @EnvironmentObject var model: AppModel
    @Loc private var phase: Phase = .intro
    @Loc private var dest = ""
    @Loc private var pass1 = ""
    @Loc private var pass2 = ""
    @Loc private var code = ""
    @Loc private var confirmed = false
    @Loc private var busy = false
    @Loc private var error: String?
    @Loc private var tasks: [Task_] = []
    @Loc private var alreadyConfigured = false

    var internalDisk: Bool {
        guard !dest.isEmpty, let v = try? URL(fileURLWithPath: dest).resourceValues(forKeys: [.volumeIsInternalKey, .volumeIsRemovableKey]) else { return false }
        return v.volumeIsInternal == true && v.volumeIsRemovable != true && !dest.contains("Mobile Documents")
    }
    var passOK: Bool { pass1.count >= 8 && pass1 == pass2 }

    var body: some View {
        Group {
            switch phase {
            case .intro:
                StepFrame(title: "Copias de seguridad", subtitle: "Si algo le pasa a tu Mac, tus facturas y clientes siguen a salvo. Lo dejamos hecho y probado.", primary: dest.isEmpty ? "Elegir carpeta…" : "Continuar", primaryDisabled: false, error: error,
                          skip: alreadyConfigured ? "Ya está configurado" : nil, onPrimary: { if dest.isEmpty { chooseFolder() } else { phase = .passphrase } }) {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Se guardan **cifradas**: sin tu frase de paso nadie puede leerlas.", systemImage: "lock.doc")
                        Label("Una cada día, más otra al cerrar la aplicación. Se conservan las últimas semanas y meses.", systemImage: "calendar")
                        Label("Al final **comprobamos que se pueden restaurar**: una copia sin probar no es una garantía.", systemImage: "checkmark.shield")
                    }
                    GroupBox("¿Dónde guardamos las copias?") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Elige una carpeta en un **disco externo**, un NAS o **iCloud Drive**. Si el Mac se estropea o te lo roban, la copia sigue ahí.").font(.callout).foregroundStyle(.secondary)
                            if !dest.isEmpty { Label(dest, systemImage: "folder").lineLimit(2).truncationMode(.middle) }
                            if internalDisk { Label("Esta carpeta está en el disco del propio Mac: si el Mac se pierde, la copia también. Mejor un disco externo o iCloud Drive.", systemImage: "exclamationmark.triangle.fill").font(.callout).foregroundStyle(.orange) }
                            Button(dest.isEmpty ? "Elegir carpeta…" : "Cambiar carpeta…") { chooseFolder() }
                        }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            case .passphrase:
                StepFrame(title: "Tu frase de paso", subtitle: "Protege las copias. Elige una frase que recuerdes y que no uses en otro sitio.", primary: "Crear copias cifradas", primaryDisabled: !passOK, busy: busy, error: error, onPrimary: { await createKeys() }) {
                    Form { SecureField("Frase de paso (mínimo 8 caracteres)", text: $pass1); SecureField("Repítela", text: $pass2) }.textFieldStyle(.roundedBorder)
                    if !pass2.isEmpty && pass1 != pass2 { Text("Las dos frases no coinciden.").font(.callout).foregroundStyle(.red) }
                    Label("Si olvidas la frase, podrás abrir las copias con el **código de recuperación** que verás ahora. Sin ninguno de los dos, nadie puede abrirlas: ni nosotros.", systemImage: "info.circle").font(.callout).foregroundStyle(.secondary)
                }
            case .code:
                StepFrame(title: "Guarda tu código de recuperación", subtitle: "Es la segunda llave de tus copias. Solo lo verás ahora.", primary: "Probar las copias", primaryDisabled: !confirmed, busy: busy, error: error, showBack: false, onPrimary: { await runAndVerify() }) {
                    Text(code).font(.system(size: 26, weight: .semibold, design: .monospaced)).textSelection(.enabled).padding(18).frame(maxWidth: .infinity).background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                    HStack { Button("Guardar hoja de recuperación (PDF)…") { saveSheet() }; Button("Copiar") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(code, forType: .string) } }
                    Label("Imprímela o guárdala en un sitio distinto del Mac (cajón, gestor de contraseñas). Sirve para abrir tus copias en otro ordenador.", systemImage: "printer").font(.callout).foregroundStyle(.secondary)
                    Toggle("He guardado el código en un lugar seguro", isOn: $confirmed)
                }
            case .running, .done:
                StepFrame(title: phase == .done ? "Copias listas y probadas" : "Probando tus copias…", subtitle: phase == .done ? "Hemos hecho una copia, comprobado su contenido y simulado una restauración." : "Un momento: hacemos una copia y comprobamos que se puede abrir.", primary: "Continuar", primaryDisabled: phase != .done, busy: phase == .running, error: error, showBack: false,
                          onPrimary: { try? await model.api.call("POST", "api/setup", ["backup": true]); model.completed.insert(.backup); model.next() }) {
                    VStack(alignment: .leading, spacing: 12) { ForEach(tasks) { t in CheckRow(ok: t.state, text: t.title, detail: t.detail) } }
                    if phase == .done, error == nil { Label("A partir de ahora se hará una copia cada día y otra al cerrar la aplicación.", systemImage: "calendar.badge.checkmark").foregroundStyle(.green) }
                }
            }
        }
        .task {
            if let c = try? await model.api.dict("GET", "api/backup/config") {
                dest = c.str("dest"); alreadyConfigured = c.bool("configured") && !c.str("lastOk").isEmpty
                if c.bool("configured") && !c.str("dest").isEmpty { phase = .intro }
            }
        }
    }

    func chooseFolder() {
        let p = NSOpenPanel(); p.canChooseDirectories = true; p.canChooseFiles = false; p.canCreateDirectories = true; p.prompt = "Elegir"
        p.message = "Elige dónde guardar las copias de seguridad (mejor un disco externo o iCloud Drive)."
        if p.runModal() == .OK, let u = p.url { dest = u.appendingPathComponent("Copias REM Negocio").path; error = nil }
    }
    func createKeys() async {
        busy = true; error = nil; defer { busy = false }
        do {
            let r = try await model.api.dict("POST", "api/backup/setup", ["dest": dest, "passphrase": pass1])
            if let c = r["recoveryCode"] as? String { code = c; confirmed = false; phase = .code } else { phase = .code; code = "Ya estaba configurado"; confirmed = true }
        } catch { self.error = error.localizedDescription }
    }
    func runAndVerify() async {
        phase = .running; error = nil
        tasks = [Task_(id: 0, title: "Hacer una copia cifrada"), Task_(id: 1, title: "Comprobar que se puede abrir y está íntegra"), Task_(id: 2, title: "Simular una restauración")]
        do {
            let r = try await model.api.dict("POST", "api/backup/run", ["kind": "manual"], timeout: 300)
            tasks[0].state = true; tasks[0].detail = "\(r.str("name")) · \(ByteCountFormatter.string(fromByteCount: Int64(r.int("size")), countStyle: .file))"
            let v = try await model.api.dict("POST", "api/backup/verify", [:], timeout: 120)
            tasks[1].state = v.bool("ok"); tasks[1].detail = v.bool("ok") ? "Íntegra (\(v.str("integrity")))." : "La comprobación falló."
            let t = try await model.api.dict("POST", "api/backup/test-restore", [:], timeout: 120)
            let b = t.obj("backup")
            tasks[2].state = t.bool("ok"); tasks[2].detail = t.bool("ok") ? "La copia contiene \(b.int("clients")) clientes, \(b.int("documents")) documentos y \(b.int("expenses")) gastos." : "No coincide con lo esperado."
            if !(tasks.allSatisfy { $0.state == true }) { error = "Alguna comprobación no ha salido bien. Vuelve a intentarlo." }
        } catch { self.error = error.localizedDescription; if let i = tasks.firstIndex(where: { $0.state == nil }) { tasks[i].state = false } }
        phase = .done
    }
    func saveSheet() {
        let p = NSSavePanel(); p.allowedContentTypes = [.pdf]; p.nameFieldStringValue = "Hoja de recuperación REM Negocio.pdf"
        guard p.runModal() == .OK, let url = p.url else { return }
        let text = NSMutableAttributedString()
        func add(_ s: String, _ font: NSFont) { text.append(NSAttributedString(string: s + "\n\n", attributes: [.font: font])) }
        add("REM Negocio · Hoja de recuperación", .boldSystemFont(ofSize: 22))
        add("Código de recuperación de las copias de seguridad", .systemFont(ofSize: 13))
        add(code, .monospacedSystemFont(ofSize: 24, weight: .semibold))
        add("Fecha: \(Date().formatted(date: .long, time: .omitted))\nCarpeta de copias: \(dest)", .systemFont(ofSize: 12))
        add("Para qué sirve: abre tus copias cifradas si olvidas la frase de paso o las restauras en otro Mac. Guarda esta hoja lejos del ordenador (un cajón, una caja fuerte o tu gestor de contraseñas).\n\nSin la frase de paso ni este código, nadie puede abrir las copias, ni siquiera nosotros.", .systemFont(ofSize: 12))
        let tv = NSTextView(frame: NSRect(x: 0, y: 0, width: 595, height: 842)); tv.textContainerInset = NSSize(width: 56, height: 64); tv.textStorage?.setAttributedString(text); tv.isEditable = false
        try? tv.dataWithPDF(inside: tv.bounds).write(to: url)
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
}

// MARK: Salud de la instalación
struct HealthView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @Loc private var checks: [[String: Any]] = []
    @Loc private var level = "ok"
    @Loc private var cfg: [String: Any] = [:]
    @Loc private var busy = false
    @Loc private var msg = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text("Salud de tu instalación").font(.title2.bold()); Spacer(); Button("Cerrar") { dismiss() }.keyboardShortcut(.cancelAction) }
            HStack(spacing: 8) { Circle().fill(level == "ok" ? .green : level == "warn" ? .orange : .red).frame(width: 12, height: 12)
                Text(level == "ok" ? "Todo en orden" : level == "warn" ? "Hay cosas que mejorar" : "Hay algo que arreglar ya") }
            VStack(alignment: .leading, spacing: 12) { ForEach(Array(checks.enumerated()), id: \.offset) { _, c in CheckRow(ok: c.str("level") == "ok", text: c.str("title"), detail: c.str("detail")) } }
            Divider()
            HStack {
                Button("Hacer copia ahora") { run("api/backup/run", ["kind": "manual"], "Copia hecha y verificada.") }
                Button("Verificar la última") { run("api/backup/verify", [:], "La última copia está íntegra.") }
                Button("Probar restauración") { run("api/backup/test-restore", [:], "La restauración de prueba ha ido bien.") }
                Button("Abrir carpeta") { let d = cfg.str("dest"); if !d.isEmpty { NSWorkspace.shared.open(URL(fileURLWithPath: d)) } }.disabled(cfg.str("dest").isEmpty)
                if busy { ProgressView().controlSize(.small) }
            }
            if !msg.isEmpty { Text(msg).font(.callout).foregroundStyle(.secondary) }
        }.padding(24).frame(width: 640).task { await load() }
    }
    func load() async {
        if let h = try? await model.api.dict("GET", "api/backup/health") { checks = h.list("checks"); level = h.str("level") }
        cfg = (try? await model.api.dict("GET", "api/backup/config")) ?? [:]
    }
    func run(_ path: String, _ body: [String: Any], _ ok: String) {
        Task { busy = true; msg = ""; defer { busy = false }
            do { _ = try await model.api.call("POST", path, body, timeout: 300); msg = ok } catch { msg = error.localizedDescription }
            await load() }
    }
}

// MARK: Restaurar desde una copia
struct RestoreView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @Loc private var file = ""
    @Loc private var secret = ""
    @Loc private var busy = false
    @Loc private var msg = ""
    @Loc private var done = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Restaurar desde una copia").font(.title2.bold())
            Label("Sustituye tus datos actuales por los de la copia. Antes se guarda automáticamente una copia de lo que tienes ahora.", systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
            HStack { Text(file.isEmpty ? "Ningún archivo elegido" : file).lineLimit(1).truncationMode(.middle).foregroundStyle(file.isEmpty ? .secondary : .primary); Spacer(); Button("Elegir copia (.rembak)…") { choose() } }
            SecureField("Frase de paso o código de recuperación", text: $secret).textFieldStyle(.roundedBorder)
            if !msg.isEmpty { Text(msg).foregroundStyle(done ? .green : .red) }
            HStack { Spacer(); Button("Cerrar") { dismiss() }.keyboardShortcut(.cancelAction); Button("Restaurar") { Task { await restore() } }.disabled(file.isEmpty || secret.isEmpty || busy || done) .buttonStyle(.borderedProminent) }
        }.padding(24).frame(width: 560)
    }
    func choose() {
        let p = NSOpenPanel(); p.canChooseFiles = true; p.canChooseDirectories = false
        if let t = UTType(filenameExtension: "rembak") { p.allowedContentTypes = [t] }
        if p.runModal() == .OK, let u = p.url { file = u.path }
    }
    func restore() async {
        busy = true; msg = ""; defer { busy = false }
        do { let r = try await model.api.dict("POST", "api/backup/restore", ["file": file, "secret": secret], timeout: 300); let s = r.obj("summary"); done = true; msg = "Restaurada: \(s.int("clients")) clientes, \(s.int("invoices")) facturas. Reinicia la vista para verlo."; model.pendingHash = "#/hoy" }
        catch { msg = error.localizedDescription }
    }
}
