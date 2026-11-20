import test from 'node:test';
import assert from 'node:assert/strict';
import { dropEnabled, saveToVault, validateDrop, vaultItem } from '../src/lib/access-vault.js';
import { reportLine, validateReport } from '../src/lib/access-accounts.js';

const good = { client: 'nonitos', company: "Nonito's Roofing", account: 'domain', option: 'other_domain', site: 'networksolutions.com', username: 'noel@example.com', password: '  pa ss\tword  ', note: 'Texts a code' };

test('the drop is off unless both 1Password settings exist', () => {
  assert.equal(dropEnabled({}), false);
  assert.equal(dropEnabled({ OP_SERVICE_ACCOUNT_TOKEN: 'x' }), false);
  assert.equal(dropEnabled({ OP_SERVICE_ACCOUNT_TOKEN: 'x', OP_INTAKE_VAULT: 'Client Intake' }), true);
});

test('a drop is checked, and the password is passed through exactly as typed', () => {
  const v = validateDrop(good);
  assert.equal(v.ok, true);
  assert.equal(v.drop.password, '  pa ss\tword  ');
  assert.equal(v.drop.account_name, 'Your domain name (Somewhere else, or not sure)');
  assert.equal(validateDrop({ ...good, client: 'Bad Slug' }).error, 'missing_client');
  assert.equal(validateDrop({ ...good, account: 'bank' }).error, 'unknown_account');
  assert.equal(validateDrop({ ...good, username: ' ' }).error, 'missing_username');
  assert.equal(validateDrop({ ...good, password: '' }).error, 'missing_password');
  assert.equal(validateDrop({ ...good, password: 'x'.repeat(201) }).error, 'password_too_long');
  assert.equal(validateDrop({ ...good, password: 12345 }).error, 'missing_password');
});

test('errors never contain the password', () => {
  for (const bad of [{ ...good, client: '' }, { ...good, account: 'x' }, { ...good, username: '' }, { ...good, password: 'S3cret!'.repeat(40) }]) {
    assert.ok(!JSON.stringify(validateDrop({ ...bad, password: bad.password || 'S3cret!' })).includes('S3cret!'));
  }
});

test('the 1Password item is a Login in the intake vault with the secret only in the concealed field', () => {
  const item = vaultItem(validateDrop(good).drop, 'vault123', new Date('2026-11-19T20:00:00Z'));
  assert.equal(item.category, 'Login');
  assert.equal(item.vaultId, 'vault123');
  assert.equal(item.title, "Nonito's Roofing: Your domain name (Somewhere else, or not sure)");
  assert.deepEqual(item.tags, ['surge-intake', 'nonitos']);
  assert.deepEqual(item.fields.map((f) => [f.id, f.fieldType]), [['username', 'Text'], ['password', 'Concealed']]);
  assert.equal(item.websites[0].url, 'https://networksolutions.com/');
  assert.ok(item.notes.includes('2026-11-19') && item.notes.includes('Texts a code'));
  const { fields, ...rest } = item;
  assert.ok(!JSON.stringify(rest).includes('pa ss'), 'password must not leak into title, notes or tags');
  assert.ok(!JSON.stringify(fields[0]).includes('pa ss'));
});

test('a site that is not a web address goes in the notes, not the websites list', () => {
  const item = vaultItem(validateDrop({ ...good, site: 'the phone company portal' }).drop, 'v');
  assert.deepEqual(item.websites, []);
  assert.ok(item.notes.includes('Where it is used: the phone company portal'));
});

test('saving calls 1Password once and returns only the item id', async () => {
  const calls = [];
  const client = { items: { create: async (p) => { calls.push(p); return { id: 'item1', fields: p.fields }; } } };
  const out = await saveToVault(validateDrop(good).drop, { client, vaultId: 'vault123' });
  assert.equal(out, 'item1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].vaultId, 'vault123');
});

test('the team is told a login arrived, never what it is', () => {
  const r = validateReport({ client: 'nonitos', account: 'domain', option: 'other_domain', status: 'shared', note: 'Texts a code', password: 'S3cret!', username: 'noel@example.com' });
  assert.equal(r.ok, true);
  const line = reportLine(r.report);
  assert.ok(line.includes('1Password intake vault'));
  assert.ok(!JSON.stringify(r.report).includes('S3cret!') && !JSON.stringify(r.report).includes('noel@example.com'));
});

test('a login is only accepted for accounts marked for it (never Google or Meta)', () => {
  for (const account of ['gbp', 'ga4', 'gsc', 'gtm', 'google_ads', 'meta', 'facebook_page']) {
    assert.equal(validateDrop({ ...good, account, option: '' }).error, 'login_not_accepted', account);
  }
  assert.equal(validateDrop({ ...good, account: 'website', option: 'wordpress' }).ok, true);
});
