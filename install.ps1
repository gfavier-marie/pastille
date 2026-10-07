# Installe (ou met à jour) VibeScreener sur Windows, branche Claude Code et lance l'app, dans PowerShell :
#   irm https://vibescreener.dev/install.ps1 | iex
# Téléchargé par curl.exe, l'installeur n'est pas marqué « venu d'Internet » : pas d'alerte SmartScreen
# malgré l'absence de signature. PASTILLE_EXE_URL choisit un autre installeur (essais, CI).
& {
  $ErrorActionPreference = 'Stop'
  $url = if ($env:PASTILLE_EXE_URL) { $env:PASTILLE_EXE_URL } else { 'https://dl.vibescreener.dev/VibeScreener-Setup.exe' }
  $mcpUrl = 'http://127.0.0.1:3917/mcp'
  $app = "$env:LOCALAPPDATA\Programs\vibescreener\VibeScreener.exe" # installation pour l'utilisateur (NSIS)

  # Messages dans la langue de Windows, anglais par défaut ; {0} reçoit un chemin ou une commande.
  $messages = @{
    fr = @{
      win64 = 'VibeScreener demande Windows 10 ou 11 en 64 bits.'
      download = 'Téléchargement de VibeScreener…'
      downloadFailed = 'Téléchargement impossible : {0}'
      update = 'Mise à jour de VibeScreener'
      blocked = "Windows ou l'antivirus empêche de lancer l'installeur. Ouvrez-le à la main : {0}"
      installFailed = 'Installation échouée : {0} introuvable'
      installed = 'VibeScreener installée : {0}'
      noClaude = 'Claude Code absent. Pour le brancher plus tard : {0}'
      present = 'Claude Code : serveur MCP « vibescreener » déjà présent.'
      added = 'Claude Code : serveur MCP « vibescreener » ajouté.'
      addFailed = 'Claude Code : ajout impossible, à faire à la main : {0}'
      launched = "VibeScreener est lancée (icône dans la zone de notification, en bas à droite) : suivez l'assistant de premier lancement."
    }
    en = @{
      win64 = 'VibeScreener requires 64-bit Windows 10 or 11.'
      download = 'Downloading VibeScreener…'
      downloadFailed = 'Download failed: {0}'
      update = 'Updating VibeScreener'
      blocked = 'Windows or your antivirus is blocking the installer. Open it yourself: {0}'
      installFailed = 'Installation failed: {0} not found'
      installed = 'VibeScreener installed: {0}'
      noClaude = 'Claude Code not found. To connect it later: {0}'
      present = 'Claude Code: MCP server "vibescreener" already set up.'
      added = 'Claude Code: MCP server "vibescreener" added.'
      addFailed = 'Claude Code: could not add it, run this yourself: {0}'
      launched = 'VibeScreener is running (icon in the notification area, bottom right): follow the setup assistant.'
    }
    es = @{
      win64 = 'VibeScreener necesita Windows 10 u 11 de 64 bits.'
      download = 'Descargando VibeScreener…'
      downloadFailed = 'No se pudo descargar: {0}'
      update = 'Actualizando VibeScreener'
      blocked = 'Windows o el antivirus impide abrir el instalador. Ábrelo a mano: {0}'
      installFailed = 'La instalación ha fallado: no se encuentra {0}'
      installed = 'VibeScreener instalada: {0}'
      noClaude = 'Claude Code no está instalado. Para conectarlo más tarde: {0}'
      present = 'Claude Code: el servidor MCP «vibescreener» ya está configurado.'
      added = 'Claude Code: servidor MCP «vibescreener» añadido.'
      addFailed = 'Claude Code: no se pudo añadir, hazlo a mano: {0}'
      launched = 'VibeScreener está abierta (icono en el área de notificación, abajo a la derecha): sigue el asistente de inicio.'
    }
    de = @{
      win64 = 'VibeScreener benötigt Windows 10 oder 11 (64 Bit).'
      download = 'VibeScreener wird geladen …'
      downloadFailed = 'Download fehlgeschlagen: {0}'
      update = 'VibeScreener wird aktualisiert'
      blocked = 'Windows oder der Virenschutz blockiert das Installationsprogramm. Öffne es selbst: {0}'
      installFailed = 'Installation fehlgeschlagen: {0} nicht gefunden'
      installed = 'VibeScreener installiert: {0}'
      noClaude = 'Claude Code nicht gefunden. Später verbinden mit: {0}'
      present = 'Claude Code: MCP-Server „vibescreener“ ist bereits eingerichtet.'
      added = 'Claude Code: MCP-Server „vibescreener“ hinzugefügt.'
      addFailed = 'Claude Code: Hinzufügen fehlgeschlagen, bitte manuell ausführen: {0}'
      launched = 'VibeScreener läuft (Symbol im Infobereich, unten rechts): Folge dem Einrichtungsassistenten.'
    }
    it = @{
      win64 = 'VibeScreener richiede Windows 10 o 11 a 64 bit.'
      download = 'Download di VibeScreener…'
      downloadFailed = 'Download non riuscito: {0}'
      update = 'Aggiornamento di VibeScreener'
      blocked = "Windows o l'antivirus impedisce di avviare il programma di installazione. Aprilo a mano: {0}"
      installFailed = 'Installazione non riuscita: {0} non trovato'
      installed = 'VibeScreener installata: {0}'
      noClaude = 'Claude Code non trovato. Per collegarlo più tardi: {0}'
      present = 'Claude Code: server MCP «vibescreener» già configurato.'
      added = 'Claude Code: server MCP «vibescreener» aggiunto.'
      addFailed = 'Claude Code: impossibile aggiungerlo, fallo a mano: {0}'
      launched = "VibeScreener è in esecuzione (icona nell'area di notifica, in basso a destra): segui l'assistente iniziale."
    }
  }
  $lang = (Get-UICulture).TwoLetterISOLanguageName
  $t = if ($messages.ContainsKey($lang)) { $messages[$lang] } else { $messages.en }

  if (-not [Environment]::Is64BitOperatingSystem) { Write-Host $t.win64; return }

  $setup = Join-Path $env:TEMP 'VibeScreener-Setup.exe'
  Write-Host $t.download
  curl.exe -fL --progress-bar -o $setup $url # curl.exe est fourni avec Windows 10 et 11
  if ($LASTEXITCODE) { throw ($t.downloadFailed -f $url) }

  # Version en cours : fermée proprement (sessions enregistrées) avant d'être remplacée.
  if (Get-Process VibeScreener -ErrorAction SilentlyContinue) {
    Write-Host $t.update
    if (Test-Path $app) { & $app --quit }
    Wait-Process VibeScreener -Timeout 10 -ErrorAction SilentlyContinue
  }

  # Installation silencieuse, sans droits administrateur ; sessions et réglages restent.
  # Un antivirus qui analyse encore le fichier peut refuser le lancement un instant (« Accès refusé ») :
  # on réessaie. Sans -Wait, que certains antivirus empêchent aussi : on attend la fin par le nom du processus.
  for ($i = 1; ; $i++) {
    try { Start-Process $setup -ArgumentList '/S'; break }
    catch {
      if ($i -ge 5) { throw ($t.blocked -f $setup) }
      Start-Sleep 3
    }
  }
  while (Get-Process VibeScreener-Setup -ErrorAction SilentlyContinue) { Start-Sleep 1 }
  Remove-Item $setup -ErrorAction SilentlyContinue
  if (-not (Test-Path $app)) { throw ($t.installFailed -f $app) }
  Write-Host ($t.installed -f $app)

  $mcpAdd = "claude mcp add --transport http --scope user vibescreener $mcpUrl"
  # .exe ou .cmd seulement : un claude.ps1 (npm) serait bloqué par la stratégie d'exécution par défaut.
  $claude = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $claude) {
    Write-Host ($t.noClaude -f $mcpAdd)
  } else {
    $ErrorActionPreference = 'Continue' # la sortie d'erreur de claude n'interrompt pas le script
    & $claude.Source mcp get vibescreener *> $null
    if (-not $LASTEXITCODE) { Write-Host $t.present }
    else {
      & $claude.Source mcp add --transport http --scope user vibescreener $mcpUrl *> $null
      if (-not $LASTEXITCODE) { Write-Host $t.added }
      else { Write-Host ($t.addFailed -f $mcpAdd) }
    }
  }

  Start-Process $app
  Write-Host $t.launched
}
