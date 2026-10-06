#!/bin/sh
# Installe (ou met à jour) VibeScreener sur Mac, branche Claude Code et lance l'app :
#   curl -fsSL https://vibescreener.dev/install.sh | sh
# Téléchargé par curl, le .dmg n'est pas mis en quarantaine : pas d'alerte Gatekeeper
# malgré l'absence de signature Apple. PASTILLE_DMG_URL choisit un autre .dmg (essais).
set -e

URL="${PASTILLE_DMG_URL:-https://dl.vibescreener.dev/VibeScreener-arm64.dmg}"
MCP_URL=http://127.0.0.1:3917/mcp

if [ "$(uname -s)" != Darwin ] || [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" != 1 ]; then
  echo "VibeScreener demande pour l'instant un Mac Apple Silicon (M1 ou plus récent)." >&2
  exit 1
fi
if [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 13 ]; then
  echo "VibeScreener demande macOS 13 ou plus récent." >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'hdiutil detach -quiet "$tmp/mnt" 2>/dev/null; rm -rf "$tmp"' EXIT

echo "Téléchargement de VibeScreener…"
curl -fL --progress-bar "$URL" -o "$tmp/VibeScreener.dmg"

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
APP="$DEST/VibeScreener.app"

# Version précédente, sous ce nom ou sous l'ancien (Pastille) : quittée puis remplacée.
# Les sessions et réglages restent ; l'app les reprend au premier lancement.
for name in VibeScreener Pastille; do
  [ -d "$DEST/$name.app" ] || continue
  echo "Mise à jour de $DEST/$name.app"
  osascript -e "if application \"$name\" is running then tell application \"$name\" to quit" >/dev/null 2>&1 || true
  i=0
  while pgrep -xq "$name" && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
  # Sans signature Apple, chaque version est une nouvelle app pour macOS : les anciennes
  # autorisations resteraient affichées sans fonctionner. Elles seront redemandées.
  tccutil reset ScreenCapture fr.pastille.desktop >/dev/null 2>&1 || true
  tccutil reset Microphone fr.pastille.desktop >/dev/null 2>&1 || true
  rm -rf "$DEST/$name.app"
done

hdiutil attach -nobrowse -quiet -mountpoint "$tmp/mnt" "$tmp/VibeScreener.dmg"
ditto "$tmp/mnt/VibeScreener.app" "$APP"
echo "VibeScreener installée : $APP"

MCP_ADD="claude mcp add --transport http --scope user vibescreener $MCP_URL"
if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code absent. Pour le brancher plus tard : $MCP_ADD"
else
  # Ancien nom du serveur MCP : remplacé par le nouveau (même adresse).
  claude mcp get pastille >/dev/null 2>&1 && claude mcp remove --scope user pastille >/dev/null 2>&1 || true
  if claude mcp get vibescreener >/dev/null 2>&1; then
    echo "Claude Code : serveur MCP « vibescreener » déjà présent."
  elif $MCP_ADD >/dev/null 2>&1; then
    echo "Claude Code : serveur MCP « vibescreener » ajouté."
  else
    echo "Claude Code : ajout impossible, à faire à la main : $MCP_ADD"
  fi
fi

open "$APP"
echo "VibeScreener est lancée (icône dans la barre de menus) : suis l'assistant de premier lancement."
