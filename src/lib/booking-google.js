// Google Calendar calls for the booking page. Uses the service account this site already has
// (GOOGLE_SERVICE_ACCOUNT_JSON). Each team calendar must be shared with that account:
// "See all event details" is enough to show open times, "Make changes to events" lets a booking
// land on the calendar. A service account cannot send Google invitations to guests, so the
// event is written straight onto each team calendar and the client gets our own email.

import { google } from 'googleapis';

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  return JSON.parse(raw);
}

export function serviceAccountEmail() {
  try { return credentials().client_email || null; } catch { return null; }
}

function calendarApi() {
  const auth = new google.auth.GoogleAuth({
    credentials: credentials(),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

/**
 * Busy blocks across every calendar between two instants.
 * Returns { busy: [{start, end}], unreadable: [calendarId] }. A calendar we cannot read is
 * reported, never treated as free.
 */
export async function busyBlocks(calendars, timeMin, timeMax) {
  const res = await calendarApi().freebusy.query({
    requestBody: { timeMin, timeMax, items: calendars.map((id) => ({ id })) },
  });
  const busy = [];
  const unreadable = [];
  for (const id of calendars) {
    const cal = res.data.calendars?.[id];
    if (!cal || cal.errors?.length) { unreadable.push(id); continue; }
    busy.push(...(cal.busy || []));
  }
  return { busy, unreadable };
}

/** "https://meet.google.com/abc-defg-hij" -> "abc-defg-hij" (null when it is not a Meet link). */
export function meetCode(link) {
  const m = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i.exec(String(link || ''));
  return m ? m[1].toLowerCase() : null;
}

/** The Google Calendar block that makes an event a video call with a "Join with Google Meet" button. */
export function meetConference(link) {
  const code = meetCode(link);
  if (!code) return null;
  return {
    conferenceId: code,
    conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
    entryPoints: [{ entryPointType: 'video', uri: `https://meet.google.com/${code}`, label: `meet.google.com/${code}` }],
  };
}

/**
 * Write the call onto each team calendar as a video call.
 *
 * A service account cannot create a new Meet room (Google refuses it), so the video link is
 * Surge's standing onboarding room, BOOKING_MEET_LINK. We first try to attach it as a real Meet
 * conference so the event shows the "Join with Google Meet" button; if Google refuses that too,
 * the link still goes in the event's location and description.
 *
 * `describe(link)` returns the event description (HTML) for a given video link.
 * Returns { written: [calendarId], failed: [{calendar, error}], meetLink, meetAttached }.
 */
export async function writeEvents(calendars, { title, describe, start, end, timezone }, api = calendarApi()) {
  const written = [];
  const failed = [];
  const meetLink = process.env.BOOKING_MEET_LINK || null;
  const conference = meetConference(meetLink);
  let meetAttached = false;

  const body = (withConference) => ({
    summary: title,
    description: describe(meetLink),
    location: meetLink || undefined,
    start: { dateTime: start, timeZone: timezone },
    end: { dateTime: end, timeZone: timezone },
    ...(withConference ? { conferenceData: conference } : {}),
  });

  for (const calendarId of calendars) {
    try {
      let done = false;
      if (conference) {
        try {
          await api.events.insert({ calendarId, conferenceDataVersion: 1, requestBody: body(true) });
          done = true;
          meetAttached = true;
        } catch (err) {
          console.error('booking: could not attach Meet to the event, using a plain link', err?.errors?.[0]?.reason || err?.message);
        }
      }
      if (!done) await api.events.insert({ calendarId, requestBody: body(false) });
      written.push(calendarId);
    } catch (err) {
      failed.push({ calendar: calendarId, error: err?.errors?.[0]?.reason || err?.message || 'unknown' });
    }
  }
  return { written, failed, meetLink, meetAttached };
}

/** For the setup check: can we read each calendar, and can we write to it? */
export async function calendarAccess(calendars) {
  const api = calendarApi();
  const now = new Date();
  const { unreadable } = await busyBlocks(calendars, now.toISOString(), new Date(now.getTime() + 86_400_000).toISOString());
  const out = [];
  for (const id of calendars) {
    let write = false;
    try {
      const role = (await api.calendarList.get({ calendarId: id })).data.accessRole;
      write = role === 'writer' || role === 'owner';
    } catch {
      // Not on the service account's list: try adding it, which works once the calendar is shared.
      try {
        const role = (await api.calendarList.insert({ requestBody: { id } })).data.accessRole;
        write = role === 'writer' || role === 'owner';
      } catch { write = false; }
    }
    out.push({ calendar: id, read: !unreadable.includes(id), write });
  }
  return out;
}
