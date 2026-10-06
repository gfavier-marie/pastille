// Licence : un essai qui part du premier lancement, puis une clé Polar activée et vérifiée
// directement auprès de l'API publique de Polar, sans serveur à nous (ROADMAP, « Monétisation »).
// Achat unique ou abonnement, c'est pareil ici : Polar révoque la clé d'un abonnement résilié
// (ou d'un achat remboursé) et la vérification suivante le voit. État dans license.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Durée de l'essai en jours ; la changer vaut aussi pour les essais en cours. */
export const TRIAL_DAYS = 14;
// Domaine provisoire (M0) : à remplacer partout par le domaine acheté.
export const SITE_URL = 'https://vibescreener.dev';
// Organisation Polar (Settings > Organization ID) et portail client, en production et dans le
// bac à sable (essais : PASTILLE_POLAR=sandbox). Production à renseigner au lancement (M4).
export const POLAR = {
  production: { api: 'https://api.polar.sh', org: '', portal: 'https://polar.sh/vibescreener/portal' },
  sandbox: { api: 'https://sandbox-api.polar.sh', org: '7e12481a-4021-46fb-a821-54346f6427be', portal: 'https://sandbox.polar.sh/vibescreener/portal' },
};

const DAY = 86_400_000;
const CHECK_EVERY = DAY; // la clé est revérifiée une fois par jour
const OFFLINE_GRACE = 30 * DAY; // Polar injoignable : sa dernière réponse vaut 30 jours

export type LicenseView = {
  state: 'trial' | 'expired' | 'licensed' | 'revoked' | 'unverified';
  daysLeft: number; // de l'essai, 0 une fois fini
  key: string; // clé masquée (« ••••1A2B »), vide sans clé
};

type Stored = {
  trialStartedAt: string;
  installId: string; // identifiant aléatoire, nom de l'activation chez Polar (pas le nom du Mac)
  key?: string;
  activationId?: string;
  checkedAt?: string; // dernière réponse de Polar sur la clé
  valid?: boolean; // cette réponse : clé accordée ou refusée
};

export function createLicense(opts: {
  dataDir: string;
  trialDays?: number;
  polar?: { api: string; org: string }; // POLAR.production par défaut
  now?: () => number;
  fetch?: typeof fetch;
}) {
  const path = join(opts.dataDir, 'license.json');
  const now = opts.now ?? Date.now;
  const fetchFn = opts.fetch ?? fetch;
  const trialDays = opts.trialDays ?? TRIAL_DAYS;
  const polar = opts.polar ?? POLAR.production;

  let data: Stored | null = null;
  try {
    if (existsSync(path)) data = JSON.parse(readFileSync(path, 'utf8')) as Stored;
  } catch {
    // illisible : un nouvel essai commence
  }
  if (!data) {
    data = { trialStartedAt: new Date(now()).toISOString(), installId: crypto.randomUUID() };
    save();
  }
  const stored = data;

  function save() {
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  function view(): LicenseView {
    const daysLeft = Math.max(0, Math.ceil((Date.parse(stored.trialStartedAt) + trialDays * DAY - now()) / DAY));
    if (!stored.key) return { state: daysLeft > 0 ? 'trial' : 'expired', daysLeft, key: '' };
    const key = `••••${stored.key.slice(-4)}`;
    if (!stored.valid) return { state: 'revoked', daysLeft, key };
    const stale = now() - Date.parse(stored.checkedAt ?? '') > OFFLINE_GRACE;
    return { state: stale ? 'unverified' : 'licensed', daysLeft, key };
  }

  async function post(endpoint: 'activate' | 'validate', body: Record<string, string>) {
    return fetchFn(`${polar.api}/v1/customer-portal/license-keys/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: polar.org, ...body }),
    });
  }

  /** Active la clé sur ce Mac (Polar limite le nombre de Mac par clé). */
  async function activate(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const key = input.trim();
    if (!key) return { ok: false, error: 'Collez la clé reçue par e-mail.' };
    if (!polar.org) return { ok: false, error: "Les licences ne sont pas encore en vente : réessayez bientôt." };
    let res: Response;
    try {
      res = await post('activate', { key, label: `Mac ${stored.installId.slice(0, 8)}` });
    } catch {
      return { ok: false, error: 'Polar est injoignable : vérifiez la connexion à Internet.' };
    }
    if (res.status === 404 || res.status === 422) return { ok: false, error: "Clé inconnue : vérifiez-la dans l'e-mail reçu après l'achat." };
    if (res.status === 403) return { ok: false, error: 'Clé refusée : déjà activée sur le nombre maximal de Mac, révoquée ou expirée.' };
    if (!res.ok) return { ok: false, error: `Polar ne répond pas correctement (erreur ${res.status}) : réessayez plus tard.` };
    const activation = (await res.json()) as { id: string };
    Object.assign(stored, { key, activationId: activation.id, checkedAt: new Date(now()).toISOString(), valid: true });
    save();
    return { ok: true };
  }

  /** Revérifie la clé si la dernière réponse date de plus d'un jour ; sans réponse, rien ne change. */
  async function refresh() {
    if (!stored.key || !stored.activationId) return;
    if (now() - Date.parse(stored.checkedAt ?? '') < CHECK_EVERY) return;
    let status: number;
    try {
      status = (await post('validate', { key: stored.key, activation_id: stored.activationId })).status;
    } catch {
      return; // hors ligne
    }
    // 404 : clé révoquée, désactivée, expirée ou activation retirée. Autre erreur : on réessaiera.
    if (status !== 200 && status !== 404) return;
    Object.assign(stored, { checkedAt: new Date(now()).toISOString(), valid: status === 200 });
    save();
  }

  return {
    view,
    /** Nouvelles captures permises : essai en cours ou licence valable. */
    canCapture: () => ['trial', 'licensed'].includes(view().state),
    activate,
    refresh,
  };
}
