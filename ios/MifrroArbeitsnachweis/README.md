# Mifrro Arbeitsnachweis für iOS

Native iPhone-App für die bestehende Mifrro-Arbeitsnachweis-Anwendung.

## Öffnen

1. `MifrroArbeitsnachweis.xcodeproj` in Xcode öffnen.
2. Unter **Signing & Capabilities** das eigene Apple-Developer-Team auswählen.
3. Ein iPhone oder einen Simulator auswählen und die App starten.

## Verteilung

Für Mitarbeiter empfiehlt sich TestFlight. Dazu wird in Xcode ein Archiv erstellt und nach App Store Connect hochgeladen. Die Mitarbeiter installieren anschließend TestFlight und nehmen die Einladung an.

## Technik

- Mindestversion: iOS 16
- Bundle-ID: `de.mifrro.arbeitsnachweis`
- Produktivadresse: `https://mifrro-arbeitsnachweis.rk1972.chatgpt.site`
- Anmeldung und Sitzung bleiben im sicheren WebKit-Datenspeicher des Geräts erhalten.
- Das App-Symbol wird beim Bauen automatisch aus dem vorhandenen Mifrro-Symbol der Web-App erzeugt.
