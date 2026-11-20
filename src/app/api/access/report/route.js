// POST /api/access/report  (application/json)
// The access page calls this each time a client finishes, skips or asks for help on an account.
// Body: { client, company?, account, status, option?, detail?, note? }
//    or { client, company?, finish: true, items: [same shape, without client] } when they reach the end.
//
// Where a report goes:
//   1. Surge HQ, when HQ_SUPABASE_URL, HQ_SUPABASE_ANON_KEY and HQ_INTAKE_SECRET are set:
//      hq.intake_access(secret, payload). HQ notes the client's "Account access granted" card
//      and posts in their Slack channel.
//   2. Email to the team, for anything a person has to act on (help, a request to send) and for
//      the final summary. This is the only route until HQ is connected.
// Nothing here ever carries a password. The page has no password field.

import { Resend } from 'resend';
import { INVITE_EMAIL, reportLine, validateReport } from '@/lib/access-accounts';

export const runtime = 'nodejs';

const TEAM = (process.env.ACCESS_TEAM_EMAILS || 'sam@thesurgeagency.com,mario@thesurgeagency.com')
  .split(',').map((s) => s.trim()).filter(Boolean);
const FROM = process.env.BOOKING_FROM || 'Surge onboarding <onboarding@updates.thesurgeagency.com>';

async function toHq(payload) {
  const url = process.env.HQ_SUPABASE_URL;
  const key = process.env.HQ_SUPABASE_ANON_KEY;
  const secret = process.env.HQ_INTAKE_SECRET;
  if (!url || !key || !secret) return { sent: false, reason: 'not_connected' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/intake_access`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'hq' },
      body: JSON.stringify({ p_secret: secret, p_payload: payload }),
    });
    if (!res.ok) {
      console.error('access: HQ refused the report', res.status, (await res.text()).slice(0, 200));
      return { sent: false, reason: `hq_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('access: HQ unreachable', err?.message || err);
    return { sent: false, reason: 'hq_unreachable' };
  }
}

async function toTeam(subject, lines) {
  if (!process.env.RESEND_API_KEY || !TEAM.length) return false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: FROM, to: TEAM, subject, text: lines.join('\n') });
    if (error) console.error('access email error:', error);
    return !error;
  } catch (err) {
    console.error('access email exception:', err?.message || err);
    return false;
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  if (body.finish) {
    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
    const reports = items
      .map((i) => validateReport({ ...i, client: body.client, company: body.company }))
      .filter((v) => v.ok).map((v) => v.report);
    if (!reports.length) return Response.json({ error: 'nothing_to_report' }, { status: 400 });
    const { client, company } = reports[0];
    const hq = await toHq({ client, company, finish: true, lines: reports.map(reportLine) });
    const emailed = hq.sent ? false : await toTeam(`Access steps finished: ${company || client}`, [
      `${company || client} went through the access steps.`, '',
      ...reports.map((r) => `- ${reportLine(r)}`), '',
      `Invites go to ${INVITE_EMAIL}. Anything marked help or skipped gets handled on the onboarding call.`,
    ]);
    return Response.json({ success: hq.sent || emailed });
  }

  const v = validateReport(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  const r = v.report;

  const hq = await toHq({ ...r, line: reportLine(r) });
  // A person has to do something for these two, so they also go by email until HQ is connected.
  let emailed = false;
  if (!hq.sent && ['help', 'requested', 'shared'].includes(r.status)) {
    emailed = await toTeam(
      `${{ help: 'Needs help', requested: 'Send the request', shared: 'Login in the intake vault' }[r.status]}: ${r.company || r.client}, ${r.account_name}`,
      [reportLine(r), '', `Client: ${r.company || r.client} (${r.client})`],
    );
  }
  // The page keeps its own progress, so a report that could not be delivered never blocks the client.
  return Response.json({ success: true, delivered: hq.sent || emailed });
}
