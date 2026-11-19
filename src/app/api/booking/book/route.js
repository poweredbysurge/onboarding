// POST /api/booking/book  (application/json)
// Body: { name, email, company, start, client?, notes?, website? }
// Books the onboarding call: checks the time is still open on every team calendar, writes the
// event onto each one, and emails the client a confirmation with a calendar file (team on cc).

import { Resend } from 'resend';
import { bookingConfig, icsFile, isFree, isOfferedSlot, slugify, whenLabel } from '@/lib/booking-slots';
import { busyBlocks, writeEvents } from '@/lib/booking-google';

export const runtime = 'nodejs';

const FROM = process.env.BOOKING_FROM || 'Sam and Mario at Surge <onboarding@updates.thesurgeagency.com>';
const REPLY_TO = process.env.BOOKING_REPLY_TO || 'sam@thesurgeagency.com';
const ASSET_BASE = process.env.BOOKING_ASSET_BASE || 'https://hq.thesurgeagency.com/email/welcome';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function confirmationHtml({ firstName, when, minutes, meetLink }) {
  const video = meetLink
    ? `<a href="${esc(meetLink)}" style="display:inline-block;background:#dee535;color:#09090b;font-weight:800;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:999px;">Join the video call</a>`
    : `<div style="font-size:15px;color:#a1a1aa;line-height:1.6;">We will send the video link before the call.</div>`;
  return `<!doctype html><html><body style="margin:0;background:#09090b;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td style="padding:0 4px 28px;"><img src="${ASSET_BASE}/img-02.png" alt="Surge" width="195" height="32" style="display:block;border:0;"></td></tr>
  <tr><td style="background:#111113;border:1px solid rgba(255,255,255,0.09);border-radius:20px;padding:36px 32px;">
    <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#dee535;font-weight:700;margin-bottom:12px;">Onboarding call booked</div>
    <div style="font-size:30px;line-height:1.15;font-weight:900;color:#ffffff;margin-bottom:18px;">You're on the calendar${firstName ? `, ${esc(firstName)}` : ''}.</div>
    <div style="font-size:19px;line-height:1.5;color:#ffffff;font-weight:700;margin-bottom:6px;">${esc(when)}</div>
    <div style="font-size:15px;color:#a1a1aa;margin-bottom:26px;">${minutes} minutes with Sam and Mario</div>
    ${video}
    <div style="border-top:1px solid rgba(255,255,255,0.09);margin:30px 0 22px;"></div>
    <div style="font-size:15px;line-height:1.7;color:#e4e4e7;">We will go over your goals, who your best customers are, and confirm we have the access and photos we need. The calendar file attached to this email adds the call to your calendar.</div>
    <div style="font-size:15px;line-height:1.7;color:#a1a1aa;margin-top:16px;">Need a different time? Reply to this email and we will sort it out.</div>
  </td></tr>
  <tr><td style="padding:22px 4px 0;font-size:13px;color:#71717a;line-height:1.6;">The Surge Agency. Reply to this email to reach Sam and Mario directly.</td></tr>
</table></td></tr></table></body></html>`;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  // Hidden field real people never fill in. Pretend it worked so bots move on.
  if (body.website) return Response.json({ success: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const company = clean(body.company, 160);
  const notes = clean(body.notes, 1000);
  const client = slugify(body.client) || slugify(company);
  const start = body.start;

  if (!name || !email || !company || !start) return Response.json({ error: 'missing_fields' }, { status: 400 });
  if (!validEmail(email)) return Response.json({ error: 'invalid_email' }, { status: 400 });

  const cfg = bookingConfig();
  const now = new Date();
  if (!isOfferedSlot(cfg, start, now)) return Response.json({ error: 'slot_not_offered' }, { status: 400 });

  const startIso = new Date(start).toISOString();
  const endIso = new Date(new Date(start).getTime() + cfg.minutes * 60_000).toISOString();
  const slot = { start: startIso, end: endIso };

  // Check again right before writing: someone else may have taken it since the page loaded.
  try {
    const pad = cfg.bufferMinutes * 60_000;
    const { busy, unreadable } = await busyBlocks(
      cfg.calendars,
      new Date(new Date(startIso).getTime() - pad).toISOString(),
      new Date(new Date(endIso).getTime() + pad).toISOString(),
    );
    if (unreadable.length) return Response.json({ error: 'calendar_unavailable' }, { status: 503 });
    if (!isFree(slot, busy, cfg.bufferMinutes)) return Response.json({ error: 'slot_taken' }, { status: 409 });
  } catch (err) {
    console.error('booking recheck error:', err?.message || err);
    return Response.json({ error: 'calendar_unavailable' }, { status: 503 });
  }

  const title = `Onboarding call: ${company}`;
  const description = [
    `Surge onboarding call with ${name} (${email}) from ${company}.`,
    client ? `Client: ${client}` : '',
    notes ? `Notes from the client: ${notes}` : '',
    'Booked on onboarding.thesurgeagency.com/book. Recorded call: no passwords or card numbers said out loud.',
  ].filter(Boolean).join('\n');

  const { written, failed, meetLink } = await writeEvents(cfg.calendars, { title, description, start: startIso, end: endIso, timezone: cfg.timezone });
  if (failed.length) console.error('booking: calendar write failed', failed);
  if (!written.length) {
    // Nothing landed on a calendar, so the time would still look open. Do not confirm it.
    return Response.json({ error: 'calendar_unavailable' }, { status: 503 });
  }

  const when = whenLabel(startIso, cfg.timezone);
  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const ics = icsFile({
        uid: `onboarding-${client || 'client'}-${new Date(startIso).getTime()}@thesurgeagency.com`,
        start: startIso, end: endIso,
        title: 'Onboarding call with The Surge Agency',
        description: meetLink ? `Your onboarding call with Sam and Mario.\nVideo call: ${meetLink}` : 'Your onboarding call with Sam and Mario.',
        location: meetLink || '',
        organizer: REPLY_TO,
      });
      const missed = cfg.calendars.filter((c) => !written.includes(c));
      const { error } = await resend.emails.send({
        from: FROM,
        to: [email],
        cc: cfg.calendars,
        reply_to: REPLY_TO,
        subject: `Onboarding call booked: ${when}`,
        html: confirmationHtml({ firstName: name.split(/\s+/)[0], when, minutes: cfg.minutes, meetLink }),
        text: [
          `You're on the calendar, ${name.split(/\s+/)[0]}.`,
          `${when} (${cfg.minutes} minutes with Sam and Mario).`,
          meetLink ? `Video call: ${meetLink}` : 'We will send the video link before the call.',
          'Need a different time? Reply to this email.',
        ].filter(Boolean).join('\n'),
        attachments: [{ filename: 'surge-onboarding-call.ics', content: Buffer.from(ics).toString('base64') }],
      });
      emailed = !error;
      if (missed.length) {
        // Team only: a calendar we could not write to still needs the event.
        await resend.emails.send({
          from: FROM, to: cfg.calendars, subject: `Add by hand: ${title}`,
          text: `${company} booked their onboarding call for ${when}, but it could not be written onto ${missed.join(', ')}. Add it by hand. Share that calendar with the booking account ("Make changes to events") to fix this for good.`,
        }).catch(() => {});
      }
      if (error) console.error('booking email error:', error);
    } catch (err) {
      console.error('booking email exception:', err?.message || err);
    }
  }

  return Response.json({ success: true, start: startIso, end: endIso, meetLink, emailed, timezone: cfg.timezone });
}
