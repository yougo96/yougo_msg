# Yougo Msg : playbook

## Le problème

Mes conversations sont éparpillées entre sept messageries : Messenger, WhatsApp, Instagram, Snapchat, Google Chat, Google Messages (SMS) et Discord. Chacune vit dans son onglet ou son app. Résultat :
- je passe mon temps à changer de fenêtre ;
- je ne sais jamais d'un coup d'œil où quelqu'un m'attend ;
- je rate des messages, ou je suis noyé de notifications sans savoir d'où elles viennent.

## L'intention

**Un seul endroit pour toutes mes conversations.** Les messageries sont à portée d'un clic, sans changer de page, et je vois tout de suite où j'ai des messages en attente.

L'app est réussie si :
- en l'ouvrant, je sais immédiatement où on m'a écrit ;
- je passe d'une messagerie à l'autre instantanément, sans jamais me reconnecter ;
- je ne rate rien d'important, et je peux faire taire ce qui ne compte pas ;
- elle se fait oublier : elle démarre avec le PC, tourne en arrière-plan et se comporte comme une vraie app, pas comme un assemblage de sites.

## Les principes

- **Rassembler, pas refaire.** On affiche les versions web officielles telles quelles, sans réinventer les messageries.
- **Rien ne sort de ma machine.** Pas de serveur intermédiaire : mes messages restent entre moi et chaque service.
- **Pour moi seul, sur Windows et Linux.** La simplicité passe avant tout ce qu'exigerait une distribution publique.
- **Ajouter une messagerie doit rester trivial.**

Pour l'instant, deux sujets sont **hors périmètre** :
- **Le mobile.** Les versions web ne fonctionnent pas sur téléphone, et les apps natives y font déjà le travail.
- **L'aperçu des discussions, la boîte unifiée.** C'est une piste pour plus tard, pas une promesse.

## Ce que le POC a appris

Le code de ce dépôt sert de référence. Voici ce qu'il ne faut pas avoir à réapprendre.

- **Un site web ne peut pas faire ce hub.** Les messageries refusent de s'afficher dans une page tierce, d'où une app de bureau. Electron a été retenu :
  - il embarque le même Chromium sous Windows et Linux ;
  - il gère proprement plusieurs vues avec des sessions isolées ;
  - Tauri n'est pas encore mûr pour ça, surtout sous Linux. À revoir si ça change.
- **Une session isolée par compte** : les connexions sont conservées et les comptes multiples ne coûtent rien.
- **Un service masqué ne marque pas les messages comme lus**, à condition de masquer sa vue, pas de la recouvrir.
- **Les compteurs de non-lus** se lisent dans le titre des pages pour la plupart des services. Il faudra un cas particulier pour les autres.
- **Pour des notifications utiles**, il faut les intercepter dans la page. Elles peuvent alors porter le nom du compte et respecter les réglages, et leur clic ouvre la bonne conversation.
- **Les pages de connexion doivent rester dans l'app**, sinon on se connecte dans le navigateur au lieu du hub (cas de Google Chat).
- **Piège Windows :** une demande de passkey silencieuse des pages Meta empêchait l'app de se fermer, et le processus fantôme bloquait tout relancement. Corrigé dans `service-preload.js`, à ne pas perdre.
- **Sous Linux**, deux points à surveiller :
  - les sessions dépendent du trousseau de mots de passe du système ;
  - l'icône près de l'horloge dépend du bureau.
- **Electron embarque Chromium** : sans mises à jour automatiques, il faut le mettre à jour régulièrement.

## Questions ouvertes

L'usage quotidien du POC doit y répondre :
- La connexion Google passe-t-elle dans l'app ?
- Les compteurs de non-lus sont-ils fiables pour chaque service ?
- Les notifications arrivent-elles vraiment, et le clic ouvre-t-il la bonne conversation ?
- La mémoire consommée reste-t-elle supportable avec tout connecté ?
- Comment l'app se comporte-t-elle sous Linux (bureau, notifications, sessions) ?
- messenger.com existe-t-il toujours ? Une source annonce sa fermeture, alors que la page de connexion s'affiche encore au 08/10/2026.

## Pistes, sans engagement

- Gérer ses comptes depuis l'app : ajouter, retirer, réordonner, renommer.
- Mettre en veille les services inactifs pour économiser la mémoire.
- Copier/coller au clic droit et correcteur orthographique dans les messageries.
- Aperçu des dernières conversations sans ouvrir chaque messagerie.
