import Foundation

struct APIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Cliente mínimo del servidor local. Habla con él con el token de la app (X-REM-Admin) y la cabecera X-REM que exige para escribir.
struct ServerAPI {
    let base: URL
    let token: String?

    @discardableResult
    func call(_ method: String, _ path: String, _ body: [String: Any]? = nil, timeout: TimeInterval = 30) async throws -> Any {
        var req = URLRequest(url: URL(string: path, relativeTo: base)!)
        req.httpMethod = method
        req.timeoutInterval = timeout
        req.setValue("1", forHTTPHeaderField: "X-REM")
        if let token { req.setValue(token, forHTTPHeaderField: "X-REM-Admin") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) ?? [:]
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if status >= 400 {
            let msg = (json as? [String: Any])?["error"] as? String ?? "Error \(status)"
            throw APIError(message: msg == "locked" ? "La aplicación está bloqueada con PIN." : msg)
        }
        return json
    }

    func dict(_ method: String, _ path: String, _ body: [String: Any]? = nil, timeout: TimeInterval = 30) async throws -> [String: Any] {
        (try await call(method, path, body, timeout: timeout)) as? [String: Any] ?? [:]
    }
}

extension Dictionary where Key == String, Value == Any {
    func str(_ k: String) -> String { (self[k] as? String) ?? "" }
    func int(_ k: String) -> Int { (self[k] as? Int) ?? Int((self[k] as? Double) ?? 0) }
    func bool(_ k: String) -> Bool { (self[k] as? Bool) ?? false }
    func obj(_ k: String) -> [String: Any] { (self[k] as? [String: Any]) ?? [:] }
    func list(_ k: String) -> [[String: Any]] { (self[k] as? [[String: Any]]) ?? [] }
}
