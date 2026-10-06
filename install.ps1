# Installe (ou met à jour) VibeScreener sur Windows, branche Claude Code et lance l'app, dans PowerShell :
#   irm https://raw.githubusercontent.com/gfavier-marie/vibescreener/main/install.ps1 | iex
# Téléchargé par curl.exe, l'installeur n'est pas marqué « venu d'Internet » : pas d'alerte SmartScreen
# malgré l'absence de signature. PASTILLE_EXE_URL choisit un autre installeur (essais, CI).
& {
  $ErrorActionPreference = 'Stop'
  $url = if ($env:PASTILLE_EXE_URL) { $env:PASTILLE_EXE_URL } else { 'https://github.com/gfavier-marie/vibescreener/releases/latest/download/VibeScreener-Setup.exe' }
  $mcpUrl = 'http://127.0.0.1:3917/mcp'
  $app = "$env:LOCALAPPDATA\Programs\VibeScreener\VibeScreener.exe" # installation pour l'utilisateur (NSIS)

  if (-not [Environment]::Is64BitOperatingSystem) { Write-Host 'VibeScreener demande Windows 10 ou 11 en 64 bits.'; return }

  $setup = Join-Path $env:TEMP 'VibeScreener-Setup.exe'
  Write-Host 'Téléchargement de VibeScreener…'
  curl.exe -fL --progress-bar -o $setup $url # curl.exe est fourni avec Windows 10 et 11
  if ($LASTEXITCODE) { throw "Téléchargement impossible : $url" }

  # Version en cours : fermée proprement (sessions enregistrées) avant d'être remplacée.
  if (Get-Process VibeScreener -ErrorAction SilentlyContinue) {
    Write-Host 'Mise à jour de VibeScreener'
    if (Test-Path $app) { & $app --quit }
    Wait-Process VibeScreener -Timeout 10 -ErrorAction SilentlyContinue
  }

  # Installation silencieuse, sans droits administrateur ; sessions et réglages restent.
  Start-Process $setup -ArgumentList '/S' -Wait
  Remove-Item $setup
  if (-not (Test-Path $app)) { throw "Installation échouée : $app introuvable" }
  Write-Host "VibeScreener installée : $app"

  $mcpAdd = "claude mcp add --transport http --scope user vibescreener $mcpUrl"
  # .exe ou .cmd seulement : un claude.ps1 (npm) serait bloqué par la stratégie d'exécution par défaut.
  $claude = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $claude) {
    Write-Host "Claude Code absent. Pour le brancher plus tard : $mcpAdd"
  } else {
    $ErrorActionPreference = 'Continue' # la sortie d'erreur de claude n'interrompt pas le script
    & $claude.Source mcp get vibescreener *> $null
    if (-not $LASTEXITCODE) { Write-Host 'Claude Code : serveur MCP « vibescreener » déjà présent.' }
    else {
      & $claude.Source mcp add --transport http --scope user vibescreener $mcpUrl *> $null
      if (-not $LASTEXITCODE) { Write-Host 'Claude Code : serveur MCP « vibescreener » ajouté.' }
      else { Write-Host "Claude Code : ajout impossible, à faire à la main : $mcpAdd" }
    }
  }

  Start-Process $app
  Write-Host "VibeScreener est lancée (icône dans la zone de notification, en bas à droite) : suis l'assistant de premier lancement."
}
