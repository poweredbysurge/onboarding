// POST /api/submit-icp
// The ICP form's answers go to Surge HQ, which saves them as a Google Doc in the client's
// Documents folder, ticks their "ICP form filled in" card and posts in their Slack channel
// (surge-hq: public.hq_intake_icp, orchestrator/src/icp-submissions.ts). Fulfillment ONB-07.
//
// This route used to create a Drive folder at the top of the shared drive and an Asana project.
// It does neither now: HQ owns the client's folders, and Asana is retired.
//
// If HQ cannot take it (not connected, or a client HQ does not know yet), the answers are emailed
// to the team so nothing a client typed is lost. If neither works, the client sees a retry.

import { Resend } from 'resend';
import { icpPayload } from '@/lib/icp-doc';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TEAM = (process.env.ACCESS_TEAM_EMAILS || 'sam@thesurgeagency.com,mario@thesurgeagency.com')
  .split(',').map((s) => s.trim()).filter(Boolean);
const FROM = process.env.BOOKING_FROM || 'Surge onboarding <onboarding@updates.thesurgeagency.com>';

async function toHq(payload) {
  const url = process.env.HQ_SUPABASE_URL;
  const key = process.env.HQ_SUPABASE_ANON_KEY;
  const secret = process.env.HQ_INTAKE_SECRET;
  if (!url || !key || !secret) return { sent: false, reason: 'HQ is not connected' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/hq_intake_icp`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_secret: secret, p_payload: payload }),
    });
    if (res.ok) return { sent: true };
    const text = (await res.text()).slice(0, 200);
    console.error('icp: HQ refused the form', res.status, text);
    return { sent: false, reason: /unknown client/.test(text) ? 'HQ does not know this client yet' : `HQ answered ${res.status}` };
  } catch (err) {
    console.error('icp: HQ unreachable', err?.message || err);
    return { sent: false, reason: 'HQ could not be reached' };
  }
}

async function toTeam(payload, reason) {
  if (!process.env.RESEND_API_KEY || !TEAM.length) return false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: TEAM,
      ...(payload.contact_email ? { reply_to: payload.contact_email } : {}),
      subject: `ICP form: ${payload.company} (save this one by hand)`,
      text: [
        `${payload.company} submitted the ICP form. It was not saved to their Documents folder: ${reason}.`,
        `Save the answers below into Clients / ${payload.company} / Documents, and tick their "ICP form filled in" card.`,
        `Client slug the form used: ${payload.client}`,
        '', '----', '',
        payload.body,
      ].join('\n'),
    });
    if (error) console.error('icp email error:', error);
    return !error;
  } catch (err) {
    console.error('icp email exception:', err?.message || err);
    return false;
  }
}

export async function POST(request) {
  const data = await request.json().catch(() => ({}));
  const built = icpPayload(data);
  if (!built.ok) return Response.json({ ok: false, error: built.error }, { status: 400 });

  const hq = await toHq(built.payload);
  if (hq.sent) return Response.json({ ok: true });

  const emailed = await toTeam(built.payload, hq.reason);
  if (emailed) return Response.json({ ok: true, errors: ['hq'] });

  // Neither path took it. Say so, so the form keeps the client's draft and offers a retry.
  return Response.json({ ok: false, error: 'not_saved' }, { status: 502 });
}
