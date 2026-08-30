import SwiftUI
import WebKit

struct WebAppView: UIViewRepresentable {
    let model: WebAppModel

    func makeUIView(context: Context) -> WKWebView {
        model.prepareForDisplay()
        return model.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        model.loadHomeIfNeeded()
    }
}
