<p align="center">
  <img src="assets/icon.png" width="104" alt="">
</p>

<h1 align="center">Yougo Msg</h1>

<p align="center">
  <strong>Toutes mes messageries dans une seule fenêtre.</strong>
</p>

<p align="center">
  <a href="https://github.com/yougo96/yougo_msg/releases/latest"><strong>Télécharger</strong></a>
  &nbsp;·&nbsp; <a href="#installer">Installer</a>
  &nbsp;·&nbsp; <a href="#au-quotidien">Au quotidien</a>
  &nbsp;·&nbsp; <a href="#développer">Développer</a>
  <br><sub>Windows 11 et Linux · sans serveur · sans télémétrie</sub>
</p>

<p align="center">
  <img src="docs/apercu.png" alt="La fenêtre de Yougo Msg : à gauche, la liste des comptes avec leurs non-lus ; à droite, WhatsApp ouvert sur une conversation">
  <br><sub>Comptes de démonstration.</sub>
</p>

## Pourquoi

Sept messageries, sept onglets : je rate des messages.

Yougo Msg affiche leurs **versions web officielles**, dans une seule fenêtre. Aucun serveur entre moi et les services. L'intention et les limites : [playbook](PLAYBOOK_yougo_msg.md).

## Les messageries

<table align="center">
  <tr>
    <td align="center" width="104"><img src="assets/services/messenger.png" width="52" alt=""><br><sub>Messenger</sub></td>
    <td align="center" width="104"><img src="assets/services/whatsapp.png" width="52" alt=""><br><sub>WhatsApp</sub></td>
    <td align="center" width="104"><img src="assets/services/instagram.png" width="52" alt=""><br><sub>Instagram</sub></td>
    <td align="center" width="104"><img src="assets/services/snapchat.png" width="52" alt=""><br><sub>Snapchat</sub></td>
    <td align="center" width="104"><img src="assets/services/googlechat.png" width="52" alt=""><br><sub>Google Chat</sub></td>
    <td align="center" width="104"><img src="assets/services/googlemessages.png" width="52" alt=""><br><sub>Google Messages (SMS)</sub></td>
    <td align="center" width="104"><img src="assets/services/discord.png" width="52" alt=""><br><sub>Discord</sub></td>
  </tr>
</table>

- En plus : Telegram et LinkedIn (menu ⋯ → *Ajouter une messagerie*).
- Plusieurs comptes par messagerie : oui (ex. WhatsApp et WhatsApp Pro).

## Ce que ça change

- **Je vois où on m'a écrit.** Un nombre = non-lus. Un petit carré = du nouveau, sans nombre. Un **!** orange = à vérifier.
- **Je change en un clic**, ou `Ctrl+1` … `Ctrl+9`. Jamais besoin de me reconnecter.
- **Rien n'est marqué lu en cachette.** Une messagerie masquée ne voit rien.
- **Des notifications claires.** « Messenger · Julien », et le clic ouvre la conversation.
- **Du silence à la demande.** *Ne pas déranger* en bas de la barre.
- **Un mode discret.** `Ctrl+Maj+B` cache la barre latérale, et la remet.
- **Elle se fait oublier.** Elle démarre avec le PC, vit près de l'horloge, se met à jour seule.
- **Rien ne sort de la machine.** Pas de télémétrie. Le journal ne note jamais le texte des messages.

<p align="center">
  <img src="docs/notification.png" width="560" alt="Une notification « Messenger · Julien » au-dessus de la barre des tâches, où l'icône de Yougo Msg porte une pastille 6">
</p>

Fenêtre étroite (moins de 1200 px) : la barre devient une colonne d'icônes.

<p align="center">
  <img src="docs/compact.png" width="600" alt="Fenêtre étroite : la barre latérale repliée en colonne d'icônes, avec des pastilles de non-lus sur chaque icône">
</p>

## Installer

### Windows

1. Télécharger `Yougo-Msg-Setup-<version>.exe` dans les [releases](https://github.com/yougo96/yougo_msg/releases).
2. Le lancer.
3. Windows prévient (app non signée) : *Informations complémentaires* → *Exécuter quand même*.

### Linux

Dans les [releases](https://github.com/yougo96/yougo_msg/releases) :

- **`.deb`** (Ubuntu, Debian ; conseillé) : `sudo apt install ./Yougo-Msg-<version>.deb`
- **`.rpm`** (Fedora ; conseillé) : `sudo dnf install ./Yougo-Msg-<version>.rpm`
- **AppImage** : `chmod +x`, puis lancer. Il faut `libfuse2` (`libfuse2t64` sur Ubuntu 24.04).

Bon à savoir :

- Sur Ubuntu 24.04+, l'AppImage tourne sans le bac à sable de Chromium. Préférer le `.deb` ou le `.rpm`.
- GNOME : l'icône près de l'horloge demande l'extension AppIndicator (déjà là sur Ubuntu). Sans elle, fermer la fenêtre la réduit.
  Sur Fedora : `sudo dnf install gnome-shell-extension-appindicator`, se reconnecter, puis `gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com`.
- Les cookies ne sont pas chiffrés : pas besoin du trousseau. La protection, c'est le chiffrement du disque.
- Correcteur : dictionnaires FR et EN téléchargés une fois depuis Google. Aucun texte envoyé.

### Premier lancement

Se connecter à chaque messagerie. Les sessions sont gardées.

## Au quotidien

| Je veux… | Je fais… |
| --- | --- |
| Changer de compte | Clic, ou `Ctrl+1` … `Ctrl+9` |
| Réordonner | Glisser le compte |
| Couper, renommer, recharger, retirer un compte | Clic droit dessus |
| Faire taire tout le monde | *Ne pas déranger*, en bas, puis choisir la durée |
| Cacher la barre latérale (mode discret) | `Ctrl+Maj+B`, ou menu ⋯. Pour la remettre : `Ctrl+Maj+B`, ou clic droit sur l'icône près de l'horloge |
| Ajouter une messagerie, voir le diagnostic | Menu ⋯ |
| Quitter | Clic droit sur l'icône près de l'horloge → *Quitter* |

Fermer la fenêtre ne quitte pas. L'app continue de recevoir.

### Raccourcis

| Raccourci | Action |
| --- | --- |
| `Ctrl+1` … `Ctrl+9` | Aller au compte 1 à 9 |
| `Ctrl+Tab` / `Ctrl+Maj+Tab` | Compte suivant / précédent |
| `Ctrl+Maj+B` | Mode discret : cacher ou afficher la barre latérale |
| `Ctrl+R` ou `F5` | Recharger (`Ctrl+Maj+R` : sans le cache) |
| `Ctrl+molette`, `Ctrl+=` / `Ctrl+)`, `Ctrl+0` | Zoom, retour à 100 % |
| `Ctrl+Maj+I` ou `F12` | Outils de développement |

### Veille

Chaque compte ouvert prend 100 à 400 Mo.

- Clic droit → **Veille après 10 min** : la page se ferme 10 min après l'avoir quittée.
- Elle se recharge quand je reviens dessus.
- En veille : pas de notifications, pas de compteur.
- Jamais le compte affiché, ni un appel en cours.
- Un compte resté sur sa page de connexion se met en veille seul.

Le Diagnostic montre la mémoire de chaque compte.

### Mises à jour

- Automatiques : au démarrage, puis toutes les 6 h.
- Prête ? Une pastille sur **⋯**, puis *Redémarrer pour passer à la version x.y.z*.
- Sans ce clic, elle s'installe en quittant (Windows, AppImage).
- `.deb`, `.rpm` : mot de passe administrateur, seulement sur *Redémarrer*.
- Depuis la 0.2.0 : installer une fois à la main.

### Connexion Google refusée ?

1. Clic droit sur Google Chat ou Messages → **Connexion Google : mode compatibilité**.
2. Se connecter.
3. Le désactiver ensuite si je veux : la session reste.

### Diagnostic

Menu ⋯ → **Diagnostic** : état de chaque compte, source du compteur, mémoire. *Copier le rapport* pour le coller ailleurs.

Journaux : `%APPDATA%\Yougo Msg\logs` ou `~/.config/Yougo Msg/logs`.

### Limites connues

- **Compteurs** d'Instagram, Google Chat et Google Messages : lus dans la page. Une mise à jour du site peut les casser (diagnostic : « lecture : null »).
- **Snapchat** : pas encore testé connecté.
- **Notifications** : testées en simulé. À confirmer avec de vrais messages.
- **Connexion Google** : à confirmer.
- **Fenêtre visible** = compte affiché marqué lu, comme un onglet ouvert.
- **messenger.com** marche encore (vérifié le 13/10/2026).

## Développer

Node.js 22.12 ou plus (24 conseillé).

```powershell
npm install
npm start
```

⚠️ `npm start` utilise le **vrai profil** (les vraies sessions). Pour tester, `npm run smoke`.

| Commande | Rôle |
| --- | --- |
| `npm start` | Lance l'app (vrai profil) |
| `npm test` | Tests unitaires |
| `npm run smoke` | Test de bout en bout, profil temporaire (~2 min, réseau) |
| `npm run dist` | Installeur dans `dist/` |
| `npm run icons` | Régénère les icônes |
| `npm run screenshots` | Régénère les images du README |
| `npm run update:electron` | Passe au dernier Electron |
| `npm version patch` | Prépare une version |

### Ajouter une messagerie

1. Une entrée dans [`src/services.js`](src/services.js) : `id`, `name`, `url`, `color`, `hosts`. Les options sont en tête du fichier.
2. Son logo dans `assets/services/<id>.svg`, pris sur [Simple Icons](https://simpleicons.org), `fill` à la couleur de la marque.
3. `npm run icons`, puis `npm test`.

Elle apparaît dans ⋯ → *Ajouter une messagerie*.

### Apparence

- DA de [pradierh.fr](https://pradierh.fr). Couleurs et polices : `src/ui/theme.css`.
- Icône : `src/ui/sidebar/badge-art.js`, puis `npm run icons`.
- Images du README : `npm run screenshots`. Comptes de démonstration, aucun vrai message.

### Publier une version

```powershell
npm version patch   # ou minor : tests, commit et tag vx.y.z
git push --follow-tags
```

- Le tag lance le [workflow Release](.github/workflows/release.yml) : Windows et Linux, en ~10 min.
- Les apps installées la proposent sous 6 h.
- Le dépôt doit rester public.

### Mettre à jour Electron

Chromium vient avec Electron. Le menu ⋯ prévient après 60 jours.

```powershell
npm run update:electron
npm test
npm run smoke
npm run dist
```

Puis vérifier à la main : changer de compte, cliquer une notification, fermer l'app. Enfin, [publier une version](#publier-une-version).

### Structure

```
src/
  main.js            démarrage et fermeture
  services.js        catalogue des messageries
  hub.js             fenêtre, comptes, menus
  views.js           page d'un compte
  sessions.js        permissions, correcteur
  notifications.js   notifications
  unread.js          compteurs de non-lus
  policy.js          règles : navigation, permissions, veille
  updates.js         mises à jour
  preload/           ponts (service.js : injecté dans les messageries)
  ui/                barre latérale et petites fenêtres
test/                tests et smoke test
assets/              icônes
docs/                images du README
scripts/             icônes, captures, script de désinstallation du .rpm
.github/workflows/   release.yml
```
