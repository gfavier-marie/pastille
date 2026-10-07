// Textes de l'interface en italien (traduction de fr.ts, même forme).

import type { Lang } from '@pastille/shared';
import type { Texts } from './fr.ts';
import { clock, daysAgo, hhmm, isMac, isoDay, longDate, minutesAgo, pluralFor, shortDate } from './util.ts';

const plural = pluralFor('it');

function day(iso: string) {
  const days = daysAgo(iso);
  if (days === 0) return 'oggi';
  if (days === 1) return 'ieri';
  return shortDate('it', iso);
}

// Élision devant 1, 8 et 11 : « l'8 ott », « dall'11 ott ».
const elides = (date: string) => /^(1|8|11) /.test(date);

function since(iso: string) {
  const min = minutesAgo(iso);
  if (min < 1) return 'da poco';
  if (min < 60) return `da ${min} min`;
  if (min < 24 * 60) return `da ${plural(Math.floor(min / 60), 'ora', 'ore')}`;
  if (daysAgo(iso) === 1) return 'da ieri';
  const date = day(iso);
  return elides(date) ? `dall'${date}` : `dal ${date}`;
}

function seenOn(iso: string) {
  const date = day(iso);
  if (daysAgo(iso) < 2) return date;
  return elides(date) ? `l'${date}` : `il ${date}`;
}

const sketchOf = (i: number, n: number) => `Schizzo ${i} di #${n}`;
const inspirationOf = (i: number, n: number) => `Ispirazione ${i} di #${n}`;
const inspirationNote = 'screenshot di un altro sito, modello del risultato desiderato (non è la schermata da modificare)';

export const it: Texts = {

  lang: 'it' as Lang,
  locale: 'it-IT',
  plural,
  day,
  since,
  points: (n: number) => plural(n, 'punto', 'punti'),
  screens: (n: number) => plural(n, 'schermata', 'schermate'),
  transcriptions: (n: number) => plural(n, 'trascrizione', 'trascrizioni'),
  reveal: isMac ? 'Mostra nel Finder' : 'Mostra in Esplora file',

  // Retour visuel du mode vidéo (pastille qui suit la souris)
  videoFeedback: {
    microphone: 'Microfono aperto',
    point: (n: number) => `Punto ${n}`,
    general: 'Nota generale',
    speak: 'Parla per tenere questo punto',
    ready: 'Fai clic, poi parla',
    drawing: 'Disegna sul tablet',
    drawingReady: 'Il disegno viene allegato a questo punto',
    gestures: `Trascina: riquadro · ⇧: freccia · ${isMac ? '⌥' : 'Alt'}: ritaglia`,
    chooseInspiration: 'Scegli un’ispirazione',
    inspirationHint: (shortcut: string) => `Apri la pagina di riferimento, poi premi ${shortcut}`,
    captureInspiration: 'Cattura l’ispirazione',
    resume: 'Riprendi la registrazione',
    pointUnavailable: 'Impossibile salvare il punto. Fai di nuovo clic su un elemento.',
  },

  menu: {
    label: 'VibeScreener',
    noSession: 'Nessuna sessione aperta',
    noSessionHint: 'La prossima cattura ne apre una.',
    tablet: 'Tablet connesso',
    capture: 'Nuova cattura',
    video: 'Registra un video',
    stopVideo: 'Interrompi la registrazione',
    editor: "Apri l'editor",
    exportPdf: 'Esporta il PDF',
    newSession: 'Nuova sessione',
    recents: 'Sessioni recenti',
    allSessions: 'Tutte le sessioni…',
    reexport: (name: string) => `Riesporta il PDF di ${name}`,
    pair: 'Associa un tablet…',
    claudeCode: 'Collega Claude Code…',
    settings: 'Impostazioni…',
    quit: 'Esci da VibeScreener',
    update: (version: string) => `Aggiorna (versione ${version})`,
    trial: (days: number) => `Prova gratuita: ${plural(days, 'giorno', 'giorni')}`,
    buy: 'Acquista',
    license: { expired: 'Prova terminata', revoked: 'Licenza non più valida', unverified: 'Licenza da verificare' },
    pending: (n: number) => `${plural(n, 'trascrizione', 'trascrizioni')} in corso`,
    errors: (n: number) => plural(n, 'trascrizione non riuscita', 'trascrizioni non riuscite'),
  },

  bar: {
    label: 'Sessione VibeScreener',
    capture: 'Cattura',
    newCapture: 'Nuova cattura',
    editor: "Apri l'editor",
    exportPdf: 'Esporta il PDF',
    hide: 'Nascondi la barra',
    tablet: 'Tablet',
    exported: { pdf: 'PDF esportato', markdown: 'Cartella Markdown esportata', pptx: 'PowerPoint esportato' },
    copied: 'PDF copiato negli appunti',
  },

  overlay: {
    hints: [
      ['Clic', 'cattura la finestra e aggiunge il punto {n}'],
      ['Trascina', `area, ${isMac ? '⌥' : 'Alt'} per ritagliare`],
      ['⇧ Clic', 'ultima area'],
      ['Esc', 'annulla'],
    ] as [string, string][],
    inspirationHints: [
      ['Clic', 'cattura la finestra'],
      ['Trascina', 'area'],
      ['⇧ Clic', 'ultima area'],
      ['Esc', 'torna al punto'],
    ] as [string, string][],
    wholeScreen: 'Schermo intero',
    zone: 'Area',
    crop: 'Ritaglio',
    screen: (session: string, index: number) => `${session} · schermata ${index}`,
    inspiration: (n: number) => `Ispirazione per il punto #${n}`,
  },

  settings: {
    tabs: { general: 'Generali', transcription: 'Trascrizione', export: 'Esporta PDF', devices: 'Dispositivi', claude: 'Claude Code', license: 'Licenza' },
    capture: 'Cattura',
    shortcut: 'Scorciatoia di cattura',
    shortcutAria: (label: string) => `Modifica la scorciatoia, attualmente ${label}`,
    shortcutListening: 'Premi la combinazione…',
    shortcutHint: isMac
      ? 'Evita ⇧⌘3, ⇧⌘4 e ⇧⌘5, riservate a macOS. Fai clic, poi premi la nuova combinazione.'
      : 'Fai clic, poi premi la nuova combinazione.',
    shortcutTaken: "Questa scorciatoia non è disponibile: scegline un'altra.",
    shortcutUnsupported: isMac
      ? 'Combinazione non supportata: ⌘, ⌥, ⇧ o ⌃ con una lettera, una cifra o da F1 a F12.'
      : 'Combinazione non supportata: Ctrl, Alt o Shift con una lettera, una cifra della fila in alto (non del tastierino numerico) o da F1 a F12.',
    comment: 'Commento',
    mode: 'Modalità',
    modes: { auto: 'Dettatura auto', push: 'Premi per parlare', keyboard: 'Solo tastiera' },
    modeHints: {
      auto: 'Aggiungere un punto apre il microfono.',
      push: `Tieni premuto ${isMac ? '⌥' : 'Alt'} per dettare sul punto selezionato.`,
      keyboard: 'Niente microfono: scrivi il commento.',
    },
    silence: 'Interrompi la dettatura dopo un silenzio di',
    silenceSwitch: 'Stop dopo un silenzio',
    less: 'Meno',
    more: 'Più',
    seconds: (s: number) => `${s} s`,
    language: 'Lingua della dettatura',
    languages: { fr: 'Francese', en: 'Inglese', es: 'Spagnolo', de: 'Tedesco', it: 'Italiano', auto: 'Rilevamento automatico' } as Record<string, string>,
    export: 'Esportazione',
    exportDir: 'Cartella di esportazione',
    choose: 'Scegli…',
    copyPdf: "Copia il PDF negli appunti dopo l'esportazione",
    app: 'VibeScreener',
    uiLanguage: "Lingua dell'interfaccia",
    uiLanguageAuto: 'Automatica (lingua del sistema)',
    openAtLogin: `Apri VibeScreener all'avvio ${isMac ? 'del Mac' : 'del computer'}`,
    floatingBar: 'Barra fluttuante durante una sessione',
    floatingBarHint: 'Contatore dei punti, cattura ed esportazione, sempre a portata di mano.',
    engine: 'Motore',
    engines: { local: 'Whisper locale', api: 'API con chiave' },
    engineHints: {
      local: "Offline: l'audio non lascia questo computer.",
      api: "Alternativa: l'audio viene inviato al servizio scelto.",
    },
    model: 'Whisper large-v3-turbo',
    modelDetail: 'Quantizzato q5_0 · 547 MB',
    modelState: { ready: 'Pronto', loading: 'Caricamento…', missing: 'Non scaricato', error: 'Errore' },
    download: 'Scarica',
    apiUrl: "Indirizzo dell'API (compatibile OpenAI)",
    apiModel: 'Modello',
    apiKey: 'Chiave',
    apiKeySaved: 'salvata',
    save: 'Salva',
    glossary: 'Glossario',
    glossaryHint: 'Termini da riconoscere bene (nomi dei componenti, gergo del progetto).',
    context: 'Contesto del progetto',
    contextHint: 'In cima alle esportazioni e alla revisione letta da Claude Code. Vale per la sessione aperta e per le successive.',
    contextPlaceholder: 'Progetto, stack, pagina testata',
    instructions: "Istruzioni per l'IA",
    instructionsHint: 'In cima al PDF, al Markdown e alla revisione letta da Claude Code. {N} viene sostituito dal numero di feedback.',
    claudeCode: 'Claude Code',
    claudeCodeCommand: 'Per collegarlo, esegui una volta questo comando in un terminale:',
    claudeCodeHint:
      'Claude Code potrà così leggere le tue revisioni (sessioni, feedback, catture annotate) finché VibeScreener è in esecuzione. Chiedigli per esempio “applica la revisione VibeScreener”.',
    claudeCodeOff: 'Server per Claude Code non avviato.',
    claudeCodeSeen: (iso: string) =>
      `Connesso ${seenOn(iso)} alle ${clock('it', iso)}`,
    claudeCodeNever: 'Non ancora connesso',
    copy: 'Copia',
    copied: 'Copiato',
    tablet: 'Tablet',
    tabletPaired: 'Tablet associato',
    tabletNone: 'Nessun tablet associato',
    tabletConnected: 'Connesso',
    tabletOffline: 'Offline',
    tabletHint: 'Il tablet disegna gli schizzi del punto selezionato. Il collegamento è crittografato end-to-end.',
    showQr: 'Mostra il QR',
    pair: 'Associa…',
    revoke: 'Revoca',
    license: 'Licenza',
    licenseStates: {
      trial: (days: number) => `Prova gratuita: ${plural(days, 'giorno rimanente', 'giorni rimanenti')}`,
      expired: () => 'Prova terminata',
      licensed: () => 'Licenza attiva',
      revoked: () => 'Licenza non più valida',
      unverified: () => 'Licenza da verificare',
    },
    licenseDetails: {
      trial: 'Tutte le funzioni, senza carta di credito.',
      expired: 'Acquista una licenza per tornare a catturare.',
      licensed: 'Grazie per sostenere VibeScreener!',
      revoked: 'Abbonamento terminato o acquisto rimborsato.',
      unverified: 'Polar non risponde da 30 giorni: connettiti a Internet.',
    },
    buy: 'Acquista',
    portal: 'Gestisci il mio acquisto',
    licenseKey: 'Chiave di licenza',
    licenseKeyHint: "La trovi nell'e-mail ricevuta dopo l'acquisto.",
    activate: 'Attiva',
    activating: 'Attivazione…',
    activated: `Licenza attivata su ${isMac ? 'questo Mac' : 'questo computer'}.`,
    licenseHint:
      'Senza licenza, finita la prova, le nuove catture sono bloccate. Le tue sessioni, le esportazioni e Claude Code restano accessibili.',
  },

  welcome: {
    step: (n: number) => `Passo ${n} di 3`,
    continue: 'Continua',
    back: 'Indietro',
    finish: 'Fine',
    permissions: {
      title: isMac ? 'Due autorizzazioni per iniziare' : "Un'autorizzazione per iniziare",
      intro: "VibeScreener cattura la finestra che stai rivedendo e ascolta i tuoi commenti. Le immagini e l'audio restano su questo computer.",
      screen: 'Registrazione schermo',
      screenWhy: 'Per catturare la finestra da rivedere a piena risoluzione.',
      mic: 'Microfono',
      micWhy: 'Per dettare un commento su ogni punto aggiunto.',
      granted: 'Concessa',
      allow: 'Consenti',
      relaunch: "macOS potrebbe chiederti di riavviare VibeScreener dopo aver consentito la registrazione dello schermo: questa procedura si riaprirà.",
      keyboardOnly: 'Niente microfono? Passa a solo tastiera',
      keyboardChosen: 'Solo tastiera: il microfono non verrà usato.',
    },
    model: {
      title: 'Il modello di dettatura si sta scaricando',
      titleReady: 'Il modello di dettatura è pronto',
      intro: 'Whisper trascrive su questo computer, offline. Il download avviene una sola volta.',
      name: 'Whisper large-v3-turbo',
      detail: 'Quantizzato q5_0 · 547 MB · funziona bene in italiano',
      progress: (percent: number) => `${Math.round((percent * 547) / 100)} MB di 547 MB`,
      ready: 'Pronto',
      retry: 'Riprova',
      note: 'Puoi continuare senza aspettare. La tastiera funziona già; la dettatura si attiverà da sola a fine download.',
      useApi: "Usa invece un'API con chiave",
      apiChosen: 'Trascrizione via API: inserisci la chiave nelle impostazioni.',
    },
    shortcut: {
      title: 'Prova la scorciatoia',
      intro: (keys: number) =>
        `Apri la pagina da rivedere, poi premi ${keys > 2 ? 'questi tasti insieme' : 'questa scorciatoia'}. Dopo, VibeScreener resta ${isMac ? 'nel Dock e nella barra dei menu' : "nell'area di notifica"}.`,
      waiting: 'In attesa dei tasti…',
      steps: [
        ['Scorciatoia', 'Lo schermo si blocca.'],
        ["Clic sull'elemento", 'Il punto è aggiunto, il microfono si apre.'],
        ['Parla', "Poi fai clic sull'elemento successivo."],
      ] as [string, string][],
      openAtLogin: `Apri VibeScreener all'avvio ${isMac ? 'del Mac' : 'del computer'}`,
      other: "Scegli un'altra scorciatoia",
    },
    trial: (days: number) => `Prova gratuita: ancora ${plural(days, 'giorno', 'giorni')}, tutte le funzioni, senza carta di credito.`,
  },

  pairing: {
    title: 'Scansiona questo codice con il tablet',
    qr: 'Codice QR di associazione',
    waiting: 'In attesa del tablet…',
    connected: 'Tablet connesso',
    steps: [
      'Apri la fotocamera del tablet e inquadra il codice.',
      'Tocca il link, poi Condividi › Aggiungi alla schermata Home per installarlo.',
      'Fatto: il tablet si ricollegherà da solo a ogni apertura.',
    ],
    secure: 'Crittografato end-to-end. La chiave è nel codice e non passa mai dal server: mostralo solo al tuo tablet.',
    devices: 'Dispositivi associati',
    tablet: 'Tablet',
    online: 'Connesso',
    revoke: 'Revoca',
    revokeHint: 'Viene creato un nuovo codice: il tablet dovrà scansionarlo di nuovo.',
  },

  editor: {
    rename: 'Rinomina la sessione',
    sessions: 'Sessioni',
    allSessions: 'Tutte le sessioni',
    noSessions: 'Nessuna sessione salvata.',
    sessionOpen: 'aperta',
    openSession: (name: string) => `Apri ${name}`,
    exportSession: (name: string) => `Esporta il PDF di ${name}`,
    trashSession: (name: string) => `Sposta ${name} nel cestino`,
    close: 'Chiudi',
    tablet: 'Tablet connesso',
    export: 'Esporta',
    formats: { pdf: "PDF per l'IA", markdown: 'Cartella Markdown + immagini', pptx: 'PowerPoint (presentazione)' },
    exporting: { pdf: 'Esportazione PDF…', markdown: 'Esportazione Markdown…', pptx: 'Esportazione PowerPoint…' },
    exported: (path: string) => `Esportato: ${path}`,
    stageHints: [
      ['Clic', 'punto'],
      ['Trascina', 'area'],
      ['⇧ Trascina', 'freccia'],
    ] as [string, string][],
    zoomOut: 'Riduci',
    zoomIn: 'Ingrandisci',
    screenTitle: (index: number, points: number) => `Schermata ${index} · ${plural(points, 'punto', 'punti')}`,
    previous: 'Cattura precedente',
    next: 'Cattura successiva',
    noPoints: 'Fai clic sulla cattura per aggiungere un punto.',
    undoAll: (mod: string) => `${mod}Z annulla tutto, anche un'eliminazione`,
    panel: 'Punti e note',
    pointsTab: 'Punti',
    notes: 'Note generali',
    note: 'Nota',
    addNote: 'Aggiungi una nota',
    notesHint: 'senza un punto preciso',
    notePlaceholder: 'La tua nota…',
    dictateNote: 'Continua a dettare',
    dictateMore: (mod: string) => `Continua a dettare (${mod}M)`,
    keyDictate: (mod: string) => [`${mod}M`, 'continua a dettare'] as [string, string],
    stopDictation: 'Interrompi la dettatura',
    deleteNote: 'Elimina la nota',
    kinds: { point: 'Punto', zone: 'Area', arrow: 'Freccia' },
    dictated: 'Dettato',
    typed: 'Digitato',
    transcribing: 'trascrizione…',
    transcriptionError: 'Trascrizione non riuscita',
    retry: 'Riprova',
    recording: 'Dettatura in corso',
    tabletDraws: 'il tablet disegna per questo punto',
    sketches: (n: number) => `${plural(n, 'schizzo', 'schizzi')} · tablet`,
    zoomSketch: 'Ingrandisci lo schizzo',
    deleteSketch: 'Elimina lo schizzo',
    inspiration: 'Ispirazione',
    inspirationTitle: (shortcut: string, mod: string) =>
      `Allega l'esempio di un altro sito: l'editor si nasconde, apri la pagina modello e premi ${shortcut}. Oppure incolla un'immagine (${mod}V).`,
    inspirationHint: (shortcut: string, mod: string) => `poi ${shortcut} sulla pagina modello, o ${mod}V`,
    inspirations: (n: number) => plural(n, 'ispirazione', 'ispirazioni'),
    zoomInspiration: "Ingrandisci l'ispirazione",
    deleteInspiration: "Elimina l'ispirazione",
    imageNeedsPoint: "Prima seleziona un punto: l'immagine diventerà la sua ispirazione.",
    unreadableImage: 'Immagine illeggibile.',
    deletePoint: 'Elimina il punto',
    noComment: 'Nessun commento',
    bubbleLabel: (n: number) => `Commento del punto ${n}`,
    placeholderRecording: 'Parla, o digita per scrivere…',
    placeholder: 'Il tuo commento…',
    sketchHint: 'Schizzo: disegna sul tablet',
    keys: [
      ['Invio', 'conferma'],
      ['Esc', 'annulla'],
    ] as [string, string][],
    keyToType: ['un tasto', 'passa alla tastiera'] as [string, string],
    thumb: (index: number, first?: number, last?: number) =>
      `Schermata ${index} · ${first === undefined ? 'nessun punto' : first === last ? `#${first}` : `#${first}–${last}`}`,
    thumbLabel: (index: number, points: number, current: boolean) =>
      `Schermata ${index}, ${plural(points, 'punto', 'punti')}${current ? ', visualizzata' : ''}`,
    captures: 'Catture della sessione',
    deleteScreen: (index: number) => `Elimina la schermata ${index} e i suoi punti`,
    screenDeleted: (index: number, mod: string) => `Schermata ${index} eliminata · ${mod}Z per annullare`,
    newCapture: 'Nuova cattura',
    emptyTitle: 'Ancora nessuna cattura',
    emptyBefore: 'Sullo schermo da rivedere, premi',
    emptyAfter: "poi fai clic sull'elemento da correggere.",
    micError: (err: unknown) => `Microfono non disponibile: ${err}`,
    zoomedImage: 'Immagine ingrandita',
  },

  main: {
    windows: { pairing: 'Associa un tablet', settings: 'Impostazioni di VibeScreener', welcome: 'Benvenuto in VibeScreener' },
    newReview: 'Nuova revisione',
    cancel: 'Annulla',
    nothingToExport: 'Niente da esportare: nessuna cattura.',
    untranscribed: 'Alcune dettature non sono ancora state trascritte.',
    untranscribedPending: (list: string) => `In corso: ${list}`,
    untranscribedError: (list: string) => `Non riuscite: ${list}`,
    exportAnyway: 'Esporta comunque',
    exportCancelled: 'Esportazione annullata.',
    note: (n: number) => `nota ${n}`,
    update: (version: string) => `Aggiornare VibeScreener alla versione ${version}?`,
    updateDetail: "L'app si chiude, si aggiorna e si riapre (circa un minuto). Sessioni e impostazioni vengono conservate.",
    updateDetailMac: "Poiché l'app non è firmata da Apple, macOS chiederà di nuovo l'autorizzazione per la registrazione dello schermo, il microfono e l'accessibilità (modalità video).",
    updateNow: 'Aggiorna',
    later: 'Più tardi',
    shortcutTaken: (label: string) => `${label} è già in uso da un'altra applicazione.`,
    shortcutTakenAtStart: (label: string) => `La scorciatoia ${label} è già in uso da un'altra applicazione.`,
    shortcutTakenDetail: "Scegline un'altra nelle impostazioni. Puoi comunque catturare dall'icona di VibeScreener.",
    trash: (name: string) => `Spostare la sessione “${name}” nel cestino?`,
    trashDetail: 'Le sue catture e i suoi commenti la seguono. Potrai recuperarla dal cestino.',
    trashConfirm: 'Sposta nel cestino',
    trashFailed: (err: string) => `Impossibile spostare nel cestino: ${err}`,
    mcpPortTaken: (port: number) => `La porta ${port} è già occupata (un'altra copia di VibeScreener?): Claude Code non può connettersi.`,
    mcpUnavailable: (err: string) => `Server per Claude Code non disponibile: ${err}`,
    captureDenied:
      'Cattura impossibile: consenti la registrazione dello schermo (Impostazioni di Sistema > Privacy e sicurezza), poi riavvia VibeScreener.',
    captureFailed: 'Cattura impossibile: non è stato possibile leggere lo schermo.',
    video: {
      clicks: 'La modalità video deve vedere i tuoi clic.',
      clicksDetail: (shortcut: string) =>
        `Autorizza VibeScreener in Impostazioni di Sistema > Privacy e sicurezza > Accessibilità, poi riavvia la registrazione (${shortcut}).`,
      openSettings: 'Apri Impostazioni',
      empty: 'Nessun punto registrato.',
      emptyDetail: 'Durante la registrazione, fai clic su un elemento e poi parla: ogni clic seguito da parole diventa un punto.',
      shortcutTaken: (label: string) => `La scorciatoia ${label} della modalità video è già usata da un'altra app.`,
      shortcutTakenDetail: 'La modalità video resta disponibile dall’icona di VibeScreener.',
      denied: "Registrazione impossibile: autorizza la registrazione dello schermo (Impostazioni di Sistema > Privacy e sicurezza), poi riavvia VibeScreener.",
      unreadable: 'Registrazione impossibile: non è stato possibile leggere lo schermo.',
      noResponse: 'gli schermi o il microfono non rispondono.',
      failed: (err: string) => `Registrazione impossibile: ${err}`,
    },
    tray: {
      session: (name: string, points: number) => `VibeScreener — ${name} (${plural(points, 'punto', 'punti')})`,
      recording: 'dettatura in corso',
      pending: (n: number) => `${plural(n, 'trascrizione', 'trascrizioni')} in corso`,
      errors: (n: number) => plural(n, 'trascrizione non riuscita', 'trascrizioni non riuscite'),
      tablet: 'tablet connesso',
    },
    appMenu: {
      about: 'Informazioni su VibeScreener',
      settings: 'Impostazioni…',
      hide: 'Nascondi VibeScreener',
      quit: 'Esci da VibeScreener',
      edit: 'Modifica',
      undo: 'Annulla',
      redo: 'Ripeti',
      cut: 'Taglia',
      copy: 'Copia',
      paste: 'Incolla',
      selectAll: 'Seleziona tutto',
      window: 'Finestra',
      minimize: 'Contrai',
      close: 'Chiudi',
    },
    license: {
      emptyKey: 'Incolla la chiave ricevuta per e-mail.',
      notForSale: 'Le licenze non sono ancora in vendita: riprova presto.',
      offline: 'Polar non è raggiungibile: controlla la connessione a Internet.',
      unknownKey: "Chiave sconosciuta: controllala nell'e-mail ricevuta dopo l'acquisto.",
      refused: `Chiave rifiutata: già attivata sul numero massimo di ${isMac ? 'Mac' : 'computer'}, revocata o scaduta.`,
      polarError: (status: number) => `Polar non risponde correttamente (errore ${status}): riprova più tardi.`,
    },
    whisper: {
      modelMissing: 'Modello Whisper assente: scaricalo nelle impostazioni.',
      binMissing: 'whisper-server non trovato.',
      unavailable: (status: string) => `Trascrizione non disponibile: ${status}`,
      download: (status: number, url: string) => `Download non riuscito (${status}): ${url}`,
      stopped: (stderr: string) => `whisper-server si è arrestato all'avvio:\n${stderr}`,
      timeout: 'whisper-server non risponde dopo 120 s',
    },
  },

  exports: {
    colon: ': ',
    date: (iso: string) => longDate('it-IT', iso),
    reviewFile: 'revisione',
    partFile: (i: number, n: number) => `parte-${i}-di-${n}`,
    part: (i: number, n: number) => `parte ${i}/${n}`,
    partScreens: (first: number, last: number) => `questa parte: schermate da ${first} a ${last}`,
    screen: (n: number) => `Schermata ${n}`,
    position: 'Posizione',
    point: (x: number, y: number, size: string) => `x ${x}, y ${y} ${size}`,
    zone: (x: number, y: number, w: number, h: number, size: string) => `area x ${x}, y ${y}, ${w} × ${h} ${size}`,
    arrow: (x1: number, y1: number, x2: number, y2: number, size: string) => `freccia da (${x1}, ${y1}) a (${x2}, ${y2}) ${size}`,
    on: (w: number, h: number) => `su ${w} × ${h}`,
    yes: 'sì',
    no: 'no',
    context: 'Contesto',
    instructions: 'Istruzioni',
    notes: 'Note generali',
    summary: 'Riepilogo',
    columns: { screen: 'Schermata', comment: 'Commento', sketch: 'Schizzo', inspiration: 'Ispirazione' },
    noComment: '(nessun commento)',
    zoomOn: (n: number) => `Zoom su #${n}`,
    sketchOf,
    inspiration: 'Ispirazione',
    inspirationOf,
    inspirationNote,
  },

  mcp: {
    instructions: `VibeScreener registra revisioni di interfaccia: screenshot in cui ogni feedback è un punto numerato (da #1 a #N) con un commento, spesso dettato, e a volte uno schizzo o un'ispirazione (screenshot di un altro sito che mostra il risultato desiderato, non la schermata da modificare).
Per applicare una revisione al codice: se l'utente non specifica altro, prendere la sessione aperta in VibeScreener (scelta predefinita), altrimenti sceglierla con lister_sessions. lire_revue fornisce tutti i feedback; voir_ecran mostra, schermata per schermata, lo screenshot annotato, uno zoom attorno a ogni punto, gli schizzi e le ispirazioni. Guardare ogni schermata prima di modificare il codice. Se un feedback è ambiguo, fare una domanda invece di tirare a indovinare.`,
    sessionParam: 'Id della sessione (vedi lister_sessions). Predefinita: la sessione aperta in VibeScreener, altrimenti la più recente.',
    listTool: 'Elenca le sessioni di revisione recenti (nome, data, numero di punti, id), dalla più recente.',
    reviewTool:
      "Tutti i feedback di una sessione, in testo: contesto, istruzioni, poi ogni punto (numero, schermata, commento, posizione, schizzi, ispirazioni). Le immagini si ottengono con voir_ecran.",
    screenTool:
      "Una schermata di una sessione: lo screenshot con i suoi punti numerati, poi per ogni punto il suo commento, uno zoom attorno all'elemento indicato, i suoi schizzi e le sue ispirazioni (screenshot di altri siti, modelli del risultato desiderato).",
    screenParam: 'Numero della schermata, da 1 al numero di schermate indicato da lire_revue.',
    noSession: 'Nessuna sessione: fare prima una cattura con VibeScreener.',
    notFound: (id: string) => `Sessione “${id}” non trovata.`,
    notFoundList: (id: string) => `Sessione “${id}” non trovata: vedi lister_sessions.`,
    noSessions: 'Ancora nessuna sessione.',
    sessions: 'Sessioni, dalla più recente:',
    sessionLine: (name: string, date: string, points: number, id: string, open: boolean) =>
      `- ${name} · ultima modifica: ${date} · ${plural(points, 'punto', 'punti')} · id: ${id}${open ? ' (aperta in VibeScreener)' : ''}`,
    untranscribed: (list: string) => `Attenzione: dettatura non ancora trascritta per ${list}; il commento potrebbe essere incompleto.`,
    noPoints: '(nessun punto)',
    sketches: (n: number) => plural(n, 'schizzo', 'schizzi'),
    inspirations: (n: number) => plural(n, 'ispirazione', 'ispirazioni'),
    seeScreens: (n: number) =>
      `Per vedere lo screenshot annotato, lo zoom di ogni punto, gli schizzi e le ispirazioni: voir_ecran con ecran da 1 a ${n}.`,
    noScreen: (screen: string, name: string, screens: number) =>
      `Schermata ${screen} inesistente: la sessione “${name}” ha ${plural(screens, 'schermata', 'schermate')}.`,
    zoom: "Zoom sull'elemento indicato:",
    error: (err: string) => `Errore di VibeScreener: ${err}`,
  },

  glossary:
    "Feedback sull'interfaccia: pulsante, border-radius di 8 px, padding, margin, header, footer, " +
    'sidebar, navbar, finestra modale, dropdown, hover, focus, flexbox, grid, z-index, opacità.',

  instructions: `Questo documento elenca {N} feedback su un'interfaccia, numerati da #1 a #{N}.
Ogni feedback indica un elemento in uno screenshot: il pallino numerato e il
ritaglio mostrano l'elemento in questione, un rettangolo indica un'area, una freccia uno spostamento.
Applica ogni feedback nel codice. Se un feedback è ambiguo, fai una domanda invece
di tirare a indovinare. Alla fine, elenca i numeri trattati e quelli non trattati.`,

  sessionName: (d: Date) => `Revisione ${isoDay(d)} ${hhmm(d, ':')}`,
};
