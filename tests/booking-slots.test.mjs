import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingConfig, candidateSlots, icsFile, isFree, isOfferedSlot, openDays, partsIn, slugify, whenLabel, zonedTime } from '../src/lib/booking-slots.js';

const cfg = bookingConfig({});
// Wednesday Nov 18 2026, 10:00 Pacific (PST, UTC-8).
const now = new Date('2026-11-18T18:00:00Z');

test('defaults: both calendars, one hour, weekdays 9 to 4 Pacific', () => {
  assert.deepEqual(cfg.calendars, ['sam@thesurgeagency.com', 'mario@thesurgeagency.com']);
  assert.equal(cfg.minutes, 60);
  assert.equal(bookingConfig({ BOOKING_MINUTES: '45', BOOKING_CALENDARS: 'a@x.com' }).minutes, 45);
});

test('zonedTime handles standard and daylight time', () => {
  assert.equal(zonedTime(2026, 11, 19, 9, 0, 'America/Los_Angeles').toISOString(), '2026-11-19T17:00:00.000Z');
  assert.equal(zonedTime(2026, 7, 1, 9, 0, 'America/Los_Angeles').toISOString(), '2026-07-01T16:00:00.000Z');
});

test('slots respect notice, working hours, weekdays and the horizon', () => {
  const slots = candidateSlots(cfg, now);
  const first = slots[0];
  // 24 hours notice from Wed 10:00 means Thu 10:00 is the first start.
  assert.equal(first.start, '2026-11-19T18:00:00.000Z');
  for (const s of slots) {
    const p = partsIn(new Date(s.start), cfg.timezone);
    assert.ok(p.weekday >= 1 && p.weekday <= 5, 'weekday only');
    assert.ok(p.hour >= 9 && p.hour <= 15, `start hour ${p.hour}`);
    assert.ok(new Date(s.start) - now <= 21 * 86_400_000);
    assert.equal(new Date(s.end) - new Date(s.start), 3600_000);
  }
  assert.ok(!slots.some((s) => s.date === '2026-11-21' || s.date === '2026-11-22'), 'no weekend');
});

test('a busy block on either calendar removes the slot and its buffer', () => {
  const busy = [{ start: '2026-11-19T19:30:00Z', end: '2026-11-19T20:00:00Z' }]; // Thu 11:30 to 12:00 PT
  const thu = openDays(cfg, busy, now).find((d) => d.date === '2026-11-19');
  // 10:00 ends 11:00 (clear of 11:15), 11:00 overlaps, 12:00 is inside the 15 minute buffer, 13:00 is free.
  assert.deepEqual(thu.slots, ['2026-11-19T18:00:00.000Z', '2026-11-19T21:00:00.000Z', '2026-11-19T22:00:00.000Z', '2026-11-19T23:00:00.000Z']);
  assert.equal(isFree({ start: '2026-11-19T20:00:00Z', end: '2026-11-19T21:00:00Z' }, busy, 0), true);
  assert.equal(isFree({ start: '2026-11-19T20:00:00Z', end: '2026-11-19T21:00:00Z' }, busy, 15), false);
});

test('only times the page offered can be booked', () => {
  assert.equal(isOfferedSlot(cfg, '2026-11-19T18:00:00.000Z', now), true);
  assert.equal(isOfferedSlot(cfg, '2026-11-19T18:10:00.000Z', now), false);
  assert.equal(isOfferedSlot(cfg, '2026-11-18T23:00:00.000Z', now), false, 'inside the notice window');
  assert.equal(isOfferedSlot(cfg, '2026-11-21T18:00:00.000Z', now), false, 'Saturday');
  assert.equal(isOfferedSlot(cfg, 'not a date', now), false);
});

test('labels, slugs and the calendar file', () => {
  assert.equal(whenLabel('2026-11-19T18:00:00.000Z', 'America/Los_Angeles'), 'Thursday, November 19 at 10:00 AM PST');
  assert.equal(slugify("Nonito's Roofing"), 'nonitos-roofing');
  const ics = icsFile({ uid: 'u1', start: '2026-11-19T18:00:00.000Z', end: '2026-11-19T19:00:00.000Z', title: 'Call, with Surge', description: 'Line one\nLine two', location: '', organizer: 'sam@thesurgeagency.com' });
  assert.match(ics, /DTSTART:20261119T180000Z/);
  assert.match(ics, /SUMMARY:Call\\, with Surge/);
  assert.match(ics, /DESCRIPTION:Line one\\nLine two/);
  assert.ok(!ics.includes('LOCATION'));
});
