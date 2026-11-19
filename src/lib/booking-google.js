// Google Calendar calls for the booking page. Uses the service account this site already has
// (GOOGLE_SERVICE_ACCOUNT_JSON). Two ways of working:
//
// 1. Host mode (BOOKING_HOST is set, for example sam@thesurgeagency.com). The service account
//    acts as that person through Google Workspace domain-wide delegation, limited to calendar
//    events and free/busy. The call is one real Google event on the host's calendar: its own
//    Google Meet room, the other team members and the client as guests, Google sends the invite.
//    Because the host creates the meeting, Meet note taking behaves like any meeting they set up.
// 2. Shared-calendar mode (no BOOKING_HOST, or host mode failed). Each team calendar is shared
//    with the service account and the event is written onto each one, with no guests. Video is
//    the standing room in BOOKING_MEET_LINK.

import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';

// Exactly the scopes entered in the Workspace admin console for domain-wide delegation.
export const HOST_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  return JSON.parse(raw);
}

export function serviceAccountEmail() {
  try { return credentials().client_email || null; } catch { return null; }
}

/** The numeric ID the Workspace admin console asks for. Not a secret. */
export function serviceAccountClientId() {
  try { return credentials().client_id || null; } catch { return null; }
}

export function hostEmail() {
  return (process.env.BOOKING_HOST || '').trim().toLowerCase() || null;
}

function calendarApi() {
  const auth = new google.auth.GoogleAuth({
    credentials: credentials(),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

/** Calendar client acting as the host. */
function hostApi(host = hostEmail()) {
  const c = credentials();
  const auth = new google.auth.JWT({ email: c.client_email, key: c.private_key, scopes: HOST_SCOPES, subject: host });
  return google.calendar({ version: 'v3', auth });
}

const readApi = () => (hostEmail() ? hostApi() : calendarApi());

/**
 * Busy blocks across every calendar between two instants.
 * Returns { busy: [{start, end}], unreadable: [calendarId] }. A calendar we cannot read is
 * reported, never treated as free.
 */
export async function busyBlocks(calendars, timeMin, timeMax, api = readApi()) {
  const res = await api.freebusy.query({
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
 * Host mode: one real Google event on the host's calendar with its own Meet room and guests.
 * Returns { meetLink, eventId }. Throws if Google refuses, so the caller can fall back.
 */
export async function writeHostEvent(guests, { title, describe, start, end, timezone }, api = hostApi()) {
  const res = await api.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: title,
      description: describe(null),
      start: { dateTime: start, timeZone: timezone },
      end: { dateTime: end, timeZone: timezone },
      attendees: guests.map((g) => ({ email: g.email, displayName: g.name || undefined })),
      guestsCanModify: false,
      guestsCanInviteOthers: true,
      conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    },
  });
  const ev = res.data || {};
  const meetLink = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || null;
  return { meetLink, eventId: ev.id || null };
}

/**
 * Book the call. Tries host mode first when BOOKING_HOST is set, then shared-calendar mode.
 * Returns { written, failed, meetLink, invited } where `invited` means Google sent the client
 * a real calendar invitation.
 */
export async function bookCall(calendars, event, client, apis = {}) {
  const host = hostEmail();
  if (host) {
    try {
      const guests = [
        ...calendars.filter((c) => c.toLowerCase() !== host).map((email) => ({ email })),
        { email: client.email, name: client.name },
      ];
      const { meetLink } = await writeHostEvent(guests, event, apis.host || hostApi());
      return { written: calendars, failed: [], meetLink, invited: true };
    } catch (err) {
      console.error('booking: host mode failed, falling back to shared calendars:', err?.errors?.[0]?.reason || err?.message);
    }
  }
  const out = await writeEvents(calendars, event, apis.shared || calendarApi());
  return { ...out, invited: false };
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

/** For the setup check: what can this site read and write right now? */
export async function calendarAccess(calendars) {
  const now = new Date();
  const range = [now.toISOString(), new Date(now.getTime() + 86_400_000).toISOString()];
  const host = hostEmail();

  if (host) {
    try {
      const api = hostApi();
      const { unreadable } = await busyBlocks(calendars, ...range, api);
      let write = false;
      try { await api.events.list({ calendarId: 'primary', maxResults: 1, timeMin: range[0] }); write = true; } catch { write = false; }
      return {
        mode: `acting as ${host}`,
        working: write && !unreadable.length,
        calendars: calendars.map((id) => ({ calendar: id, read: !unreadable.includes(id) })),
        can_create_events: write,
      };
    } catch (err) {
      return { mode: `acting as ${host}`, working: false, error: err?.response?.data?.error_description || err?.message || 'unknown' };
    }
  }

  const api = calendarApi();
  const { unreadable } = await busyBlocks(calendars, ...range, api);
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
  return { mode: 'shared calendars', working: out.every((c) => c.read && c.write), calendars: out };
}
