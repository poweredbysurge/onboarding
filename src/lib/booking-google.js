// Google Calendar calls for the booking page. Uses the service account this site already has
// (GOOGLE_SERVICE_ACCOUNT_JSON). Each team calendar must be shared with that account:
// "See all event details" is enough to show open times, "Make changes to events" lets a booking
// land on the calendar. A service account cannot send Google invitations to guests, so the
// event is written straight onto each team calendar and the client gets our own email.

import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';

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

/**
 * Write the call onto each team calendar. The first calendar that accepts it is asked for a
 * Google Meet link; the rest get the same link in their copy.
 * Returns { written: [calendarId], failed: [{calendar, error}], meetLink }.
 */
export async function writeEvents(calendars, { title, description, start, end, timezone }) {
  const api = calendarApi();
  const written = [];
  const failed = [];
  let meetLink = process.env.BOOKING_MEET_LINK || null;

  for (const calendarId of calendars) {
    const body = (link, withMeet) => ({
      summary: title,
      description: link ? `${description}\n\nVideo call: ${link}` : description,
      location: link || undefined,
      start: { dateTime: start, timeZone: timezone },
      end: { dateTime: end, timeZone: timezone },
      ...(withMeet ? { conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
    });
    try {
      let event;
      if (!meetLink) {
        try {
          event = (await api.events.insert({ calendarId, conferenceDataVersion: 1, requestBody: body(null, true) })).data;
          meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || null;
        } catch {
          event = undefined; // a Meet link is a nice to have; fall through and book without one
        }
      }
      if (!event) event = (await api.events.insert({ calendarId, requestBody: body(meetLink, false) })).data;
      written.push(calendarId);
    } catch (err) {
      failed.push({ calendar: calendarId, error: err?.errors?.[0]?.reason || err?.message || 'unknown' });
    }
  }
  return { written, failed, meetLink };
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
