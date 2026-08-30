import SwiftUI

struct RootView: View {
    @StateObject private var browser = WebAppModel()

    var body: some View {
        ZStack {
            AppTheme.surface.ignoresSafeArea()

            VStack(spacing: 0) {
                AppHeader(browser: browser)

                if browser.isLoading {
                    ProgressView(value: browser.progress)
                        .progressViewStyle(.linear)
                        .tint(AppTheme.brand)
                        .frame(height: 2)
                        .accessibilityLabel("Seite wird geladen")
                }

                WebAppView(model: browser)
                    .accessibilityIdentifier("arbeitsnachweis.webview")
            }

            if let message = browser.errorMessage {
                ConnectionErrorView(message: message) {
                    browser.retry()
                }
            }
        }
        .preferredColorScheme(.light)
    }
}

private struct AppHeader: View {
    @ObservedObject var browser: WebAppModel

    var body: some View {
        HStack(spacing: 11) {
            BrandMark()

            VStack(alignment: .leading, spacing: 0) {
                Text("mifrro")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.ink)
                Text(browser.isLoading ? "Wird geladen …" : "Arbeitsnachweis")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            HeaderButton(title: "Zurück", systemImage: "chevron.backward", enabled: browser.canGoBack) {
                browser.goBack()
            }
            .accessibilityIdentifier("navigation.back")

            HeaderButton(title: "Start", systemImage: "house.fill") {
                browser.goHome()
            }
            .accessibilityIdentifier("navigation.home")

            HeaderButton(title: "Neu laden", systemImage: "arrow.clockwise") {
                browser.reload()
            }
            .accessibilityIdentifier("navigation.reload")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}

private struct HeaderButton: View {
    let title: String
    let systemImage: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .bold))
                .frame(width: 34, height: 34)
                .background(Color.white.opacity(enabled ? 0.96 : 0.55), in: Circle())
                .foregroundStyle(enabled ? AppTheme.brand : Color.secondary.opacity(0.45))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(title)
    }
}

private struct ConnectionErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(AppTheme.brand)

            Text("Verbindung unterbrochen")
                .font(.headline)
                .foregroundStyle(AppTheme.ink)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Erneut versuchen", action: retry)
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.brand)
                .accessibilityIdentifier("connection.retry")
        }
        .padding(24)
        .frame(maxWidth: 330)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 24, y: 10)
        .padding(24)
    }
}

#Preview {
    RootView()
}
