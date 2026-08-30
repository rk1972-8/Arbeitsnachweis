import SwiftUI

enum AppTheme {
    static let brand = Color(red: 13 / 255, green: 113 / 255, blue: 84 / 255)
    static let brandDark = Color(red: 10 / 255, green: 77 / 255, blue: 59 / 255)
    static let mint = Color(red: 158 / 255, green: 226 / 255, blue: 199 / 255)
    static let surface = Color(red: 247 / 255, green: 249 / 255, blue: 248 / 255)
    static let ink = Color(red: 27 / 255, green: 38 / 255, blue: 33 / 255)
}

struct BrandMark: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.brand)
                .frame(width: 38, height: 38)

            Text("M")
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)

            Circle()
                .fill(AppTheme.mint)
                .frame(width: 9, height: 9)
                .offset(x: 2, y: -2)
        }
        .accessibilityHidden(true)
    }
}
