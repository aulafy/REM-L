import SwiftUI
import Contacts

/// Lee los Contactos de macOS (con permiso) y los deja como filas para el importador de clientes del servidor.
enum ContactsReader {
    static func authorize() async -> Bool {
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .authorized: return true
        case .notDetermined: return (try? await CNContactStore().requestAccess(for: .contacts)) ?? false
        default: return false
        }
    }

    static func fetch() throws -> [[String: String]] {
        let store = CNContactStore()
        let keys: [CNKeyDescriptor] = [CNContactGivenNameKey, CNContactFamilyNameKey, CNContactOrganizationNameKey, CNContactEmailAddressesKey, CNContactPhoneNumbersKey, CNContactPostalAddressesKey] as [CNKeyDescriptor]
        var out: [[String: String]] = []
        try store.enumerateContacts(with: CNContactFetchRequest(keysToFetch: keys)) { c, _ in
            let mobile = c.phoneNumbers.first { [CNLabelPhoneNumberMobile, CNLabelPhoneNumberiPhone].contains($0.label ?? "") } ?? c.phoneNumbers.first
            let addr = c.postalAddresses.first?.value
            let row: [String: String] = [
                "Nombre": c.givenName, "Apellidos": c.familyName, "Empresa": c.organizationName,
                "Email": c.emailAddresses.first.map { String($0.value) } ?? "",
                "Teléfono": mobile?.value.stringValue ?? "",
                "Dirección": addr?.street ?? "", "Población": addr?.city ?? "", "CP": addr?.postalCode ?? "",
            ]
            if row.values.contains(where: { !$0.isEmpty }) { out.append(row) }
        }
        return out
    }
}

struct ContactsImportView: View {
    @EnvironmentObject var model: AppModel
    @Loc var busy = false
    @Loc var message: String? = nil
    @Loc var error: String? = nil
    @Loc var rows: [[String: String]] = []
    @Loc var preview: [String: Any] = [:]
    @Loc var done = false

    var body: some View {
        GroupBox("Contactos de este Mac") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Trae tus contactos como clientes. Verás cuántos son nuevos y cuántos ya los tienes, y no se guarda nada hasta que confirmes.").font(.callout).foregroundStyle(.secondary)
                if preview.isEmpty {
                    Button { Task { await load() } } label: { Label("Leer mis Contactos…", systemImage: "person.crop.circle.badge.plus") }.disabled(busy)
                } else if done {
                    CheckRow(ok: true, text: message ?? "Importados")
                } else {
                    let ok = preview.int("ok"), dup = preview.int("duplicates"), bad = preview.int("failed")
                    CheckRow(ok: true, text: "\(rows.count) contactos leídos: \(ok) nuevos · \(dup) ya existen · \(bad) sin nombre o con error")
                    HStack {
                        Button("Importar \(ok) clientes") { Task { await commit() } }.buttonStyle(.borderedProminent).disabled(ok == 0 || busy)
                        Button("Cancelar") { preview = [:]; rows = [] }
                    }
                }
                if busy { ProgressView().controlSize(.small) }
                if let error { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red).font(.callout) }
            }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    func load() async {
        busy = true; error = nil; defer { busy = false }
        guard await ContactsReader.authorize() else { error = "No tengo permiso para leer los Contactos. Actívalo en Ajustes del Sistema → Privacidad y seguridad → Contactos."; return }
        do {
            rows = try ContactsReader.fetch()
            if rows.isEmpty { error = "No he encontrado contactos."; return }
            preview = try await model.api.dict("POST", "api/import/preview", ["kind": "clientes", "rows": rows], timeout: 60)
        } catch { self.error = error.localizedDescription }
    }
    func commit() async {
        busy = true; defer { busy = false }
        do {
            let r = try await model.api.dict("POST", "api/import/commit", ["kind": "clientes", "rows": rows, "source": "Contactos de macOS"], timeout: 120)
            message = "Importados \(r.int("imported")) clientes de tus Contactos. Si no es lo que esperabas, puedes deshacerlo en Ajustes → Datos y copias."
            done = true
        } catch { self.error = error.localizedDescription }
    }
}

/// Clave de la API de Claude para la ayuda con archivos raros (opcional, se guarda en el llavero).
struct ClaudeKeyView: View {
    @EnvironmentObject var model: AppModel
    @Loc var key = ""
    @Loc var on = false
    @Loc var error: String? = nil
    var body: some View {
        GroupBox("Ayuda de IA para archivos de otros programas (opcional)") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Si tu archivo es raro, la IA de Claude puede proponer cómo traducirlo. Usa **tu propia clave** de la API de Anthropic. Antes de enviar nada verás exactamente la muestra (enmascarada) que se enviaría.").font(.callout).foregroundStyle(.secondary)
                if on { CheckRow(ok: true, text: "Clave guardada en el llavero") }
                else {
                    HStack { SecureField("sk-ant-…", text: $key).textFieldStyle(.roundedBorder); Button("Guardar") { Task { await save() } }.disabled(key.count < 20) }
                }
                if let error { Text(error).font(.callout).foregroundStyle(.red) }
            }.padding(6).frame(maxWidth: .infinity, alignment: .leading)
        }
        .task { if let s = try? await model.api.dict("GET", "api/state") { on = s.obj("claude").bool("on") } }
    }
    func save() async {
        do { try await model.api.call("POST", "api/claude-key", ["key": key.trimmingCharacters(in: .whitespaces)]); on = true; key = ""; error = nil }
        catch { self.error = error.localizedDescription }
    }
}
