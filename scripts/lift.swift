// Subject lift via Vision's foreground instance mask — the "real matting model"
// the flood fill in src/lib/knockout.ts explicitly does not try to be.
// Usage: lift <input> <output.png>

import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: lift <input> <output.png>\n".data(using: .utf8)!)
    exit(2)
}

guard let source = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("cannot decode input\n".data(using: .utf8)!)
    exit(1)
}

// Honour EXIF orientation so a portrait phone shot isn't analysed sideways.
let image = source.oriented(forExifOrientation: 1)

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: image, options: [:])

do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}

guard let result = request.results?.first, !result.allInstances.isEmpty else {
    FileHandle.standardError.write("no foreground subject found\n".data(using: .utf8)!)
    exit(3)
}

// All instances, not just the most salient: a bag photographed with a charm
// hanging off it comes back as several instances and lifting only the largest
// would drop the charm.
let masked = try result.generateMaskedImage(
    ofInstances: result.allInstances,
    from: handler,
    croppedToInstancesExtent: true
)

let ci = CIImage(cvPixelBuffer: masked)
let context = CIContext()
guard let png = context.pngRepresentation(
    of: ci,
    format: .RGBA8,
    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
) else {
    FileHandle.standardError.write("cannot encode png\n".data(using: .utf8)!)
    exit(1)
}

try png.write(to: URL(fileURLWithPath: args[2]))
FileHandle.standardError.write("instances: \(result.allInstances.count)\n".data(using: .utf8)!)
