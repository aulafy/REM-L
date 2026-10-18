import Foundation

/// Misma comprobación que public/calc.js: DNI/NIE con letra de control; CIF solo por formato.
enum NIF {
    static func normalize(_ s: String) -> String {
        s.uppercased().filter { !" .-".contains($0) }
    }
    static func isValid(_ raw: String) -> Bool {
        let v = normalize(raw)
        if v.isEmpty { return false }
        let letters = Array("TRWAGMYFPDXBNJZSQVHLCKE")
        let chars = Array(v)
        func isDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }
        if v.range(of: "^[0-9]{8}[A-Z]$", options: .regularExpression) != nil {
            return letters[Int(String(chars[0..<8]))! % 23] == chars[8]
        }
        if v.range(of: "^[XYZ][0-9]{7}[A-Z]$", options: .regularExpression) != nil {
            let n = String("XYZ".firstIndex(of: chars[0])!.utf16Offset(in: "XYZ")) + String(chars[1..<8])
            return letters[Int(n)! % 23] == chars[8]
        }
        return v.range(of: "^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$", options: .regularExpression) != nil
    }
}
