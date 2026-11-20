// The password drop on the access page (fulfillment ONB-08, part 3).
//
// For the rare account with no way to invite us, the client can hand over a login. It goes
// from their browser, over HTTPS, through this server's memory, straight into one 1Password
// vault ("intake"). It is never written to a database, a log, an email, Slack or HQ. Sam or
// Mario then move the item into the client's own vault and delete it from intake.
//
// Needs two settings in Vercel:
//   OP_SERVICE_ACCOUNT_TOKEN   a 1Password service account that can read and write ONLY the intake vault
//   OP_INTAKE_VAULT            that vault's name or ID
// Without both, the drop is switched off and the page does not show it.

import { accountByKey, allowsLogin } from './access-accounts.js';

const clean = (s, max) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

export function dropEnabled(env = process.env) {
  return Boolean(env.OP_SERVICE_ACCOUNT_TOKEN && env.OP_INTAKE_VAULT);
}

/**
 * Check a drop before it goes to the vault.
 * Returns { ok: true, drop } or { ok: false, error }. The password is passed through untouched
 * (no trimming inside it) and is never included in an error.
 */
export function validateDrop(body) {
  const client = clean(body?.client, 60).toLowerCase();
  const account = accountByKey(clean(body?.account, 40));
  if (!/^[a-z0-9-]{1,60}$/.test(client)) return { ok: false, error: 'missing_client' };
  if (!account) return { ok: false, error: 'unknown_account' };
  if (!allowsLogin(account)) return { ok: false, error: 'login_not_accepted' };

  const username = clean(body?.username, 200);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username) return { ok: false, error: 'missing_username' };
  if (!password) return { ok: false, error: 'missing_password' };
  if (password.length > 200) return { ok: false, error: 'password_too_long' };

  let option = null;
  if (account.kind === 'choose' && body?.option) {
    option = account.options.find((o) => o.key === clean(body.option, 40)) || null;
  }
  return {
    ok: true,
    drop: {
      client,
      company: clean(body?.company, 160),
      account: account.key,
      account_name: option ? `${account.name} (${option.label})` : account.name,
      site: clean(body?.site, 300),
      username,
      password,
      note: clean(body?.note, 500),
    },
  };
}

const asUrl = (site) => {
  if (!site) return null;
  const withScheme = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  try { return new URL(withScheme).href; } catch { return null; }
};

/** The 1Password item for a drop. Plain data, so it can be tested without 1Password. */
export function vaultItem(drop, vaultId, today = new Date()) {
  const url = asUrl(drop.site);
  const day = today.toISOString().slice(0, 10);
  return {
    category: 'Login',
    vaultId,
    title: `${drop.company || drop.client}: ${drop.account_name}`,
    tags: ['surge-intake', drop.client],
    fields: [
      { id: 'username', title: 'username', fieldType: 'Text', value: drop.username },
      { id: 'password', title: 'password', fieldType: 'Concealed', value: drop.password },
    ],
    websites: url ? [{ url, label: 'sign-in page', autofillBehavior: 'AnywhereOnWebsite' }] : [],
    notes: [
      `Sent by the client on the Surge access page, ${day}.`,
      drop.site && !url ? `Where it is used: ${drop.site}` : '',
      drop.note ? `Client note: ${drop.note}` : '',
      'Next: move this into the client vault, delete it from intake, and switch to an invite when the account allows one.',
    ].filter(Boolean).join('\n'),
  };
}

let cached = null; // one client per warm server instance

async function vaultClient() {
  if (cached) return cached;
  const sdk = await import('@1password/sdk');
  const client = await sdk.createClient({
    auth: process.env.OP_SERVICE_ACCOUNT_TOKEN,
    integrationName: 'Surge onboarding access page',
    integrationVersion: 'v1.0.0',
  });
  // OP_INTAKE_VAULT can be the vault's ID or its name.
  const wanted = process.env.OP_INTAKE_VAULT.trim();
  const vaults = await client.vaults.list();
  const vault = vaults.find((v) => v.id === wanted) || vaults.find((v) => v.title?.toLowerCase() === wanted.toLowerCase());
  if (!vault) throw new Error('intake vault not found for this service account');
  cached = { client, vaultId: vault.id };
  return cached;
}

/** Save a validated drop into the intake vault. Returns the new item's ID (never the secret). */
export async function saveToVault(drop, deps = null) {
  const { client, vaultId } = deps || await vaultClient();
  const item = await client.items.create(vaultItem(drop, vaultId));
  return item?.id || null;
}

/** For the setup check: can the service account see the intake vault? Never returns the token. */
export async function vaultStatus() {
  if (!dropEnabled()) return { enabled: false, reason: 'OP_SERVICE_ACCOUNT_TOKEN and OP_INTAKE_VAULT are not both set' };
  try { await vaultClient(); return { enabled: true, working: true }; } catch (err) {
    return { enabled: true, working: false, reason: String(err?.message || 'could not reach 1Password').slice(0, 160) };
  }
}
