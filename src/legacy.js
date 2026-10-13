// Reprise de l'ancien nom de l'app, « HP Message » (aussi celui du POC) : son profil, donc ses connexions, et
// ses entrées de démarrage. Sans dépendance à Electron (testé dans test/).

const fs = require('node:fs');
const path = require('node:path');
const { renameWithRetry } = require('./settings');

const PRODUCT_NAME = 'HP Message'; // dossier du profil : %APPDATA%\HP Message, ~/.config/HP Message
const ID = 'com.hp.message'; // entrée de démarrage Windows, fichiers .desktop sous Linux

// Linux : l'ancienne app ouverte continuerait d'écrire dans son profil, même déplacé. Son verrou d'instance
// unique est un lien vers « hôte-pid ».
function lockedOnLinux(dir) {
  try {
    process.kill(Number(fs.readlinkSync(path.join(dir, 'SingletonLock')).split('-').pop()), 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Déplace l'ancien profil à la place du nouveau tant que celui-ci n'a jamais servi (Electron crée le dossier, vide,
// avant même main.js). Renvoie 'moved', 'none' (rien à reprendre) ou 'busy' (ancienne app encore ouverte).
function adoptProfile(from, to, platform = process.platform) {
  if (!fs.existsSync(path.join(from, 'settings.json'))) return 'none';
  if (['settings.json', 'Partitions'].some((name) => fs.existsSync(path.join(to, name)))) return 'none';
  if (platform === 'linux' && lockedOnLinux(from)) return 'busy';
  try {
    fs.rmSync(to, { recursive: true, force: true });
    renameWithRetry(from, to);
    return 'moved';
  } catch {
    // Windows refuse de déplacer un dossier dont l'ancienne app garde des fichiers ouverts.
    return 'busy';
  }
}

module.exports = { PRODUCT_NAME, ID, adoptProfile };
