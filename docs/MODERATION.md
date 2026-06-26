# Moderation

## Rollen und Zugriff

* Es gibt mindestens drei Rollen: `user`, `moderator`, `admin`
* Moderatoren und Admins erhalten Zugriff auf den Adminbereich
* Admins dürfen zusätzlich Benutzerrollen verwalten
* Zugriffskontrolle im Frontend erfolgt über `currentUser.role`

## Adminbereich

* Implementiert in `js/admin.js`
* Zeigt drei zentrale Moderationsbereiche:
  * offene Plattenvorschläge (`table_suggestions`)
  * zu prüfende Bilder (`table_images`)
  * eingehende Meldungen (`reports`)
* Die Seite lädt Benachrichtigungszähler und kann neue Einträge auditieren

## Plattenvorschläge

* Vorschläge können genehmigt oder abgelehnt werden
* Genehmigung erstellt einen neuen Eintrag in `tables`
* Ablehnung aktualisiert den Vorschlag auf `status = 'rejected'`

## Bilder-Moderation

* Bilddatensätze in `table_images` werden als `pending` geladen
* Moderatoren können Bilder prüfen und freigeben oder löschen
* Uploads von normalen Nutzern werden nicht sofort im UI sichtbar

## Meldungen

* `reports` werden im Adminbereich gesammelt
* Zu jedem Eintrag gibt es eine Vorschau und einen Meldegrund
* Moderatoren können über Meldungen entscheiden

## Moderationslog

* Es gibt eine Tabelle `moderation_log`
* Moderationsaktionen werden in dieser Tabelle angezeigt
* Die Log-Ansicht ist im Adminbereich verfügbar

## Benutzermanagement

* Admins können Nutzerrollen via RPC `set_user_role` ändern
* Die Rolle `moderator` kann von Admins vergeben und entzogen werden

## Unklar / prüfen

* Der genaue Workflow zur Bearbeitung einzelner `reports` ist aus dem aktuellen Code nicht vollständig ersichtlich.
