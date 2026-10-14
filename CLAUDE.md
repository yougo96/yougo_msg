# Yougo Msg : consignes pour Claude

App de bureau personnelle (Windows 11 + Linux, Electron 44) qui affiche les versions web officielles de 7 messageries dans une seule fenêtre. L'intention et les limites sont dans [PLAYBOOK_yougo_msg.md](PLAYBOOK_yougo_msg.md) ; l'usage, les commandes et la structure dans [README.md](README.md). Juger tout changement d'après les 4 critères de réussite du playbook, et garder la simplicité avant tout.

## Commandes

- `npm start` : lance l'app sur le **vrai profil** de l'utilisateur (ses sessions). Ne jamais l'utiliser pour tester.
- `npm test` : tests unitaires (`node:test`) des modules sans Electron.
- `npm run smoke` : lance la vraie app avec un profil temporaire, sur les vraies pages déconnectées, puis vérifie qu'elle se ferme vite. Environ 2 min, réseau requis.
- `npm run dist` : installeur Windows (ou `.deb` + `.rpm` + AppImage sous Linux ; le `.rpm` demande `rpmbuild`), dans `dist/`.
- `npm version patch|minor` : commit « chore: version x.y.z » et tag `vx.y.z`. Le tag poussé lance `.github/workflows/release.yml`, qui construit Windows et Linux et publie la release GitHub dont les apps installées se mettent à jour. Publier est la décision de l'utilisateur : ne pas lancer `npm version` sans qu'il le demande.

Avant de conclure un changement : `npm test`, plus `npm run smoke` dès que le process principal, un preload ou une page est touché.

## Invariants (à ne pas casser)

- **Identité = sessions de l'utilisateur.** `productName` « Yougo Msg », `build.appId` `com.yougo.msg`, `name` `yougo-msg` et `desktopName` fixent le dossier de profil, l'installation et le raccourci. Les changer fait perdre toutes les connexions, sauf reprise explicite comme celle de l'ancien nom « HP Message » (`src/legacy.js` : profil déplacé au premier lancement, ancienne entrée de démarrage retirée). Une partition s'appelle `persist:<accountId>`. Un id de compte ne change jamais : le premier compte d'une messagerie porte l'id de la messagerie (reprise du POC), les suivants `<service>-<base36>`. Une partition retirée n'est effacée qu'au démarrage suivant.
- **Vues masquées.** On masque une vue uniquement avec `setVisible(false)`, pour que la page soit `hidden` et ne marque rien comme lu. Jamais `backgroundThrottling: false`, jamais une vue posée par-dessus une autre, toujours `focusOnNavigation: false`.
- **Veille** (`policy.shouldSleep`, `views.sleep`). Un compte en veille a son état (`rt`, statut `asleep`) mais aucune vue dans `hub.views` : tout code qui parcourt les comptes doit le supporter. Jamais le compte affiché, ni un compte en appel ou qui joue un son. `hub.select` le réveille.
- **Preload des messageries** (`src/preload/service.js`).
  - Il est enregistré au niveau de la session, ce qui couvre aussi les fenêtres d'appel.
  - Rien n'est posé sur `window` : le pont passe en arguments de `contextBridge.executeInMainWorld`.
  - Seulement des API Web, car Electron 45 retire les shims Node des preloads sandboxés.
  - Electron n'affiche jamais les notifications de service worker et n'a pas de Push : l'interception dans la page est la seule voie.
- **Piège Windows du processus fantôme.** Trois mécanismes sont à garder ensemble : le neutraliseur de passkey silencieuse (get et create conditionnels), la fermeture de toutes les pages avant de quitter (`closeAllPages`, via `hub.shutdown()`) et le garde-fou externe de `main.js`.
- **Mises à jour** (`src/updates.js`, electron-updater, releases du dépôt public `yougo96/yougo_msg`).
  - Actives seulement dans la version installée, jamais avec `YOUGO_MSG_USER_DATA` : un test ne doit jamais lancer un installeur, il remplacerait l'app installée de l'utilisateur.
  - « Redémarrer » ferme les pages (`hub.shutdown()`) avant `install()` : l'installeur NSIS tue l'app si elle tarde, et des cookies pas encore écrits seraient perdus. Un `.deb` ou un `.rpm` (mot de passe administrateur) ne s'installe jamais en quittant.
  - Le tag `vx.y.z` égale la version de `package.json` ; `electron-updater` reste dans `dependencies` (sinon il n'est pas embarqué) et `build.publish` pointe sur le dépôt (`test/release.test.js`).
- **IPC.** Chaque canal vérifie son émetteur : la barre latérale pour `hub:*`, le compte et l'origine de la frame pour `service:*`. `service:config` est synchrone et doit toujours renseigner `returnValue`.
- **Cookies non chiffrés** (fusible `enableCookieEncryption: false`), ce qui évite toute dépendance au trousseau Linux. Ne pas activer ce fusible : la bascule est à sens unique et déconnecterait tous les comptes.
- **Rien ne sort de la machine.** Pas de serveur ni de télémétrie. Le journal ne contient jamais le texte des messages. Seules requêtes de l'app elle-même : la lecture des releases GitHub (sans identifiant de la machine : l'en-tête `x-user-staging-id` d'electron-updater est remplacé) et les dictionnaires du correcteur.

## Tests et expériences

- Toujours un profil isolé : variable `YOUGO_MSG_USER_DATA`, ou `app.setPath('userData', …)` avant `ready` dans un script. Ne jamais toucher à `%APPDATA%\Yougo Msg` ni à `~/.config/Yougo Msg`, ni à l'ancien dossier `HP Message` (il peut encore porter les sessions).
- Ne pas afficher de vraies notifications en développement : depuis Electron 41, la première notification crée un raccourci `Electron.lnk` dans le menu Démarrer. Le smoke test remplace `notifier.show` et `notifier.info`.
- Le smoke test fait tourner le vrai electron-updater contre un serveur local, avec `install()` remplacé et le cache des téléchargements dans le profil temporaire (`LOCALAPPDATA`, `XDG_CACHE_HOME`). Il se termine par « Redémarrer pour mettre à jour ».
- Ne jamais appeler `app.setLoginItemSettings` en test. `autostart.init` ne fait rien quand `YOUGO_MSG_USER_DATA` est défini.
- Pour vérifier l'app packagée : lancer `dist\win-unpacked\Yougo Msg.exe` avec `YOUGO_MSG_USER_DATA` et `--remote-debugging-port=<port>`, interroger les pages par CDP, puis tuer seulement ce processus.
- Sous Windows, Chromium passe toutes les pages en `hidden` quand la fenêtre est entièrement recouverte ou l'écran éteint. Le smoke test désactive ce calcul (`CalculateNativeWinOcclusion`) pour rester stable.
- Electron émet `did-finish-load` pour la page d'erreur juste après `did-fail-load` : c'est le rôle de `rt.failedLoad` dans `views.js`.

## Code

- JavaScript CommonJS, sans étape de build ni TypeScript. Indentation de 2 espaces, fins de ligne LF.
- Les modules purs, sans `require('electron')`, restent purs pour être testés : `services`, `policy`, `unread`, `accounts`, `settings`, `legacy`, `linux`, `log`.
- Interface, commentaires, README et messages de commit en français (Conventional Commits : `feat:`, `fix:`, `docs:`, `chore:`).
- Ajouter une messagerie = une entrée dans `src/services.js` + son tracé `assets/services/<id>.svg` (Simple Icons, `fill` à la couleur de la marque), puis `npm run icons`. Il produit l'icône de la barre (`src/ui/sidebar/icons/<id>.png`, 256 px, fond transparent) et la tuile des notifications (`assets/services/<id>.png`). `test/services.test.js` vérifie l'entrée et la qualité des icônes. Une fonction `unread.page` est sérialisée et exécutée dans la page : elle doit être autonome et renvoyer `null` quand la page n'est pas prête.
- Apparence : DA de pradierh.fr, couleurs et polices dans `src/ui/theme.css`. L'icône de l'app est dessinée par `drawIcon()` dans `src/ui/sidebar/badge-art.js` : après une modification, `npm run icons` régénère `assets/icon.png`, `icon.ico` et `badge.png` (à committer), et `assets/icon.svg` reste à garder identique. Après un changement visible de la barre latérale ou de l'icône, `npm run screenshots` régénère les images du README (`docs/`, à committer) : vraie barre latérale, comptes et page de démonstration.
- Sous Windows, les fenêtres de l'app n'ont pas de barre de titre native (`src/titlebar.js`). Une nouvelle fenêtre de l'app passe `titleBarOptions` et `pageQuery`, et sa page charge `../titlebar.js`. Les fenêtres d'appel des messageries gardent la barre native.
- Hors périmètre (playbook) : mobile, boîte unifiée, serveur intermédiaire, distribution publique.

## Git

Committer en local seulement, jamais `git push` (ni tag poussé) : l'utilisateur pousse lui-même, et un tag poussé publie une version.

## Mettre à jour Electron

`npm run update:electron` (il met aussi à jour electron-builder et electron-updater), puis `npm test`, `npm run smoke` et `npm run dist`. Chromium n'arrive chez l'utilisateur qu'avec une version publiée. Relire la section « breaking changes » de la nouvelle version, en particulier sur `WebContentsView`, les preloads, les permissions (Electron 45 nomme le partage d'écran `display-capture`) et WebAuthn. Vérifier ensuite à la main : changement de compte, clic sur une notification, fermeture de l'app.
