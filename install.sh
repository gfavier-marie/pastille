#!/bin/sh
# Installe (ou met à jour) VibeScreener sur Mac, branche Claude Code et lance l'app :
#   curl -fsSL https://vibescreener.dev/install.sh | sh
# Téléchargé par curl, le .dmg n'est pas mis en quarantaine : pas d'alerte Gatekeeper
# malgré l'absence de signature Apple. PASTILLE_DMG_URL choisit un autre .dmg (essais).
set -e

URL="${PASTILLE_DMG_URL:-https://dl.vibescreener.dev/VibeScreener-arm64.dmg}"
MCP_URL=http://127.0.0.1:3917/mcp

# Messages dans la langue du Mac (la mise à jour depuis l'app lance sh sans LANG), sinon LANG ; anglais par défaut.
L=$(defaults read -g AppleLanguages 2>/dev/null | sed -n '2s/[^a-z]*\([a-z][a-z]\).*/\1/p')
[ -n "$L" ] || L=$(printf %s "${LC_ALL:-${LANG:-}}" | cut -c1-2)
case "$L" in fr | es | de | it) ;; *) L=en ;; esac
# t <clé> [valeur] : message dans la langue choisie.
t() {
  case "$L:$1" in
    fr:arm) echo "VibeScreener demande pour l'instant un Mac Apple Silicon (M1 ou plus récent)." ;;
    en:arm) echo "VibeScreener currently requires an Apple Silicon Mac (M1 or later)." ;;
    es:arm) echo "Por ahora, VibeScreener necesita un Mac con Apple Silicon (M1 o posterior)." ;;
    de:arm) echo "VibeScreener benötigt derzeit einen Mac mit Apple Silicon (M1 oder neuer)." ;;
    it:arm) echo "Per ora VibeScreener richiede un Mac con Apple Silicon (M1 o successivo)." ;;
    fr:macos) echo "VibeScreener demande macOS 13 ou plus récent." ;;
    en:macos) echo "VibeScreener requires macOS 13 or later." ;;
    es:macos) echo "VibeScreener necesita macOS 13 o posterior." ;;
    de:macos) echo "VibeScreener benötigt macOS 13 oder neuer." ;;
    it:macos) echo "VibeScreener richiede macOS 13 o successivo." ;;
    fr:download) echo "Téléchargement de VibeScreener…" ;;
    en:download) echo "Downloading VibeScreener…" ;;
    es:download) echo "Descargando VibeScreener…" ;;
    de:download) echo "VibeScreener wird geladen …" ;;
    it:download) echo "Download di VibeScreener…" ;;
    fr:update) echo "Mise à jour de $2" ;;
    en:update) echo "Updating $2" ;;
    es:update) echo "Actualizando $2" ;;
    de:update) echo "$2 wird aktualisiert" ;;
    it:update) echo "Aggiornamento di $2" ;;
    fr:installed) echo "VibeScreener installée : $2" ;;
    en:installed) echo "VibeScreener installed: $2" ;;
    es:installed) echo "VibeScreener instalada: $2" ;;
    de:installed) echo "VibeScreener installiert: $2" ;;
    it:installed) echo "VibeScreener installata: $2" ;;
    fr:noclaude) echo "Claude Code absent. Pour le brancher plus tard : $2" ;;
    en:noclaude) echo "Claude Code not found. To connect it later: $2" ;;
    es:noclaude) echo "Claude Code no está instalado. Para conectarlo más tarde: $2" ;;
    de:noclaude) echo "Claude Code nicht gefunden. Später verbinden mit: $2" ;;
    it:noclaude) echo "Claude Code non trovato. Per collegarlo più tardi: $2" ;;
    fr:present) echo "Claude Code : serveur MCP « vibescreener » déjà présent." ;;
    en:present) echo "Claude Code: MCP server \"vibescreener\" already set up." ;;
    es:present) echo "Claude Code: el servidor MCP «vibescreener» ya está configurado." ;;
    de:present) echo "Claude Code: MCP-Server „vibescreener“ ist bereits eingerichtet." ;;
    it:present) echo "Claude Code: server MCP «vibescreener» già configurato." ;;
    fr:added) echo "Claude Code : serveur MCP « vibescreener » ajouté." ;;
    en:added) echo "Claude Code: MCP server \"vibescreener\" added." ;;
    es:added) echo "Claude Code: servidor MCP «vibescreener» añadido." ;;
    de:added) echo "Claude Code: MCP-Server „vibescreener“ hinzugefügt." ;;
    it:added) echo "Claude Code: server MCP «vibescreener» aggiunto." ;;
    fr:failed) echo "Claude Code : ajout impossible, à faire à la main : $2" ;;
    en:failed) echo "Claude Code: could not add it, run this yourself: $2" ;;
    es:failed) echo "Claude Code: no se pudo añadir, hazlo a mano: $2" ;;
    de:failed) echo "Claude Code: Hinzufügen fehlgeschlagen, bitte manuell ausführen: $2" ;;
    it:failed) echo "Claude Code: impossibile aggiungerlo, fallo a mano: $2" ;;
    fr:launched) echo "VibeScreener est lancée (icône dans la barre de menus) : suivez l'assistant de premier lancement." ;;
    en:launched) echo "VibeScreener is running (icon in the menu bar): follow the setup assistant." ;;
    es:launched) echo "VibeScreener está abierta (icono en la barra de menús): sigue el asistente de inicio." ;;
    de:launched) echo "VibeScreener läuft (Symbol in der Menüleiste): Folge dem Einrichtungsassistenten." ;;
    it:launched) echo "VibeScreener è in esecuzione (icona nella barra dei menu): segui l'assistente iniziale." ;;
  esac
}

if [ "$(uname -s)" != Darwin ] || [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" != 1 ]; then
  t arm >&2
  exit 1
fi
if [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 13 ]; then
  t macos >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'hdiutil detach -quiet "$tmp/mnt" 2>/dev/null; rm -rf "$tmp"' EXIT

t download
curl -fL --progress-bar "$URL" -o "$tmp/VibeScreener.dmg"

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
APP="$DEST/VibeScreener.app"

# Version précédente, sous ce nom ou sous l'ancien (Pastille) : quittée puis remplacée.
# Les sessions et réglages restent ; l'app les reprend au premier lancement.
for name in VibeScreener Pastille; do
  [ -d "$DEST/$name.app" ] || continue
  t update "$DEST/$name.app"
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
t installed "$APP"

MCP_ADD="claude mcp add --transport http --scope user vibescreener $MCP_URL"
if ! command -v claude >/dev/null 2>&1; then
  t noclaude "$MCP_ADD"
else
  # Ancien nom du serveur MCP : remplacé par le nouveau (même adresse).
  claude mcp get pastille >/dev/null 2>&1 && claude mcp remove --scope user pastille >/dev/null 2>&1 || true
  if claude mcp get vibescreener >/dev/null 2>&1; then
    t present
  elif $MCP_ADD >/dev/null 2>&1; then
    t added
  else
    t failed "$MCP_ADD"
  fi
fi

open "$APP"
t launched
