import test from 'node:test';
import assert from 'node:assert/strict';
import { icpMarkdown, icpPayload, slugify } from '../src/lib/icp-doc.js';

const data = {
  companyName: "Nonito's Roofing", yourName: 'Noel Hernandez', yourEmail: 'noel@example.com',
  companyWebsite: 'nonitosroofing.net', industry: 'Roofing', markets: 'Hagerstown, MD',
  biggestChallenges: 'Leads are slow.\nNo follow up.', researchChannels: ['google', 'referrals'],
};
const day = new Date('2026-11-23T20:00:00Z');

test('the document is tidy markdown with every section and no em dashes', () => {
  const md = icpMarkdown(data, day);
  assert.ok(md.startsWith("# ICP questionnaire: Nonito's Roofing\n\nSubmitted November 23, 2026 by Noel Hernandez (noel@example.com)."));
  for (const h of ['## 1. Your company', '## 2. Ideal client', '## 3. Goals and pain points', '## 4. Buying journey', '## 5. Best clients', '## 6. Communication']) assert.ok(md.includes(h), h);
  assert.ok(md.includes('- **Industry:** Roofing'));
  assert.ok(md.includes('- **Biggest challenges:** Leads are slow. No follow up.'), 'line breaks flattened');
  assert.ok(md.includes('- **Ideal client'.slice(0, 4)));
  assert.ok(md.includes('- **Geography:** Not answered'));
  assert.ok(!md.includes('—'));
});

test('the payload carries the client from the link, or a slug made from the company name', () => {
  const linked = icpPayload({ ...data, client: 'nonitos' }, day);
  assert.equal(linked.ok, true);
  assert.equal(linked.payload.client, 'nonitos');
  assert.equal(linked.payload.contact_email, 'noel@example.com');
  assert.equal(icpPayload(data, day).payload.client, 'nonitos-roofing');
  assert.equal(icpPayload({ ...data, client: 'Not A Slug!!' }, day).payload.client, 'nonitos-roofing');
  assert.equal(slugify('  Señor Tequila’s  '), 'senor-tequilas');
});

test('no company name is refused, and a huge answer cannot exceed what HQ accepts', () => {
  assert.equal(icpPayload({ yourName: 'x' }).error, 'missing_company');
  const big = icpPayload({ ...data, additionalNotes: 'x'.repeat(80000) }, day);
  assert.ok(big.payload.body.length <= 39000);
});
