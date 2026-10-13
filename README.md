# HP Message

Toutes mes messageries dans une seule fenêtre : Messenger, WhatsApp, Instagram, Snapchat, Google Chat, Google Messages (SMS) et Discord. Une barre à gauche, la messagerie à droite, et je vois d'un coup d'œil où l'on m'a écrit. Le pourquoi est dans le [playbook](PLAYBOOK_yougo_msg.md).

Les versions web officielles sont affichées telles quelles, chacune avec sa propre session. Aucun serveur intermédiaire : les messages restent entre la machine et chaque service.

## Lancer

**Quitter d'abord le POC s'il tourne** (clic droit sur son icône près de l'horloge → *Quitter*) : les deux partagent le même profil, et tant que le POC est ouvert, HP Message se ferme aussitôt en ouvrant la fenêtre du POC.

**Version installée** : `npm run dist`, puis double-clic sur `dist\HP-Message-Setup-0.2.0.exe`. L'app n'est pas signée : à la première installation, Windows affiche « Windows a protégé votre ordinateur » → *Informations complémentaires* → *Exécuter quand même*. Elle remplace le POC (même identité) et **reprend ses connexions** : pas besoin de se reconnecter.

**Version de développement** (Node.js 22.12 ou plus, 24 conseillé, cf. `.nvmrc`) :

```powershell
npm install   # une seule fois
npm start
```

`npm start` utilise le même profil que la version installée. Les deux ne tournent pas en même temps : le second lancement ouvre simplement la fenêtre du premier.

Au premier lancement, chaque messagerie demande de se connecter (QR code pour WhatsApp, Google Messages et Discord si on le souhaite). Les sessions sont conservées.

## Au quotidien

- **Barre latérale** : un clic ouvre une messagerie, `Ctrl+1` … `Ctrl+9` aussi. On réordonne en glissant les icônes.
- **Pastilles** : un nombre (non-lus), un point (nouveaux messages sans nombre, ex. Discord sans mention), ou un **!** orange (connexion requise, hors ligne, page plantée). Survoler une icône donne le détail.
- **Clic droit sur une icône** : couper les notifications de ce compte, recharger, revenir à l'accueil, renommer, ajouter un autre compte du même service, réparer (vider le cache), retirer.
- **Cloche** : *Ne pas déranger*. Clic droit pour une durée (1 h, jusqu'à demain 8 h).
- **⋯** : ajouter une messagerie (dont Telegram et LinkedIn), lancer au démarrage, diagnostic, journaux, quitter.
- **Fermer la fenêtre ne quitte pas** : HP Message reste près de l'horloge pour continuer à recevoir les messages. Pour quitter : clic droit sur l'icône près de l'horloge, ou menu ⋯.
- **Démarrage avec le PC** : activé d'office dans la version installée (désactivable dans ⋯). L'app démarre alors directement dans la zone de notification.

Le total des non-lus (comptes non coupés) s'affiche dans le titre de la fenêtre, sur l'icône de la barre des tâches et sur l'icône près de l'horloge.

### Notifications

Elles portent le nom du compte (« WhatsApp 2 · Marie ») et un clic ouvre la bonne conversation. Un compte coupé, ou *Ne pas déranger*, ne notifie plus et sa page se tait tant qu'elle n'est pas affichée (un appel en cours n'est pas coupé). Une messagerie qui ne notifie pas elle-même (Discord par défaut, par exemple) déclenche une notification « Nouveau message » quand son compteur monte (pour Discord : seulement les mentions et les messages privés).

### Raccourcis

| Raccourci | Action |
| --- | --- |
| `Ctrl+1` … `Ctrl+9` | Aller au compte n° 1 à 9 |
| `Ctrl+Tab` / `Ctrl+Maj+Tab` | Compte suivant / précédent |
| `Ctrl+R` ou `F5` | Recharger le compte affiché (`Ctrl+Maj+R` : sans le cache) |
| `Ctrl+molette`, `Ctrl+=` / `Ctrl+)` , `Ctrl+0` | Zoom du compte affiché (mémorisé), retour à 100 % |
| `Ctrl+Maj+I` ou `F12` | Outils de développement du compte affiché |

### Si une connexion Google est refusée

Google refuse parfois les connexions depuis une app de bureau. Clic droit sur Google Chat ou Messages → **Connexion Google : mode compatibilité**, puis se connecter. Une fois connecté, on peut désactiver le mode : la session reste.

## Diagnostic

Menu ⋯ → **Diagnostic** : pour chaque compte, l'état, d'où vient le compteur de non-lus (titre, lecture de la page, favicon) et ce que la page affiche, les notifications reçues, la mémoire et la visibilité. *Copier le rapport* donne un texte à coller ailleurs. Le journal (`%APPDATA%\HP Message\logs`, ou `~/.config/HP Message/logs`) note les échecs de chargement, les plantages, l'évolution des compteurs (des nombres, jamais le texte des messages) et un relevé mémoire tous les quarts d'heure. De quoi répondre aux questions ouvertes du playbook.

## Linux

`npm install` puis `npm run dist` **sur la machine Linux** produit un `.deb` et une AppImage dans `dist/`.

- **Ubuntu / Debian** : `sudo apt install ./dist/HP-Message-0.2.0.deb` (recommandé : raccourci, icône et bac à sable de Chromium actifs).
- **AppImage** (Fedora…) : `chmod +x` puis lancer. Elle crée son raccourci et son icône au premier lancement. Elle a besoin de `libfuse2` (`libfuse2t64` sur Ubuntu 24.04). Sur Ubuntu 24.04+, une AppImage Electron tourne sans le bac à sable de Chromium : préférer le `.deb`.
- **Icône près de l'horloge** : native sous KDE ; sous GNOME, il faut l'extension AppIndicator (installée d'office sur Ubuntu). Sans elle, HP Message le détecte et fermer la fenêtre la **réduit** au lieu de la cacher. Sous GNOME, l'icône s'ouvre d'un double-clic ; le clic droit donne le menu.
- **Sessions** : les cookies sont stockés sans chiffrement par Electron (comme dans le POC) ; elles ne dépendent donc pas du trousseau GNOME/KDE. La protection repose sur le chiffrement du disque.
- **Correcteur orthographique** : les dictionnaires français et anglais sont téléchargés une fois depuis Google au premier usage (aucun texte n'est envoyé). Sous Windows, c'est le correcteur du système.

## Ajouter une messagerie

Une entrée dans [`src/services.js`](src/services.js) et une icône `src/ui/sidebar/icons/<id>.png`. Le minimum : `id`, `name`, `url`, `color`, `hosts` (domaines où la page peut naviguer). Par défaut, le compteur de non-lus est lu dans le titre (« (3) Service »). Les autres options (lecture de la page, favicon, fenêtres d'appel, page de connexion…) sont décrites en tête du fichier. `npm test` vérifie que l'entrée est complète.

Ajouter un service au catalogue ne le crée pas chez soi : il apparaît dans ⋯ → *Ajouter une messagerie* (ou d'office au premier lancement si `enabled` n'est pas `false`).

## Mettre à jour Electron (et donc Chromium)

Pas de mise à jour automatique : il faut le faire à la main, régulièrement. Le menu ⋯ et le diagnostic préviennent quand l'Electron embarqué a plus de 60 jours.

```powershell
npm run update:electron
npm test
npm run smoke
npm run dist
```

Après une nouvelle version majeure d'Electron, vérifier aussi à la main : changement de compte, clic sur une notification, fermeture de l'app.

## Tests

- `npm test` : règles pures (compteurs, navigation, permissions, réglages, catalogue).
- `npm run smoke` : lance la vraie app avec un **profil temporaire** (jamais le vôtre) sur les vraies pages des messageries, déconnectées. Il vérifie l'interception des notifications et le clic rejoué, la passkey silencieuse, la visibilité des pages masquées, les compteurs, la navigation, les permissions, la reprise après panne, et que le processus se termine vite après *Quitter*.

## Structure

```
src/
  main.js            démarrage, instance unique, branchements, fermeture propre
  services.js        catalogue des messageries (ajouter un service = une entrée + une icône)
  hub.js             fenêtre, comptes, sélection, ne pas déranger, indicateurs, menus
  views.js           vue d'un compte : navigation, fenêtres d'appel, reprise après panne, lecture des pages
  sessions.js        session d'un compte : permissions, partage d'écran, correcteur
  notifications.js   notifications (nom du compte, clic, rafales, « Nouveau message »)
  unread.js          compteur de non-lus d'un compte (titre, page, favicon, pastille)
  policy.js          règles de navigation, de fenêtres et de permissions
  accounts.js, settings.js   comptes et réglages (écriture atomique, reprise du POC)
  tray.js, autostart.js, linux.js, context-menu.js, diagnostics.js, dialogs.js, log.js
  preload/           ponts : barre latérale, petites fenêtres, et service.js injecté dans les messageries
  ui/                barre latérale, Diagnostic, Renommer
test/                tests (node:test) et test de bout en bout (smoke)
```

## Limites connues, à vérifier à l'usage

- **Compteurs** : fiables par construction sur WhatsApp, Messenger et Discord (titre). Pour Instagram, Google Chat et Google Messages, ils viennent d'une lecture de la page qui peut casser à une mise à jour du site : le diagnostic montre alors « lecture : null » et la source de repli. Snapchat n'a pas été vérifié avec un compte connecté.
- **Notifications** : relais testé avec des notifications simulées ; à confirmer avec de vrais messages pour chaque service.
- **Connexion Google** dans l'app : à confirmer (mode compatibilité en secours).
- **Fenêtre ouverte** : tant qu'une partie de la fenêtre se voit à l'écran, le compte affiché est considéré comme lu par sa messagerie (comme un onglet ouvert dans un navigateur). Sous Windows, une fenêtre entièrement recouverte, ou l'écran éteint, ne marque rien comme lu.
- **messenger.com** répond toujours (vérifié le 13/10/2026) malgré l'annonce de sa fermeture ; `facebook.com` est autorisé dans la vue si Meta y redirige.
