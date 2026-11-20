// GET  /api/access/secret           -> { enabled }   the page asks before showing the drop
// GET  /api/access/secret?check=1   -> setup check: is 1Password reachable (no secrets returned)
// POST /api/access/secret           -> saves one login into the 1Password intake vault
//   Body: { client, company?, account, option?, site?, username, password, note? }
//
// The password exists only in this request's memory. Nothing in this file logs, stores or
// forwards it anywhere except 1Password. The team is told THAT a login arrived, never what it is.

import { dropEnabled, saveToVault, validateDrop, vaultStatus } from '@/lib/access-vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request) {
  if (new URL(request.url).searchParams.get('check')) return Response.json(await vaultStatus(), { headers: noStore });
  return Response.json({ enabled: dropEnabled() }, { headers: noStore });
}

export async function POST(request) {
  if (!dropEnabled()) return Response.json({ error: 'not_enabled' }, { status: 503, headers: noStore });

  const length = Number(request.headers.get('content-length') || 0);
  if (length > 8000) return Response.json({ error: 'too_large' }, { status: 413, headers: noStore });

  const body = await request.json().catch(() => ({}));
  const v = validateDrop(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400, headers: noStore });

  try {
    await saveToVault(v.drop);
  } catch (err) {
    // Log that it failed and the kind of failure only. Never the request body.
    console.error('access drop: could not save to 1Password:', String(err?.name || 'error'));
    return Response.json({ error: 'vault_unavailable' }, { status: 503, headers: noStore });
  }
  return Response.json({ success: true }, { headers: noStore });
}
