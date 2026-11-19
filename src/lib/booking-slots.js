// Pure slot maths for the onboarding call booking page (fulfillment ONB-09).
// No network and no Google here, so it can be tested with `node --test`.
//
// A slot is offered only when every team calendar is free for the whole call plus a buffer
// on each side. Working hours are in the team's time zone; the page shows them in the
// visitor's own.

export const DEFAULTS = {
  timezone: 'America/Los_Angeles',
  minutes: 60,        // length of the onboarding call
  startHour: 9,       // first call can start at 9:00
  endHour: 16,        // last call must end by 16:00
  stepMinutes: 60,    // a new start every hour
  bufferMinutes: 15,  // gap kept clear before and after a busy block
  noticeHours: 24,    // earliest bookable time from now
  horizonDays: 21,    // how far ahead the page shows
  weekdays: [1, 2, 3, 4, 5],
};

const num = (v, fallback) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

/** Settings from the environment, falling back to DEFAULTS. */
export function bookingConfig(env = process.env) {
  const calendars = (env.BOOKING_CALENDARS || 'sam@thesurgeagency.com,mario@thesurgeagency.com')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return {
    calendars,
    timezone: env.BOOKING_TIMEZONE || DEFAULTS.timezone,
    minutes: num(env.BOOKING_MINUTES, DEFAULTS.minutes),
    startHour: num(env.BOOKING_START_HOUR, DEFAULTS.startHour),
    endHour: num(env.BOOKING_END_HOUR, DEFAULTS.endHour),
    stepMinutes: num(env.BOOKING_STEP_MINUTES, DEFAULTS.stepMinutes),
    bufferMinutes: num(env.BOOKING_BUFFER_MINUTES, DEFAULTS.bufferMinutes),
    noticeHours: num(env.BOOKING_NOTICE_HOURS, DEFAULTS.noticeHours),
    horizonDays: num(env.BOOKING_HORIZON_DAYS, DEFAULTS.horizonDays),
    weekdays: DEFAULTS.weekdays,
  };
}

/** Calendar parts of an instant, as seen in a time zone. */
export function partsIn(date, timezone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}

/** The instant when a wall clock in `timezone` reads y-m-d h:min. Handles daylight saving. */
export function zonedTime(year, month, day, hour, minute, timezone) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(guess), timezone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (shown === wanted) break;
    guess += wanted - shown;
  }
  return new Date(guess);
}

const pad = (n) => String(n).padStart(2, '0');

/** Every possible start in the window, before calendars are checked. */
export function candidateSlots(cfg, now = new Date()) {
  const earliest = now.getTime() + cfg.noticeHours * 3600_000;
  const latest = now.getTime() + cfg.horizonDays * 86_400_000;
  const today = partsIn(now, cfg.timezone);
  const out = [];
  for (let d = 0; d <= cfg.horizonDays + 1; d++) {
    // Noon UTC of the rolled date keeps us on the right calendar day in any zone.
    const roll = new Date(Date.UTC(today.year, today.month - 1, today.day + d, 12));
    const y = roll.getUTCFullYear(), m = roll.getUTCMonth() + 1, day = roll.getUTCDate();
    if (!cfg.weekdays.includes(roll.getUTCDay())) continue;
    for (let mins = cfg.startHour * 60; mins + cfg.minutes <= cfg.endHour * 60; mins += cfg.stepMinutes) {
      const start = zonedTime(y, m, day, Math.floor(mins / 60), mins % 60, cfg.timezone);
      if (start.getTime() < earliest || start.getTime() > latest) continue;
      out.push({ date: `${y}-${pad(m)}-${pad(day)}`, start: start.toISOString(), end: new Date(start.getTime() + cfg.minutes * 60_000).toISOString() });
    }
  }
  return out;
}

/** True when the slot (plus buffer) touches none of the busy blocks. */
export function isFree(slot, busy, bufferMinutes = 0) {
  const s = new Date(slot.start).getTime() - bufferMinutes * 60_000;
  const e = new Date(slot.end).getTime() + bufferMinutes * 60_000;
  return !busy.some((b) => new Date(b.start).getTime() < e && new Date(b.end).getTime() > s);
}

/** Open slots grouped by day: [{ date: "2026-11-23", slots: [iso, ...] }]. */
export function openDays(cfg, busy, now = new Date()) {
  const days = new Map();
  for (const slot of candidateSlots(cfg, now)) {
    if (!isFree(slot, busy, cfg.bufferMinutes)) continue;
    if (!days.has(slot.date)) days.set(slot.date, []);
    days.get(slot.date).push(slot.start);
  }
  return [...days.entries()].map(([date, slots]) => ({ date, slots }));
}

/** Is this exact start one the page could have offered? Stops made-up times being booked. */
export function isOfferedSlot(cfg, startIso, now = new Date()) {
  const t = new Date(startIso).getTime();
  return Number.isFinite(t) && candidateSlots(cfg, now).some((s) => new Date(s.start).getTime() === t);
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** A calendar file the client can open in any calendar app. */
export function icsFile({ uid, start, end, title, description, location, organizer }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Surge Agency//Onboarding//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(description)}`,
    location ? `LOCATION:${icsText(location)}` : '',
    organizer ? `ORGANIZER;CN=The Surge Agency:mailto:${organizer}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/** "Monday, November 23 at 10:00 AM PST" in the given zone. */
export function whenLabel(iso, timezone) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return `${day} at ${time}`;
}
