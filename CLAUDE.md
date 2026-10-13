# HP Message : consignes pour Claude

App de bureau personnelle (Windows 11 + Linux, Electron 44) qui affiche les versions web officielles de 7 messageries dans une seule fenêtre. L'intention et les limites sont dans [PLAYBOOK_yougo_msg.md](PLAYBOOK_yougo_msg.md) ; l'usage, les commandes et la structure dans [README.md](README.md). Juger tout changement d'après les 4 critères de réussite du playbook, et garder la simplicité avant tout.

## Commandes

- `npm start` : lance l'app sur le **vrai profil** de l'utilisateur (ses sessions). Ne jamais l'utiliser pour tester.
- `npm test` : tests unitaires (`node:test`) des modules sans Electron.
- `npm run smoke` : lance la vraie app avec un profil temporaire, sur les vraies pages déconnectées, puis vérifie qu'elle se ferme vite. Environ 2 min, réseau requis.
- `npm run dist` : installeur Windows (ou `.deb` + AppImage sous Linux), dans `dist/`.

Avant de conclure un changement : `npm test`, plus `npm run smoke` dès que le process principal, un preload ou une page est touché.

## Invariants (à ne pas casser)

- **Identité = sessions de l'utilisateur.** `productName` « HP Message », `build.appId` `com.hp.message`, `name` `hp-message` et `desktopName` fixent le dossier de profil, l'installation et le raccourci. Les changer fait perdre toutes les connexions. Une partition s'appelle `persist:<accountId>`. Un id de compte ne change jamais : le premier compte d'une messagerie porte l'id de la messagerie (reprise du POC), les suivants `<service>-<base36>`. Une partition retirée n'est effacée qu'au démarrage suivant.
- **Vues masquées.** On masque une vue uniquement avec `setVisible(false)`, pour que la page soit `hidden` et ne marque rien comme lu. Jamais `backgroundThrottling: false`, jamais une vue posée par-dessus une autre, toujours `focusOnNavigation: false`.
- **Preload des messageries** (`src/preload/service.js`).
  - Il est enregistré au niveau de la session, ce qui couvre aussi les fenêtres d'appel.
  - Rien n'est posé sur `window` : le pont passe en arguments de `contextBridge.executeInMainWorld`.
  - Seulement des API Web, car Electron 45 retire les shims Node des preloads sandboxés.
  - Electron n'affiche jamais les notifications de service worker et n'a pas de Push : l'interception dans la page est la seule voie.
- **Piège Windows du processus fantôme.** Trois mécanismes sont à garder ensemble : le neutraliseur de passkey silencieuse (get et create conditionnels), la fermeture de toutes les pages avant de quitter (`closeAllPages`) et le garde-fou externe de `main.js`.
- **IPC.** Chaque canal vérifie son émetteur : la barre latérale pour `hub:*`, le compte et l'origine de la frame pour `service:*`. `service:config` est synchrone et doit toujours renseigner `returnValue`.
- **Cookies non chiffrés** (fusible `enableCookieEncryption: false`), ce qui évite toute dépendance au trousseau Linux. Ne pas activer ce fusible : la bascule est à sens unique et déconnecterait tous les comptes.
- **Rien ne sort de la machine.** Pas de serveur ni de télémétrie. Le journal ne contient jamais le texte des messages.

## Tests et expériences

- Toujours un profil isolé : variable `HP_MESSAGE_USER_DATA`, ou `app.setPath('userData', …)` avant `ready` dans un script. Ne jamais toucher à `%APPDATA%\HP Message` ni à `~/.config/HP Message`.
- Ne pas afficher de vraies notifications en développement : depuis Electron 41, la première notification crée un raccourci `Electron.lnk` dans le menu Démarrer. Le smoke test remplace `notifier.show`.
- Ne jamais appeler `app.setLoginItemSettings` en test. `autostart.init` ne fait rien quand `HP_MESSAGE_USER_DATA` est défini.
- Pour vérifier l'app packagée : lancer `dist\win-unpacked\HP Message.exe` avec `HP_MESSAGE_USER_DATA` et `--remote-debugging-port=<port>`, interroger les pages par CDP, puis tuer seulement ce processus.
- Sous Windows, Chromium passe toutes les pages en `hidden` quand la fenêtre est entièrement recouverte ou l'écran éteint. Le smoke test désactive ce calcul (`CalculateNativeWinOcclusion`) pour rester stable.
- Electron émet `did-finish-load` pour la page d'erreur juste après `did-fail-load` : c'est le rôle de `rt.failedLoad` dans `views.js`.

## Code

- JavaScript CommonJS, sans étape de build ni TypeScript. Indentation de 2 espaces, fins de ligne LF.
- Les modules purs, sans `require('electron')`, restent purs pour être testés : `services`, `policy`, `unread`, `accounts`, `settings`, `linux`, `log`.
- Interface, commentaires, README et messages de commit en français (Conventional Commits : `feat:`, `fix:`, `docs:`, `chore:`).
- Ajouter une messagerie = une entrée dans `src/services.js` + une icône `src/ui/sidebar/icons/<id>.png` ; `test/services.test.js` vérifie l'entrée. Une fonction `unread.page` est sérialisée et exécutée dans la page : elle doit être autonome et renvoyer `null` quand la page n'est pas prête.
- Hors périmètre (playbook) : mobile, boîte unifiée, serveur intermédiaire, distribution publique.

## Git

Committer en local seulement, jamais `git push` : l'utilisateur pousse lui-même.

## Mettre à jour Electron

`npm run update:electron`, puis `npm test`, `npm run smoke` et `npm run dist`. Relire la section « breaking changes » de la nouvelle version, en particulier sur `WebContentsView`, les preloads, les permissions (Electron 45 nomme le partage d'écran `display-capture`) et WebAuthn. Vérifier ensuite à la main : changement de compte, clic sur une notification, fermeture de l'app.
