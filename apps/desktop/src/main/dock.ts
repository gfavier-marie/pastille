// Icône du Dock (macOS) : visible tant qu'une fenêtre de l'app est ouverte (éditeur, réglages, assistant,
// appairage), retirée sinon ; l'app reste dans la barre des menus, où « Ouvrir l'éditeur » la fait revenir.
// Le retrait est différé : macOS ignore un masquage moins d'une seconde après un affichage, et une capture
// masque puis remontre les fenêtres. Sans electron ici, pour les tests.

export function createDock(opts: {
  open: () => boolean; // une fenêtre de l'app est ouverte (même masquée le temps d'une capture)
  busy: () => boolean; // capture en cours : on attend sa fin
  isVisible: () => boolean;
  show: () => Promise<void>;
  hide: () => void;
  delayMs?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Accorde l'icône aux fenêtres ouvertes. Vrai si elle vient d'apparaître (la fenêtre est à refocaliser). */
  async function sync(): Promise<boolean> {
    if (timer) clearTimeout(timer);
    timer = null;
    if (opts.open()) {
      if (opts.isVisible()) return false;
      await opts.show();
      return true;
    }
    timer = setTimeout(() => {
      timer = null;
      if (opts.busy()) return void sync();
      if (!opts.open() && opts.isVisible()) opts.hide();
    }, opts.delayMs ?? 1500);
    return false;
  }

  return { sync };
}
