#!/bin/sh
# Démarre en root uniquement pour rendre /data inscriptible par l'utilisateur xui
# (le dossier ./data créé par Docker sur l'hôte appartient à root), puis abandonne
# les privilèges root avant de lancer l'application.
set -e
if [ "$(id -u)" = "0" ]; then
  chown -R xui:xui /data
  exec setpriv --reuid=xui --regid=xui --init-groups "$@"
fi
exec "$@"
