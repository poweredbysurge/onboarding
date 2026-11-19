import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDescription } from '../src/lib/booking-slots.js';
import { meetCode, meetConference, writeEvents } from '../src/lib/booking-google.js';

const LINK = 'https://meet.google.com/abc-defg-hij';
const describe = (link) => eventDescription({ name: 'Noel', email: 'noel@example.com', company: 'ZZ Test', client: 'zz-test', notes: '', meetLink: link });
const event = { title: 'Surge onboarding call: ZZ Test', describe, start: '2026-11-23T17:00:00.000Z', end: '2026-11-23T18:00:00.000Z', timezone: 'America/Los_Angeles' };

function fakeApi({ refuseConference = false, refuse = [] } = {}) {
  const calls = [];
  return {
    calls,
    events: {
      insert: async (req) => {
        calls.push(req);
        if (refuse.includes(req.calendarId)) throw new Error('forbidden');
        if (refuseConference && req.requestBody.conferenceData) throw new Error('Invalid conference type value.');
        return { data: {} };
      },
    },
  };
}

test('Meet link parsing', () => {
  assert.equal(meetCode(LINK), 'abc-defg-hij');
  assert.equal(meetCode('https://meet.google.com/abc-defg-hij?authuser=0'), 'abc-defg-hij');
  assert.equal(meetCode('https://zoom.us/j/123'), null);
  assert.equal(meetConference('nope'), null);
  assert.equal(meetConference(LINK).entryPoints[0].uri, LINK);
});

test('description is tidy HTML and escapes what the client typed', () => {
  const d = eventDescription({ name: 'A <b>B</b>', email: 'a@b.co', company: 'Tom & Sons', client: 'tom-sons', notes: '<script>x</script>', meetLink: LINK });
  assert.ok(d.includes('A &lt;b&gt;B&lt;/b&gt;, Tom &amp; Sons'));
  assert.ok(d.includes('&lt;script&gt;'));
  assert.ok(!d.includes('<script>'));
  assert.ok(d.includes(`<a href="${LINK}">`));
  assert.ok(d.includes('HQ client: tom-sons'));
  assert.ok(!eventDescription({ name: 'A', email: 'a@b.co', company: 'C', client: '', notes: '', meetLink: null }).includes('Video call'));
});

test('every event is a video call when the standing room is set', async () => {
  process.env.BOOKING_MEET_LINK = LINK;
  const api = fakeApi();
  const out = await writeEvents(['sam@x.com', 'mario@x.com'], event, api);
  assert.deepEqual(out.written, ['sam@x.com', 'mario@x.com']);
  assert.equal(out.meetLink, LINK);
  assert.equal(out.meetAttached, true);
  assert.equal(api.calls.length, 2);
  for (const c of api.calls) {
    assert.equal(c.conferenceDataVersion, 1);
    assert.equal(c.requestBody.conferenceData.conferenceId, 'abc-defg-hij');
    assert.equal(c.requestBody.location, LINK);
    assert.ok(c.requestBody.description.includes(LINK));
  }
});

test('if Google refuses the Meet button the link still lands on the event', async () => {
  process.env.BOOKING_MEET_LINK = LINK;
  const api = fakeApi({ refuseConference: true });
  const out = await writeEvents(['sam@x.com'], event, api);
  assert.deepEqual(out.written, ['sam@x.com']);
  assert.equal(out.meetAttached, false);
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[1].requestBody.conferenceData, undefined);
  assert.equal(api.calls[1].requestBody.location, LINK);
});

test('a calendar that refuses the event is reported, the other still gets it', async () => {
  process.env.BOOKING_MEET_LINK = LINK;
  const out = await writeEvents(['sam@x.com', 'mario@x.com'], event, fakeApi({ refuse: ['mario@x.com'] }));
  assert.deepEqual(out.written, ['sam@x.com']);
  assert.equal(out.failed[0].calendar, 'mario@x.com');
});

test('no standing room set: books without a link', async () => {
  delete process.env.BOOKING_MEET_LINK;
  const api = fakeApi();
  const out = await writeEvents(['sam@x.com'], event, api);
  assert.equal(out.meetLink, null);
  assert.equal(api.calls[0].requestBody.location, undefined);
});
