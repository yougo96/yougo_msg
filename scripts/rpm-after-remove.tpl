#!/bin/bash
# Désinstallation du .rpm (%postun), à la place du script d'electron-builder. Lors d'une mise à jour, rpm le lance
# pour l'ancienne version après l'installation de la nouvelle : celui d'electron-builder retirait alors le lien
# /usr/bin/${executable} qu'elle venait de créer. $1 : versions restantes du paquet (0 = vraie désinstallation).
if [ "$1" = 0 ]; then
    if type update-alternatives >/dev/null 2>&1; then
        update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
    else
        rm -f '/usr/bin/${executable}'
    fi
    rm -f '/etc/apparmor.d/${executable}'
fi
