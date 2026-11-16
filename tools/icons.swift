// Erzeugt die App-Icons (PNG 180, 192, 512) ohne externe Bibliotheken.
// Aufruf:  swift tools/icons.swift
import AppKit

func zeichne(groesse: Int, pfad: String) {
    let s = CGFloat(groesse)
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: groesse, pixelsHigh: groesse,
                                     bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                     colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return }
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = ctx
    let cg = ctx.cgContext

    // Hintergrund: Farbverlauf Violett → Pink (volle Fläche, iOS rundet selbst ab)
    let farben = [NSColor(srgbRed: 0.486, green: 0.227, blue: 0.929, alpha: 1).cgColor,
                  NSColor(srgbRed: 0.859, green: 0.153, blue: 0.467, alpha: 1).cgColor] as CFArray
    let verlauf = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: farben, locations: [0, 1])!
    cg.drawLinearGradient(verlauf, start: CGPoint(x: 0, y: s), end: CGPoint(x: s, y: 0), options: [])

    // dezenter Lichtkreis oben rechts
    cg.setFillColor(NSColor(white: 1, alpha: 0.13).cgColor)
    cg.fillEllipse(in: CGRect(x: s * 0.52, y: s * 0.55, width: s * 0.75, height: s * 0.75))

    // Sprechblase
    let blase = CGRect(x: s * 0.16, y: s * 0.30, width: s * 0.68, height: s * 0.50)
    let pfadBlase = CGMutablePath()
    pfadBlase.addRoundedRect(in: blase, cornerWidth: s * 0.16, cornerHeight: s * 0.16)
    pfadBlase.move(to: CGPoint(x: s * 0.30, y: s * 0.33))
    pfadBlase.addLine(to: CGPoint(x: s * 0.24, y: s * 0.17))
    pfadBlase.addLine(to: CGPoint(x: s * 0.46, y: s * 0.31))
    pfadBlase.closeSubpath()
    cg.setShadow(offset: CGSize(width: 0, height: -s * 0.015), blur: s * 0.04, color: NSColor(white: 0, alpha: 0.25).cgColor)
    cg.setFillColor(NSColor.white.cgColor)
    cg.addPath(pfadBlase)
    cg.fillPath()
    cg.setShadow(offset: .zero, blur: 0, color: nil)

    // Fragezeichen in runder, fetter Schrift
    var schrift = NSFont.systemFont(ofSize: s * 0.40, weight: .black)
    if let rund = schrift.fontDescriptor.withDesign(.rounded), let f = NSFont(descriptor: rund, size: s * 0.40) { schrift = f }
    let attrs: [NSAttributedString.Key: Any] = [
        .font: schrift,
        .foregroundColor: NSColor(srgbRed: 0.486, green: 0.227, blue: 0.929, alpha: 1)
    ]
    let text = NSAttributedString(string: "?", attributes: attrs)
    let g = text.size()
    text.draw(at: CGPoint(x: blase.midX - g.width / 2, y: blase.midY - g.height / 2 + s * 0.005))

    // kleines Lenkrad unten rechts (selbst gezeichnet)
    let mitte = CGPoint(x: s * 0.77, y: s * 0.17)
    let r = s * 0.095
    cg.setStrokeColor(NSColor.white.cgColor)
    cg.setFillColor(NSColor.white.cgColor)
    cg.setLineWidth(s * 0.03)
    cg.strokeEllipse(in: CGRect(x: mitte.x - r, y: mitte.y - r, width: r * 2, height: r * 2))
    cg.fillEllipse(in: CGRect(x: mitte.x - r * 0.3, y: mitte.y - r * 0.3, width: r * 0.6, height: r * 0.6))
    cg.setLineWidth(s * 0.024)
    cg.setLineCap(.round)
    for winkel in [CGFloat.pi * 0.0, CGFloat.pi, CGFloat.pi * 1.5] {
        cg.move(to: mitte)
        cg.addLine(to: CGPoint(x: mitte.x + cos(winkel) * r, y: mitte.y + sin(winkel) * r))
    }
    cg.strokePath()

    NSGraphicsContext.restoreGraphicsState()
    let daten = rep.representation(using: .png, properties: [:])!
    try! daten.write(to: URL(fileURLWithPath: pfad))
    print("✓ \(pfad)")
}

let ordner = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icons"
for g in [180, 192, 512] { zeichne(groesse: g, pfad: "\(ordner)/icon-\(g).png") }
