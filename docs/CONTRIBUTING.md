🤝 CONTRIBUTING.md

Contributing to PlattenTreff

Vielen Dank für dein Interesse, an PlattenTreff mitzuwirken!

PlattenTreff ist eine Community-App für Tischtennisspieler mit dem Ziel, öffentliche Tischtennisplatten zu dokumentieren und Menschen einfacher zum gemeinsamen Spielen zusammenzubringen.

⸻

Projektphilosophie

Bei jeder Änderung gilt:

* Community vor Gamification
* Mobile First
* Einfache Bedienung
* Hohe Performance
* Bestehende Komponenten bevorzugen
* Konsistentes Design

Neue Funktionen sollen bestehende Abläufe ergänzen und nicht unnötig komplizierter machen.

⸻

Vor jeder Änderung

Bitte zuerst folgende Dokumente lesen:

* README.md
* AGENTS.md
* PROJECT.md
* DESIGN.md

Diese Dokumente beschreiben die Architektur und Entwicklungsprinzipien des Projekts.

⸻

Coding Guidelines

Bitte beachte folgende Regeln:

* Bestehende Komponenten wiederverwenden
* Keine unnötigen Refactorings
* Nur notwendige Dateien ändern
* Verständliche Variablen- und Funktionsnamen verwenden
* Konsistenten Code schreiben
* Kommentare nur bei komplexer Logik hinzufügen

⸻

UI / UX

Vor jeder UI-Änderung prüfen:

* Funktioniert die Änderung auf Smartphones?
* Unterstützt sie den Dark Mode?
* Passt sie zum bestehenden Design?
* Ist sie intuitiv verständlich?

Neue UI-Muster sollten nur eingeführt werden, wenn sie einen klaren Mehrwert bieten.

⸻

Datenbank

Alle Änderungen an der Datenbank erfolgen ausschließlich über Supabase-Migrationen.

Keine direkten Änderungen an produktiven Tabellen.

⸻

Storage

Bilder werden ausschließlich über Supabase Storage verwaltet.

Keine lokalen Beispielbilder oder hart codierten Bildpfade verwenden.

⸻

Git Workflow

Empfohlener Ablauf:

1. Änderungen implementieren
2. Anwendung lokal testen
3. Git Diff prüfen
4. Commit erstellen
5. Push durchführen

Vor jedem Commit sicherstellen, dass keine unnötigen Dateien geändert wurden.

⸻

Pull Requests

Falls das Projekt zukünftig öffentlich entwickelt wird:

Ein Pull Request sollte:

* eine klar definierte Aufgabe lösen
* möglichst klein bleiben
* nachvollziehbar beschrieben sein
* keine unnötigen Änderungen enthalten

⸻

Tests

Vor dem Commit prüfen:

* Funktioniert die Änderung?
* Gibt es Konsolenfehler?
* Funktioniert der Dark Mode?
* Funktioniert die mobile Darstellung?
* Wurden bestehende Funktionen nicht beeinträchtigt?

⸻

KI-Unterstützung

KI-Agenten (z. B. Kilo Code, Claude Code oder andere) dürfen zur Entwicklung verwendet werden.

Dabei gelten folgende Regeln:

* AGENTS.md beachten
* Bestehende Architektur respektieren
* Keine großflächigen Refactorings ohne Absprache
* Keine Demo-Daten erzeugen
* Keine automatischen Pushes durchführen

⸻

Fragen oder Ideen

Neue Ideen sind jederzeit willkommen.

Vor größeren Änderungen empfiehlt es sich, zunächst die bestehende Architektur zu verstehen und zu prüfen, ob sich vorhandene Komponenten erweitern lassen.

⸻

Vielen Dank!

Jeder Beitrag – ob Bugfix, Verbesserung oder neue Idee – hilft dabei, PlattenTreff für die Tischtennis-Community weiterzuentwickeln.

🏓 Viel Spaß beim Entwickeln!