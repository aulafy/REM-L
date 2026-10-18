import SwiftUI
import AppKit

struct WizardView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) { Image(systemName: "briefcase.fill").foregroundStyle(.tint); Text("REM Negocio").font(.headline) }.padding(.bottom, 14)
                ForEach(Step.allCases) { s in
                    Button { model.go(s) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: model.completed.contains(s) ? "checkmark.circle.fill" : s.symbol).foregroundStyle(model.completed.contains(s) ? Color.green : Color.secondary).frame(width: 20)
                            Text(s.title).fontWeight(model.step == s ? .semibold : .regular)
                            Spacer()
                        }.padding(.vertical, 7).padding(.horizontal, 10)
                        .background(model.step == s ? Color.accentColor.opacity(0.14) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                    }.buttonStyle(.plain)
                }
                Spacer()
                Text("Puedes cerrar y volver cuando quieras: se guarda lo que llevas.").font(.caption).foregroundStyle(.secondary)
            }.padding(18).frame(width: 240).background(.regularMaterial)
            Divider()
            Group {
                switch model.step {
                case .welcome: WelcomeStep()
                case .business: BusinessStep()
                case .billing: BillingStep()
                case .backup: BackupStep()
                case .data: DataStep()
                case .access: AccessStep()
                case .done: DoneStep()
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Marco común de cada paso: título, explicación, contenido y botones.
struct StepFrame<Content: View>: View {
    @EnvironmentObject var model: AppModel
    let title: String, subtitle: String
    var primary: String = "Continuar"
    var primaryDisabled = false
    var busy = false
    var error: String? = nil
    var showBack = true
    var skip: String? = nil
    var onPrimary: () async -> Void
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(title).font(.largeTitle.bold())
                    Text(subtitle).font(.title3).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    content
                }.padding(.horizontal, 40).padding(.top, 36).padding(.bottom, 20).frame(maxWidth: 720, alignment: .leading)
            }
            Divider()
            HStack {
                if showBack && model.step != .welcome { Button("Atrás") { model.back() } }
                if let error { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red).font(.callout).lineLimit(3) }
                Spacer()
                if let skip { Button(skip) { model.next() }.disabled(busy) }
                if busy { ProgressView().controlSize(.small) }
                Button(primary) { Task { await onPrimary() } }.keyboardShortcut(.defaultAction).buttonStyle(.borderedProminent).disabled(primaryDisabled || busy)
            }.padding(.horizontal, 40).padding(.vertical, 14)
        }
    }
}

struct CheckRow: View {
    let ok: Bool?, text: String
    var detail: String = ""
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: ok == true ? "checkmark.circle.fill" : ok == false ? "exclamationmark.triangle.fill" : "circle.dotted").foregroundStyle(ok == true ? Color.green : ok == false ? Color.orange : Color.secondary)
            VStack(alignment: .leading, spacing: 2) { Text(text); if !detail.isEmpty { Text(detail).font(.callout).foregroundStyle(.secondary) } }
        }
    }
}

// MARK: 0 · Bienvenida
struct WelcomeStep: View {
    @EnvironmentObject var model: AppModel
    @Loc private var fileVault: Bool? = nil
    @Loc private var freeGB: Double = 0
    @Loc private var clients = 0
    var body: some View {
        StepFrame(title: "Te damos la bienvenida", subtitle: "En unos 15 minutos dejamos REM Negocio listo: tus datos, tus copias de seguridad y lo básico para empezar a facturar.", primary: "Empezar", onPrimary: { model.next() }) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Todo se queda en este Mac. No hay cuentas ni nube.", systemImage: "lock.shield")
                Label("La IA propone, tú decides: nada se envía solo.", systemImage: "hand.raised")
                Label("Puedes parar y retomarlo cuando quieras.", systemImage: "arrow.uturn.backward")
            }
            GroupBox("Comprobación de tu equipo") {
                VStack(alignment: .leading, spacing: 10) {
                    CheckRow(ok: true, text: "REM Negocio está funcionando", detail: "Servidor local en el puerto \(model.supervisor.port).")
                    CheckRow(ok: freeGB >= 5, text: String(format: "Espacio libre: %.1f GB", freeGB), detail: freeGB >= 5 ? "" : "Libera espacio: las copias y los adjuntos lo necesitan.")
                    CheckRow(ok: fileVault, text: fileVault == true ? "Disco cifrado con FileVault" : "FileVault no está activado", detail: fileVault == true ? "" : "Si pierdes el Mac, tus datos se podrían leer. Actívalo en Ajustes del Sistema → Privacidad y seguridad.")
                    if clients > 0 { CheckRow(ok: true, text: "Ya tienes datos de una versión anterior", detail: "\(clients) clientes. Se conservan y el asistente los usará.") }
                }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task {
            if let a = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory()), let f = a[.systemFreeSize] as? Int64 { freeGB = Double(f) / 1e9 }
            let out = runCapture("/usr/bin/fdesetup", ["status"]); fileVault = out.isEmpty ? nil : out.contains("On")
            if let c = try? await model.api.dict("GET", "api/state") { clients = (c["clients"] as? [Any])?.count ?? 0 }
        }
    }
}

// MARK: 1 · Tu negocio
struct BusinessStep: View {
    @EnvironmentObject var model: AppModel
    @Loc private var busy = false
    @Loc private var error: String?
    var f: Binding<BusinessForm> { $model.business }
    var nifOK: Bool { model.business.nif.isEmpty || NIF.isValid(model.business.nif) }
    var body: some View {
        StepFrame(title: "Tu negocio", subtitle: "Estos datos salen en tus facturas y presupuestos. Puedes cambiarlos después en Ajustes.", primaryDisabled: model.business.name.trimmingCharacters(in: .whitespaces).isEmpty || model.business.nif.isEmpty || !nifOK, busy: busy, error: error, onPrimary: save) {
            Picker("Eres…", selection: f.legalForm) { Text("Autónomo").tag("autonomo"); Text("Sociedad (SL, SA…)").tag("sociedad"); Text("Otro").tag("otro") }.pickerStyle(.segmented)
            Form {
                TextField("Nombre o razón social", text: f.name)
                VStack(alignment: .leading, spacing: 2) {
                    TextField("NIF / CIF", text: f.nif)
                    if !nifOK { Text("Este NIF no parece válido. Revisa la letra o los números.").font(.caption).foregroundStyle(.red) }
                }
                TextField("Dirección", text: f.address)
                HStack { TextField("C. P.", text: f.zip).frame(maxWidth: 110); TextField("Población", text: f.city) }
                TextField("Email de contacto", text: f.email)
                TextField("Teléfono", text: f.phone)
            }.textFieldStyle(.roundedBorder)
            HStack(spacing: 14) {
                if let img = logoImage { Image(nsImage: img).resizable().scaledToFit().frame(width: 64, height: 64).clipShape(RoundedRectangle(cornerRadius: 8)) }
                Button(model.business.logoDataURL.isEmpty ? "Añadir logotipo (opcional)…" : "Cambiar logotipo…") { chooseLogo() }
                if !model.business.logoDataURL.isEmpty { Button("Quitar") { model.business.logoDataURL = "" } }
            }
        }
    }
    var logoImage: NSImage? {
        guard let r = model.business.logoDataURL.range(of: "base64,"), let d = Data(base64Encoded: String(model.business.logoDataURL[r.upperBound...])) else { return nil }
        return NSImage(data: d)
    }
    func chooseLogo() {
        let p = NSOpenPanel(); p.allowedContentTypes = [.png, .jpeg]; p.canChooseFiles = true
        guard p.runModal() == .OK, let url = p.url, let img = NSImage(contentsOf: url) else { return }
        let maxW: CGFloat = 360, ratio = min(1, maxW / max(img.size.width, 1)), size = NSSize(width: img.size.width * ratio, height: img.size.height * ratio)
        let out = NSImage(size: size); out.lockFocus(); img.draw(in: NSRect(origin: .zero, size: size)); out.unlockFocus()
        guard let tiff = out.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { return }
        let s = "data:image/png;base64," + png.base64EncodedString()
        if s.count < 390_000 { model.business.logoDataURL = s } else { error = "El logotipo es demasiado grande. Prueba con una imagen más pequeña." }
    }
    func save() async {
        busy = true; error = nil; defer { busy = false }
        let b = model.business
        do {
            try await model.api.call("PUT", "api/settings", ["company_name": b.name, "company_nif": NIF.normalize(b.nif), "company_address": b.address, "company_zip": b.zip, "company_city": b.city, "company_email": b.email, "company_phone": b.phone, "legal_form": b.legalForm, "logo": b.logoDataURL])
            try await model.api.call("POST", "api/setup", ["business": true])
            model.completed.insert(.business); model.next()
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: 2 · Cómo facturas
struct BillingStep: View {
    @EnvironmentObject var model: AppModel
    @Loc private var busy = false
    @Loc private var error: String?
    static let presets: [(id: String, name: String, iva: Int, irpf: Int, days: Int, note: String)] = [
        ("servicios", "Servicios profesionales", 21, 15, 30, "Consultoría, diseño, formación… Retención del 15 % si facturas a empresas."),
        ("oficios", "Oficios y reformas", 21, 0, 30, "Fontanería, electricidad, reformas, mantenimiento."),
        ("comercio", "Comercio y venta", 21, 0, 0, "Tienda, venta de productos. Cobro habitual al momento."),
        ("hosteleria", "Hostelería y restauración", 10, 0, 0, "IVA reducido del 10 %."),
        ("otro", "Otro / lo configuro yo", 21, 0, 30, "Valores generales; ajusta lo que necesites."),
    ]
    var b: Binding<BillingForm> { $model.billing }
    var body: some View {
        StepFrame(title: "Cómo facturas", subtitle: "Elige tu tipo de actividad y rellenamos lo habitual. Todo se puede cambiar.", primaryDisabled: !(1...4).contains(model.billing.series.count) || model.billing.series.uppercased().contains(where: { !$0.isLetter }) || ["P", "R"].contains(model.billing.series.uppercased()), busy: busy, error: error, onPrimary: save) {
            VStack(spacing: 8) {
                ForEach(Self.presets, id: \.id) { p in
                    Button { model.billing.preset = p.id; model.billing.iva = p.iva; model.billing.irpf = p.irpf; model.billing.paymentDays = p.days } label: {
                        HStack { Image(systemName: model.billing.preset == p.id ? "largecircle.fill.circle" : "circle").foregroundStyle(.tint)
                            VStack(alignment: .leading) { Text(p.name).fontWeight(.medium); Text(p.note).font(.callout).foregroundStyle(.secondary) }; Spacer() }
                            .padding(10).background(model.billing.preset == p.id ? Color.accentColor.opacity(0.10) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.25)))
                    }.buttonStyle(.plain)
                }
            }
            Form {
                Picker("IVA habitual", selection: b.iva) { Text("21 % general").tag(21); Text("10 % reducido").tag(10); Text("4 % superreducido").tag(4); Text("0 % exento").tag(0) }
                Picker("Retención de IRPF", selection: b.irpf) { Text("Ninguna").tag(0); Text("7 %").tag(7); Text("15 %").tag(15); Text("19 %").tag(19) }
                Stepper("Plazo de pago: \(model.billing.paymentDays) días", value: b.paymentDays, in: 0...120, step: 5)
                Stepper("Validez de presupuestos: \(model.billing.quoteDays) días", value: b.quoteDays, in: 1...120, step: 5)
                TextField("Prefijo de tus facturas (1-4 letras)", text: b.series).textFieldStyle(.roundedBorder)
                TextField("Tarifa por hora en € (opcional)", text: b.hourlyRate).textFieldStyle(.roundedBorder)
                TextField("IBAN para los cobros (opcional)", text: b.iban).textFieldStyle(.roundedBorder)
                TextField("Pie de tus facturas (opcional)", text: b.footer, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(2...4)
            }
            Label("Esto es una herramienta de gestión interna: no es software de facturación certificado (Verifactu). Para facturas oficiales usa un programa conforme a la normativa.", systemImage: "info.circle").font(.callout).foregroundStyle(.secondary)
        }
    }
    func save() async {
        busy = true; error = nil; defer { busy = false }
        let x = model.billing
        let rate = Double(x.hourlyRate.replacingOccurrences(of: ",", with: ".")) ?? 0
        do {
            try await model.api.call("PUT", "api/settings", ["default_iva": x.iva, "default_irpf": x.irpf, "payment_days": x.paymentDays, "quote_days": x.quoteDays, "hourly_rate": Int((rate * 100).rounded()), "company_iban": x.iban, "invoice_footer": x.footer,
                                                              "invoice_series": [["prefix": x.series.uppercased(), "name": "General"]]])
            try await model.api.call("POST", "api/setup", ["billing": true])
            model.completed.insert(.billing); model.next()
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: 4 · Traer tus datos
struct DataStep: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        StepFrame(title: "Traer tus datos", subtitle: "Si vienes de otro programa o de una hoja de cálculo, trae tus clientes, facturas y gastos. Siempre con vista previa, copia antes de importar y botón de deshacer.", primary: "Continuar", onPrimary: { try? await model.api.call("POST", "api/setup", ["data": true]); model.completed.insert(.data); model.next() }) {
            ContactsImportView()
            GroupBox("Archivos de otros programas") {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Clientes (Google, Outlook, vCard, Excel), **facturas emitidas** y **gastos** desde CSV o Excel. Si el archivo es raro, la IA te ayuda a entenderlo.")
                    Button("Abrir el importador…") { Task { try? await model.api.call("POST", "api/setup", ["data": true]); model.completed.insert(.data); model.pendingHash = "#/ajustes"; await model.finish() } }
                }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
            }
            ClaudeKeyView()
            Text("Si empiezas de cero, pulsa Continuar: puedes importar cuando quieras desde Ajustes → Datos y copias.").font(.callout).foregroundStyle(.secondary)
        }
    }
}

// MARK: 5 · Acceso y arranque
struct AccessStep: View {
    @EnvironmentObject var model: AppModel
    @Loc private var pin = ""
    @Loc private var pin2 = ""
    @Loc private var pinOn = false
    @Loc private var login = LoginItem.enabled
    @Loc private var menubar = false
    @Loc private var menubarMsg = ""
    @Loc private var busy = false
    @Loc private var error: String?
    @Loc private var note: String?
    var body: some View {
        StepFrame(title: "Acceso y arranque", subtitle: "Protege la aplicación y decide si debe arrancar sola. Todo es opcional.", primary: "Continuar", busy: busy, error: error, onPrimary: {
            try? await model.api.call("POST", "api/setup", ["access": true]); model.completed.insert(.access); model.next()
        }) {
            GroupBox("PIN de acceso") {
                VStack(alignment: .leading, spacing: 10) {
                    if pinOn { CheckRow(ok: true, text: "PIN activado", detail: "Se pedirá al abrir la aplicación y tras un rato sin usarla.") }
                    else {
                        Text("Pide un PIN de 4 a 12 cifras para entrar. Protege de otras personas que usen tu Mac; no cifra los datos del disco.").font(.callout).foregroundStyle(.secondary)
                        HStack { SecureField("PIN", text: $pin).frame(width: 140); SecureField("Repítelo", text: $pin2).frame(width: 140)
                            Button("Activar PIN") { Task { await setPin() } }.disabled(pin.count < 4 || pin != pin2) }.textFieldStyle(.roundedBorder)
                    }
                }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
            }
            GroupBox("Arranque") {
                VStack(alignment: .leading, spacing: 10) {
                    Toggle("Abrir REM Negocio al iniciar sesión", isOn: Binding(get: { login }, set: { v in do { try LoginItem.set(v); login = v; error = nil } catch { self.error = "No se pudo cambiar el arranque automático: \(error.localizedDescription)" } }))
                    Text("Así los mensajes de Telegram y correo llegan aunque no la abras tú.").font(.callout).foregroundStyle(.secondary)
                    Toggle("Mostrar un icono en la barra de menús", isOn: Binding(get: { menubar }, set: { v in Task { await setMenubar(v) } }))
                    if !menubarMsg.isEmpty { Text(menubarMsg).font(.callout).foregroundStyle(.secondary) }
                }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
            }
            if let note { Label(note, systemImage: "checkmark.circle").foregroundStyle(.green) }
        }
        .task {
            if let s = try? await model.api.dict("GET", "api/state") { pinOn = s.obj("settings").bool("pin_on"); menubar = s.obj("startup").obj("menubar").bool("on") }
        }
    }
    func setPin() async {
        busy = true; defer { busy = false }
        do { try await model.api.call("POST", "api/pin", ["pin": pin]); pinOn = true; pin = ""; pin2 = ""; note = "PIN activado. Lo pedirá al abrir la interfaz web." ; error = nil }
        catch { self.error = error.localizedDescription }
    }
    func setMenubar(_ on: Bool) async {
        do { let r = try await model.api.dict("POST", "api/menubar-app", ["on": on]); menubar = r.bool("on"); menubarMsg = on && !r.bool("ready") ? "Preparando el icono…" : "" }
        catch { menubar = false; menubarMsg = error.localizedDescription }
    }
}

// MARK: 6 · Todo listo
struct DoneStep: View {
    @EnvironmentObject var model: AppModel
    @Loc private var items: [[String: Any]] = []
    var body: some View {
        StepFrame(title: "¡Todo listo!", subtitle: "Esto es lo que has dejado preparado. Si algo queda pendiente, puedes volver al paso correspondiente.", primary: "Abrir REM Negocio", onPrimary: { await model.finish() }) {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, c in
                    HStack {
                        CheckRow(ok: c.bool("done"), text: c.str("title"))
                        Spacer()
                        if !c.bool("done"), let st = step(for: c.str("id")) { Button("Completar") { model.go(st) } }
                    }
                }
            }
            GroupBox("Cómo se usa, en 4 líneas") {
                VStack(alignment: .leading, spacing: 8) {
                    Label("**Hoy** te dice qué necesita tu atención: cobros, mensajes y tareas.", systemImage: "house")
                    Label("**Clientes** y **Dinero**: crea presupuestos, factúralos, registra cobros y gastos.", systemImage: "eurosign.circle")
                    Label("**Mensajes** reúne Telegram y correo; el asistente prepara borradores y tú decides si enviar.", systemImage: "bubble.left.and.bubble.right")
                    Label("**Copias**: se hacen solas cada día en la carpeta que elegiste. En el menú Copias puedes hacer una ahora o ver la salud.", systemImage: "externaldrive")
                }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task { if let s = try? await model.api.dict("GET", "api/setup") { items = s.list("checklist") } }
    }
    func step(for id: String) -> Step? { ["business": .business, "billing": .billing, "backup": .backup, "access": .access, "data": .data][id] }
}
