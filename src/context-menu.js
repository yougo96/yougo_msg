// Clic droit dans les messageries : corrections orthographiques, couper/copier/coller, liens, images.
const { Menu, clipboard, shell } = require('electron');
const { unwrapLink, canOpenExternally } = require('./policy');

function attachContextMenu(wc, getWindow) {
  wc.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText, linkURL, mediaType, srcURL, misspelledWord, dictionarySuggestions } = params;
    const items = [];
    const section = (entries) => {
      if (!entries.length) return;
      if (items.length) items.push({ type: 'separator' });
      items.push(...entries);
    };

    if (misspelledWord) {
      section([
        ...dictionarySuggestions.slice(0, 5).map((word) => ({ label: word, click: () => wc.replaceMisspelling(word) })),
        ...(dictionarySuggestions.length ? [] : [{ label: 'Aucune suggestion', enabled: false }]),
        { label: 'Ajouter au dictionnaire', click: () => wc.session.addWordToSpellCheckerDictionary(misspelledWord) },
      ]);
    }

    if (linkURL && canOpenExternally(linkURL)) {
      const target = unwrapLink(linkURL);
      section([
        { label: 'Ouvrir le lien dans le navigateur', click: () => shell.openExternal(target).catch(() => {}) },
        { label: "Copier l'adresse du lien", click: () => clipboard.writeText(target).catch(() => {}) },
      ]);
    }

    if (mediaType === 'image' && srcURL) {
      section([
        { label: "Copier l'image", click: () => wc.copyImageAt(params.x, params.y) },
        { label: "Enregistrer l'image sous…", click: () => wc.downloadURL(srcURL) },
      ]);
    }

    if (isEditable) {
      section([
        { label: 'Annuler', enabled: editFlags.canUndo, click: () => wc.undo() },
        { label: 'Rétablir', enabled: editFlags.canRedo, click: () => wc.redo() },
      ]);
      section([
        { label: 'Couper', enabled: editFlags.canCut, click: () => wc.cut() },
        { label: 'Copier', enabled: editFlags.canCopy, click: () => wc.copy() },
        { label: 'Coller', enabled: editFlags.canPaste, click: () => wc.paste() },
        { label: 'Coller sans mise en forme', enabled: editFlags.canPaste, click: () => wc.pasteAndMatchStyle() },
        { label: 'Tout sélectionner', enabled: editFlags.canSelectAll, click: () => wc.selectAll() },
      ]);
    } else if (selectionText.trim()) {
      section([{ label: 'Copier', click: () => wc.copy() }]);
    }

    if (!items.length) return;
    // Sans x/y : le menu s'ouvre sous le curseur (les coordonnées reçues sont relatives à la vue).
    Menu.buildFromTemplate(items).popup({ window: getWindow(), frame: params.frame ?? undefined });
  });
}

module.exports = { attachContextMenu };
