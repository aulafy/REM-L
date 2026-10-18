import SwiftUI

/// Estado local de una vista (equivalente a @State). En macOS 26+ `@State` es una macro que necesita el plugin SwiftUIMacros de Xcode;
/// este envoltorio funciona también con las Command Line Tools solas.
final class LocBox<V>: ObservableObject {
    @Published var value: V
    init(_ v: V) { value = v }
}

@propertyWrapper
struct Loc<Value>: DynamicProperty {
    @StateObject private var box: LocBox<Value>
    init(wrappedValue: Value) { _box = StateObject(wrappedValue: LocBox(wrappedValue)) }
    var wrappedValue: Value {
        get { box.value }
        nonmutating set { box.value = newValue }
    }
    var projectedValue: Binding<Value> { Binding(get: { box.value }, set: { box.value = $0 }) }
}
