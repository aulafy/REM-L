import SwiftUI
import AppKit
import ServiceManagement

enum Step: Int, CaseIterable, Identifiable {
    case welcome, business, billing, backup, data, access, done
    var id: Int { rawValue }
    var title: String {
        switch self {
        case .welcome: return "Bienvenida"
        case .business: return "Tu negocio"
        case .billing: return "Cómo facturas"
        case .backup: return "Copias de seguridad"
        case .data: return "Traer tus datos"
        case .access: return "Acceso y arranque"
        case .done: return "Todo listo"
        }
    }
    var symbol: String {
        switch self {
        case .welcome: return "hand.wave"
        case .business: return "building.2"
        case .billing: return "eurosign.circle"
        case .backup: return "externaldrive.badge.checkmark"
        case .data: return "square.and.arrow.down"
        case .access: return "lock.shield"
        case .done: return "checkmark.seal"
        }
    }
}

@MainActor
final class AppModel: ObservableObject {
    enum Phase { case launching, wizard, main, failed(String) }

    @Published var phase: Phase = .launching
    @Published var step: Step = .welcome
    @Published var completed: Set<Step> = []
    @Published var showHealth = false
    @Published var showRestore = false
    @Published var notice: String?
    @Published var pendingHash = ""
    let supervisor = ServerSupervisor()
    var api: ServerAPI { supervisor.api }

    // Datos del formulario del negocio y la facturación (se conservan al ir adelante y atrás)
    @Published var business = BusinessForm()
    @Published var billing = BillingForm()

    func boot() async {
        await supervisor.start()
        if case .failed(let m) = supervisor.state { phase = .failed(m); return }
        do {
            let s = try await api.dict("GET", "api/setup")
            let st = s.obj("state")
            if !s.bool("finished") && st.str("finished").isEmpty { try await loadExisting(); phase = .wizard; if let n = st["step"] as? Int, let stp = Step(rawValue: n) { step = stp } }
            else { phase = .main }
            for c in s.list("checklist") where c.bool("done") {
                switch c.str("id") { case "business": completed.insert(.business); case "billing": completed.insert(.billing); case "backup": completed.insert(.backup); case "access": completed.insert(.access); case "data": completed.insert(.data); default: break }
            }
        } catch { phase = .failed(error.localizedDescription) }
    }

    /// Si ya hay datos (versión web anterior), se precargan en el formulario en vez de empezar de cero.
    func loadExisting() async throws {
        let state = try await api.dict("GET", "api/state")
        let s = state.obj("settings")
        business.name = s.str("company_name"); business.nif = s.str("company_nif"); business.address = s.str("company_address")
        business.zip = s.str("company_zip"); business.city = s.str("company_city"); business.email = s.str("company_email"); business.phone = s.str("company_phone")
        if !s.str("legal_form").isEmpty { business.legalForm = s.str("legal_form") }
        if let iva = s["default_iva"] as? Int { billing.iva = iva }
        if let irpf = s["default_irpf"] as? Int { billing.irpf = irpf }
        if let d = s["payment_days"] as? Int { billing.paymentDays = d }
        if let d = s["quote_days"] as? Int { billing.quoteDays = d }
        if let r = s["hourly_rate"] as? Int, r > 0 { billing.hourlyRate = String(format: "%.2f", Double(r) / 100).replacingOccurrences(of: ".", with: ",") }
        billing.iban = s.str("company_iban"); billing.footer = s.str("invoice_footer")
        if let series = s["invoice_series"] as? [[String: Any]], let p = series.first?["prefix"] as? String { billing.series = p }
    }

    func go(_ s: Step) {
        step = s
        Task { try? await api.call("POST", "api/setup", ["step": s.rawValue]) }
    }
    func next() { if let n = Step(rawValue: step.rawValue + 1) { go(n) } }
    func back() { if let n = Step(rawValue: step.rawValue - 1) { go(n) } }
    func finish() async {
        try? await api.call("PUT", "api/settings", ["onboarded": true])   // la bienvenida de la web ya no hace falta
        try? await api.call("POST", "api/setup", ["finished": true])
        if pendingHash.isEmpty, let st = try? await api.dict("GET", "api/setup"), !st.obj("state").bool("tour") { pendingHash = "#/hoy?tour=1" }   // primer recorrido guiado
        phase = .main
    }
    func reopenWizard() { step = .welcome; phase = .wizard }

    // MARK: copias
    func backupNow() async {
        do {
            let c = try await api.dict("GET", "api/backup/config")
            if !c.bool("configured") { notice = "Todavía no has configurado las copias. Abre el asistente (paso «Copias de seguridad»)."; return }
            let r = try await api.dict("POST", "api/backup/run", ["kind": "manual"], timeout: 300)
            notice = "Copia hecha y verificada: \(r.str("name"))"
        } catch { notice = "No se pudo hacer la copia: \(error.localizedDescription)" }
    }
    /// Al salir: si la última copia tiene más de una hora y la carpeta está disponible, se hace una.
    func backupOnQuit() async {
        guard case .running = supervisor.state else { return }
        guard let c = try? await api.dict("GET", "api/backup/config"), c.bool("configured"), c.bool("enabled"), c.bool("destOk") else { return }
        let last = ISO8601DateFormatter.parse(c.str("lastOk"))
        if let last, Date().timeIntervalSince(last) < 3600 { return }
        _ = try? await api.call("POST", "api/backup/run", ["kind": "daily"], timeout: 60)
    }
}

extension ISO8601DateFormatter {
    static func parse(_ s: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]; return f.date(from: s)
    }
}

struct BusinessForm {
    var name = "", nif = "", address = "", zip = "", city = "", email = "", phone = ""
    var legalForm = "autonomo"
    var logoDataURL = ""
}

struct BillingForm {
    var preset = "servicios"
    var iva = 21, irpf = 15, paymentDays = 30, quoteDays = 30
    var series = "F", hourlyRate = "", iban = "", footer = ""
}

enum LoginItem {
    static var enabled: Bool { SMAppService.mainApp.status == .enabled }
    static func set(_ on: Bool) throws { if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } }
}

func runCapture(_ path: String, _ args: [String]) -> String {
    let p = Process(); p.executableURL = URL(fileURLWithPath: path); p.arguments = args
    let pipe = Pipe(); p.standardOutput = pipe; p.standardError = Pipe()
    do { try p.run(); p.waitUntilExit() } catch { return "" }
    return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
}
