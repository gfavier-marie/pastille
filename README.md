# Pastille

Revue d'interface par captures annotées, dictée et croquis, exportée pour l'IA. Voir [docs/SPEC.md](docs/SPEC.md) et [ROADMAP.md](ROADMAP.md).

## Lancer les POC (lot 0)

Prérequis : Node 22.18 ou plus récent, pnpm, git.

```bash
pnpm install
pnpm setup:whisper   # modèle Whisper (547 Mo) + whisper-server
pnpm bench:dictee    # mesure de transcription, à coller dans la conversation
pnpm dev             # fenêtre « Pastille — POC » : capture et dictée au micro
```

- **macOS** : installer whisper.cpp avec `brew install whisper-cpp` avant `pnpm setup:whisper`. Au premier ⌘⇧2, autoriser l'enregistrement de l'écran (Réglages Système > Confidentialité et sécurité) pour l'application qui lance `pnpm dev`, puis relancer.
- **Windows** : `pnpm setup:whisper` télécharge aussi whisper.cpp (CPU x64) dans `vendor/whisper/`. Raccourci : Ctrl+Shift+2.

Dans la fenêtre POC, « Copier les mesures » met un tableau dans le presse-papiers.
