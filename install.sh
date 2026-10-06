#!/bin/sh
# Installe (ou met à jour) Pastille sur Mac, branche Claude Code et lance l'app :
#   curl -fsSL https://raw.githubusercontent.com/gfavier-marie/pastille/main/install.sh | sh
# Téléchargé par curl, le .dmg n'est pas mis en quarantaine : pas d'alerte Gatekeeper
# malgré l'absence de signature Apple. PASTILLE_DMG_URL choisit un autre .dmg (essais).
set -e

URL="${PASTILLE_DMG_URL:-https://github.com/gfavier-marie/pastille/releases/latest/download/Pastille-arm64.dmg}"
MCP_URL=http://127.0.0.1:3917/mcp

if [ "$(uname -s)" != Darwin ] || [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" != 1 ]; then
  echo "Pastille demande pour l'instant un Mac Apple Silicon (M1 ou plus récent)." >&2
  exit 1
fi
if [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 13 ]; then
  echo "Pastille demande macOS 13 ou plus récent." >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'hdiutil detach -quiet "$tmp/mnt" 2>/dev/null; rm -rf "$tmp"' EXIT

echo "Téléchargement de Pastille…"
curl -fL --progress-bar "$URL" -o "$tmp/Pastille.dmg"

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
APP="$DEST/Pastille.app"

if [ -d "$APP" ]; then
  echo "Mise à jour de $APP"
  osascript -e 'if application "Pastille" is running then tell application "Pastille" to quit' >/dev/null 2>&1 || true
  i=0
  while pgrep -xq Pastille && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
  # Sans signature Apple, chaque version est une nouvelle app pour macOS : les anciennes
  # autorisations resteraient affichées sans fonctionner. Elles seront redemandées.
  tccutil reset ScreenCapture fr.pastille.desktop >/dev/null 2>&1 || true
  tccutil reset Microphone fr.pastille.desktop >/dev/null 2>&1 || true
  rm -rf "$APP"
fi

hdiutil attach -nobrowse -quiet -mountpoint "$tmp/mnt" "$tmp/Pastille.dmg"
ditto "$tmp/mnt/Pastille.app" "$APP"
echo "Pastille installée : $APP"

MCP_ADD="claude mcp add --transport http --scope user pastille $MCP_URL"
if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code absent. Pour le brancher plus tard : $MCP_ADD"
elif claude mcp get pastille >/dev/null 2>&1; then
  echo "Claude Code : serveur MCP « pastille » déjà présent."
elif $MCP_ADD >/dev/null 2>&1; then
  echo "Claude Code : serveur MCP « pastille » ajouté."
else
  echo "Claude Code : ajout impossible, à faire à la main : $MCP_ADD"
fi

open "$APP"
echo "Pastille est lancée (icône dans la barre de menus) : suis l'assistant de premier lancement."
