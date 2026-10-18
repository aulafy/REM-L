// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "RemNegocio",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "RemNegocio", path: "Sources/RemNegocio")
    ],
    swiftLanguageVersions: [.v5]
)
