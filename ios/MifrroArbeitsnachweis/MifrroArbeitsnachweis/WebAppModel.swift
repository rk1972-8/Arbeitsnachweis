import Combine
import SwiftUI
import UIKit
import WebKit

@MainActor
final class WebAppModel: NSObject, ObservableObject {
    static let homeURL = URL(string: "https://mifrro-arbeitsnachweis.rk1972.chatgpt.site")!
    private static let allowedHost = homeURL.host

    @Published private(set) var isLoading = false
    @Published private(set) var progress = 0.0
    @Published private(set) var canGoBack = false
    @Published var errorMessage: String?

    let webView: WKWebView

    private var progressObservation: NSKeyValueObservation?
    private var backObservation: NSKeyValueObservation?
    private weak var refreshControl: UIRefreshControl?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = "MifrroArbeitsnachweisIOS/1.0"
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.scrollView.keyboardDismissMode = .interactive

        progressObservation = webView.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] webView, _ in
            Task { @MainActor in
                self?.progress = webView.estimatedProgress
            }
        }
        backObservation = webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] webView, _ in
            Task { @MainActor in
                self?.canGoBack = webView.canGoBack
            }
        }
    }

    func prepareForDisplay() {
        guard refreshControl == nil else { return }
        let control = UIRefreshControl()
        control.tintColor = UIColor(red: 13 / 255, green: 113 / 255, blue: 84 / 255, alpha: 1)
        control.addTarget(self, action: #selector(refreshFromPull(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = control
        refreshControl = control
        loadHomeIfNeeded()
    }

    func loadHomeIfNeeded() {
        guard webView.url == nil, !isLoading else { return }
        goHome()
    }

    func goHome() {
        errorMessage = nil
        webView.load(URLRequest(url: Self.homeURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    func goBack() {
        guard webView.canGoBack else { return }
        errorMessage = nil
        webView.goBack()
    }

    func reload() {
        errorMessage = nil
        if webView.url == nil {
            goHome()
        } else {
            webView.reload()
        }
    }

    func retry() {
        reload()
    }

    @objc private func refreshFromPull(_ sender: UIRefreshControl) {
        reload()
    }

    private func finishLoading() {
        isLoading = false
        refreshControl?.endRefreshing()
    }

    private func mayOpenInsideApp(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "about" || scheme == "data" || scheme == "blob" { return true }
        return scheme == "https" && url.host?.lowercased() == Self.allowedHost?.lowercased()
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url)
    }
}

extension WebAppModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        errorMessage = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finishLoading()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finishLoading()
        errorMessage = "Die Seite konnte nicht vollständig geladen werden. Bitte prüfe die Internetverbindung."
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finishLoading()
        errorMessage = "Die App konnte keine Verbindung zum Arbeitsnachweis herstellen."
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        reload()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if mayOpenInsideApp(url) {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
            return
        }

        openExternally(url)
        decisionHandler(.cancel)
    }
}

extension WebAppModel: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if mayOpenInsideApp(url) {
            webView.load(navigationAction.request)
        } else {
            openExternally(url)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        guard origin.host.lowercased() == Self.allowedHost?.lowercased() else {
            decisionHandler(.deny)
            return
        }
        decisionHandler(.prompt)
    }
}
