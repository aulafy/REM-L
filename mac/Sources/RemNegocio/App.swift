import SwiftUI
import AppKit

@main
struct RemNegocioApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var model = AppModel.shared


    var body: some Scene {
        WindowGroup("REM Negocio") {
            RootView()
                .environmentObject(model)
                .frame(minWidth: 980, minHeight: 680)
                .task { await model.boot() }
                .task { if Snapshot.dir != nil { await Snapshot.tour() } }
        }
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Copias") {
                Button("Hacer copia de seguridad ahora") { Task { await model.backupNow() } }.keyboardShortcut("b", modifiers: [.command])
                Button("Salud de tu instalación…") { model.showHealth = true }.keyboardShortcut("h", modifiers: [.command, .shift])
                Button("Restaurar desde una copia…") { model.showRestore = true }
            }
            CommandGroup(after: .appInfo) { Button("Abrir el asistente de puesta en marcha") { model.reopenWizard() }; Button("Buscar actualizaciones…") { Task { await Updates.check() } } }
        }
    }
}

extension AppModel { static let shared = AppModel() }

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    /// Al salir: una copia cifrada si hace falta (la carpeta puede no estar) y se para el servidor.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        Task { @MainActor in
            await AppModel.shared.backupOnQuit()
            AppModel.shared.supervisor.stop()
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        switch model.phase {
        case .launching:
            VStack(spacing: 14) { ProgressView(); Text("Arrancando REM Negocio…").foregroundStyle(.secondary) }.frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let msg):
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle").font(.system(size: 36)).foregroundStyle(.orange)
                Text("REM Negocio no ha podido arrancar").font(.title2.bold())
                Text(msg).multilineTextAlignment(.center).foregroundStyle(.secondary).frame(maxWidth: 520)
                HStack { Button("Reintentar") { model.phase = .launching; Task { await model.boot() } }.keyboardShortcut(.defaultAction)
                    Button("Abrir el registro") { NSWorkspace.shared.open(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/REM Negocio")) } }
            }.padding(40).frame(maxWidth: .infinity, maxHeight: .infinity)
        case .wizard:
            WizardView()
        case .main:
            MainView()
        }
    }
}

struct MainView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        WebView(url: model.supervisor.baseURL, hash: model.pendingHash)
            .toolbar {
                ToolbarItemGroup {
                    Button { model.reopenWizard() } label: { Label("Asistente", systemImage: "wand.and.stars") }.help("Abrir el asistente de puesta en marcha")
                    Button { Task { await model.backupNow() } } label: { Label("Copia ahora", systemImage: "externaldrive.badge.checkmark") }.help("Hacer una copia de seguridad cifrada ahora")
                    Button { model.showHealth = true } label: { Label("Salud", systemImage: "heart.text.square") }.help("Estado de copias, disco y seguridad")
                }
            }
            .sheet(isPresented: $model.showHealth) { HealthView().environmentObject(model) }
            .sheet(isPresented: $model.showRestore) { RestoreView().environmentObject(model) }
            .alert("Copias de seguridad", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) { Button("Vale") {} } message: { Text(model.notice ?? "") }
    }
}
