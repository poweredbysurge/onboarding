import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, GROUPS, INVITE_EMAIL, accountsFor, reportLine, validateReport } from '../src/lib/access-accounts.js';

test('every account is complete and belongs to a group', () => {
  const keys = new Set();
  for (const a of ACCOUNTS) {
    assert.ok(!keys.has(a.key), `duplicate ${a.key}`); keys.add(a.key);
    assert.ok(GROUPS.some((g) => g.key === a.group), `${a.key} group`);
    assert.ok(a.name && a.short && a.why, `${a.key} copy`);
    if (a.kind === 'invite') assert.ok(a.role && a.steps.length >= 3, `${a.key} invite steps`);
    if (a.kind === 'request') assert.ok(a.ask?.field && a.ask.label && a.steps.length >= 3, `${a.key} request`);
    if (a.kind === 'choose') {
      assert.ok(a.question && a.options.length >= 3, `${a.key} options`);
      assert.ok(a.options.some((o) => o.help), `${a.key} needs a "not sure" option`);
      for (const o of a.options) if (!o.help) assert.ok(o.role && o.steps.length >= 2, `${a.key}/${o.key}`);
    }
  }
});

test('no step ever asks for a password, and no em dashes in client copy', () => {
  const text = JSON.stringify(ACCOUNTS);
  assert.ok(!/password|passcode|log ?in details/i.test(text));
  assert.ok(!text.includes('—'));
});

test('a link can limit which accounts show', () => {
  assert.equal(accountsFor('').length, ACCOUNTS.length);
  assert.deepEqual(accountsFor('google').map((a) => a.key), ['gbp', 'ga4', 'gsc', 'gtm']);
  assert.deepEqual(accountsFor('site,gbp').map((a) => a.key), ['gbp', 'website', 'domain']);
  assert.equal(accountsFor('nonsense').length, ACCOUNTS.length);
});

test('reports are checked before they go anywhere', () => {
  assert.equal(validateReport({ client: 'nonitos', account: 'gbp', status: 'done' }).ok, true);
  assert.equal(validateReport({ client: 'Bad Slug!', account: 'gbp', status: 'done' }).error, 'missing_client');
  assert.equal(validateReport({ client: 'nonitos', account: 'bank', status: 'done' }).error, 'unknown_account');
  assert.equal(validateReport({ client: 'nonitos', account: 'gbp', status: 'hacked' }).error, 'unknown_status');
  assert.equal(validateReport({ client: 'nonitos', account: 'google_ads', status: 'requested' }).error, 'missing_detail');
  assert.equal(validateReport({ client: 'nonitos', account: 'google_ads', status: 'requested', detail: 'abc' }).error, 'bad_detail');
  assert.equal(validateReport({ client: 'nonitos', account: 'google_ads', status: 'requested', detail: '123-456-7890' }).ok, true);
  assert.equal(validateReport({ client: 'nonitos', account: 'domain', status: 'done', option: 'nope' }).error, 'unknown_option');
  const long = validateReport({ client: 'nonitos', account: 'gbp', status: 'help', note: 'x'.repeat(900) + '\nline two' });
  assert.equal(long.report.note.length, 500);
});

test('report lines read plainly for the team', () => {
  const line = (b) => reportLine(validateReport({ client: 'nonitos', ...b }).report);
  assert.equal(line({ account: 'gbp', status: 'done' }), `Google Business Profile: client says the invite is sent. Confirm ${INVITE_EMAIL} can open it.`);
  assert.equal(line({ account: 'google_ads', status: 'requested', detail: '123-456-7890' }), 'Google Ads: client is ready for our request. Send it to: 123-456-7890.');
  assert.equal(line({ account: 'domain', status: 'help', option: 'other_domain', note: 'My nephew set it up' }), 'Your domain name (Somewhere else, or not sure): client needs help with this one. Note: My nephew set it up');
  assert.equal(line({ account: 'gtm', status: 'skipped' }), 'Google Tag Manager: skipped for now.');
});
