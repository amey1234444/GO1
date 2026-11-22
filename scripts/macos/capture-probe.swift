import AppKit
import CoreGraphics
import CoreImage
import CoreMedia
import ScreenCaptureKit

// Captures only the synthetic fixture rectangle selected by the Electron driver.
// No app exclusions are supplied to the display filter: that would invalidate the test.
func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
func markerCounts(_ image: CGImage) -> [String: Int] {
    let width = image.width, height = image.height
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    let ok = rgba.withUnsafeMutableBytes { bytes -> Bool in
        guard let context = CGContext(data: bytes.baseAddress, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return false }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return true
    }
    if !ok { return ["magenta": 0, "cyan": 0, "pixels": 0] }
    var magenta = 0, cyan = 0
    for i in stride(from: 0, to: rgba.count, by: 4) {
        let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
        if r > 200 && g < 80 && b > 200 { magenta += 1 }
        if r < 80 && g > 200 && b > 200 { cyan += 1 }
    }
    return ["magenta": magenta, "cyan": cyan, "pixels": width * height]
}
func saveImage(_ image: CGImage, _ path: URL) throws {
    guard let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
        throw NSError(domain: "GO1Probe", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot encode PNG"])
    }
    try data.write(to: path)
}
final class FrameCollector: NSObject, SCStreamOutput {
    let lock = NSLock()
    let context = CIContext()
    let output: URL
    var phase = "streamInitial"
    var samples: [String: [[String: Int]]] = [:]
    init(output: URL) { self.output = output }
    func nextPhase() { lock.lock(); phase = "streamRefreshed"; lock.unlock() }
    func snapshot() -> [String: Any] {
        lock.lock(); defer { lock.unlock() }
        var result: [String: Any] = [:]
        for name in ["streamInitial", "streamRefreshed"] {
            let frames = samples[name] ?? []
            result[name] = ["frames": frames.count,
                "maxMagenta": frames.map { $0["magenta"] ?? 0 }.max() ?? 0,
                "minCyan": frames.map { $0["cyan"] ?? 0 }.min() ?? 0,
                "samples": frames]
        }
        return result
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, buffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let rawStatus = attachments.first?[.status] as? Int,
              rawStatus == SCFrameStatus.complete.rawValue,
              let pixels = buffer.imageBuffer else { return }
        let ci = CIImage(cvPixelBuffer: pixels)
        guard let image = context.createCGImage(ci, from: ci.extent) else { return }
        let counts = markerCounts(image)
        lock.lock(); defer { lock.unlock() }
        if (samples[phase]?.count ?? 0) >= 60 { return }
        if samples[phase] == nil { try? saveImage(image, output.appendingPathComponent(phase + ".png")) }
        samples[phase, default: []].append(counts)
    }
}

@main struct CaptureProbe {
    @MainActor static func main() async {
        let args = CommandLine.arguments
        func value(_ key: String) -> String? {
            guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
            return args[i + 1]
        }
        let permission = CGPreflightScreenCaptureAccess()
        if !permission {
            if args.contains("--request-permission") { _ = CGRequestScreenCaptureAccess() }
            emit(["status": "blocked", "reason": "screen-recording-permission-not-granted",
                  "os": ProcessInfo.processInfo.operatingSystemVersionString, "receiverVerified": false])
            return
        }
        guard let outputPath = value("--output"), let displayValue = value("--display"),
              let displayID = UInt32(displayValue) else {
            emit(["status": "error", "reason": "Missing output/display arguments"]); return
        }
        do {
            let output = URL(fileURLWithPath: outputPath, isDirectory: true)
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            var content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
                throw NSError(domain: "GO1Probe", code: 2, userInfo: [NSLocalizedDescriptionKey: "Requested display unavailable"])
            }
            let markerID = value("--marker-window").flatMap { UInt32($0) } ?? 0
            let markerInfo = (CGWindowListCopyWindowInfo(.optionIncludingWindow, markerID) as? [[String: Any]])?.first ?? [:]
            let markerOnScreen = markerInfo[kCGWindowIsOnscreen as String] as? Bool ?? false
            let markerLayer = markerInfo[kCGWindowLayer as String] as? Int ?? -1
            let requestedWindow = value("--window").flatMap { UInt32($0) }
            func makeFilter() throws -> SCContentFilter {
                if let id = requestedWindow {
                    guard let window = content.windows.first(where: { $0.windowID == id }) else {
                        throw NSError(domain: "GO1Probe", code: 3, userInfo: [NSLocalizedDescriptionKey: "Requested window not enumerated"])
                    }
                    return SCContentFilter(desktopIndependentWindow: window)
                }
                return SCContentFilter(display: display, excludingWindows: [])
            }
            let configuration = SCStreamConfiguration()
            configuration.width = 800; configuration.height = 500
            configuration.showsCursor = false; configuration.capturesAudio = false
            configuration.minimumFrameInterval = CMTime(value: 1, timescale: 10)
            configuration.queueDepth = 3
            // Display coordinates, in points. The driver fills this rectangle with cyan.
            if requestedWindow == nil { configuration.sourceRect = CGRect(x: 40, y: 80, width: 800, height: 500) }
            let screenshot = try await SCScreenshotManager.captureImage(contentFilter: makeFilter(), configuration: configuration)
            try saveImage(screenshot, output.appendingPathComponent("screenshot.png"))
            let collector = FrameCollector(output: output)
            let stream = SCStream(filter: try makeFilter(), configuration: configuration, delegate: nil)
            try stream.addStreamOutput(collector, type: .screen, sampleHandlerQueue: DispatchQueue(label: "go1.capture-probe"))
            try await stream.startCapture()
            try await Task.sleep(nanoseconds: 2_000_000_000)
            collector.nextPhase()
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            try await stream.updateContentFilter(makeFilter())
            try await Task.sleep(nanoseconds: 2_000_000_000)
            try await stream.stopCapture()
            emit(["status": "captured", "os": ProcessInfo.processInfo.operatingSystemVersionString,
                  "captureAPI": "ScreenCaptureKit", "scope": requestedWindow == nil ? "display-region" : "selected-window",
                  "displayID": displayID, "markerOnScreen": markerOnScreen, "markerLayer": markerLayer, "screenshot": markerCounts(screenshot),
                  "stream": collector.snapshot(), "receiverVerified": false])
        } catch {
            emit(["status": "error", "reason": String(describing: error), "receiverVerified": false])
        }
    }
}
