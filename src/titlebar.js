// Barre de titre à la DA sous Windows : la page dessine la bande du haut (src/ui/titlebar.js) et Windows y pose
// ses boutons. Sous Linux, la barre du bureau reste : les gestionnaires de fenêtres sont trop variés.
const TITLE_BAR_HEIGHT = process.platform === 'win32' ? 32 : 0;

// Options de BrowserWindow et adresse de la page pour une fenêtre de l'app.
const titleBarOptions = TITLE_BAR_HEIGHT ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#13151a', symbolColor: '#ffffff', height: TITLE_BAR_HEIGHT } } : {};
const pageQuery = { titlebar: String(TITLE_BAR_HEIGHT) };

module.exports = { TITLE_BAR_HEIGHT, titleBarOptions, pageQuery };
