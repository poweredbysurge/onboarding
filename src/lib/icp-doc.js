// Turns the ICP form's answers into the document HQ saves in the client's Documents folder
// (fulfillment ONB-07). Markdown, because HQ converts it to a Google Doc. No em dashes.

import { labelFor } from '../data/icp-flow.js';

const pretty = (field, value) => (Array.isArray(value) ? value.map((v) => labelFor(field, v)).join(', ') : labelFor(field, value || '') || '');
// One answer on one line. Line breaks inside an answer become spaces so they cannot start a new block.
const say = (v) => { const t = String(v ?? '').replace(/\s*\n+\s*/g, ' ').trim(); return t || 'Not answered'; };
const row = (label, v) => `- **${label}:** ${say(v)}`;

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function icpMarkdown(data, today = new Date()) {
  const company = say(data.companyName);
  const day = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
  return [
    `# ICP questionnaire: ${company}`,
    '',
    `Submitted ${day} by ${say(data.yourName)} (${say(data.yourEmail)}).`,
    '',
    '## 1. Your company',
    row('Company name', data.companyName),
    row('Website', data.companyWebsite),
    row('Industry', data.industry),
    row('Team size', pretty('employeeCount', data.employeeCount)),
    row('Annual revenue', pretty('annualRevenue', data.annualRevenue)),
    row('Business location', data.businessLocation),
    row('Service area', data.markets),
    row('Who they serve', pretty('businessModel', data.businessModel)),
    '',
    '## 2. Ideal client',
    row('Description', data.idealClientDescription),
    row('Geography', data.clientGeography),
    '',
    '## 3. Goals and pain points',
    row('Biggest challenges', data.biggestChallenges),
    row('Urgency', pretty('urgency', data.urgency)),
    row('Current workarounds', data.currentWorkarounds),
    row('What success looks like', data.successDefinition),
    row('What is in the way', data.goalBlockers),
    '',
    '## 4. Buying journey',
    row('How their customers research', data.howTheyResearch),
    row('Research channels', pretty('researchChannels', data.researchChannels)),
    row('Decision makers', data.decisionMakers),
    row('Sales cycle', pretty('salesCycleLength', data.salesCycleLength)),
    row('Common objections', data.commonObjections),
    row('What customers compare on', pretty('evaluationCriteria', data.evaluationCriteria)),
    '',
    '## 5. Best clients',
    row('Best client description', data.bestClientDescription),
    row('Average contract value', pretty('avgContractValue', data.avgContractValue)),
    row('Average client lifespan', pretty('avgClientLifespan', data.avgClientLifespan)),
    row('How they found you', pretty('howTheyFoundYou', data.howTheyFoundYou)),
    row('Why clients stay', data.clientLoyaltyDrivers),
    row('Marketing spend', pretty('marketingSpend', data.marketingSpend)),
    '',
    '## 6. Communication',
    row('Preferred ways to talk', pretty('preferredComms', data.preferredComms)),
    row('Social platforms', pretty('socialPlatforms', data.socialPlatforms)),
    row('Tone', pretty('communicationTone', data.communicationTone)),
    row('What they value in a vendor', data.vendorValues),
    row('How they want customers to feel', data.desiredFeelings),
    row('Anything else', data.additionalNotes),
    '',
  ].join('\n');
}

/** What HQ needs. Returns { ok, payload } or { ok: false, error }. */
export function icpPayload(data, today = new Date()) {
  const company = String(data?.companyName || '').trim().slice(0, 200);
  if (!company) return { ok: false, error: 'missing_company' };
  const given = String(data?.client || '').trim().toLowerCase();
  const client = /^[a-z0-9-]{1,60}$/.test(given) ? given : slugify(company);
  if (!client) return { ok: false, error: 'missing_company' };
  return {
    ok: true,
    payload: {
      client,
      company,
      contact_name: String(data.yourName || '').trim().slice(0, 200),
      contact_email: String(data.yourEmail || '').trim().slice(0, 200),
      body: icpMarkdown(data, today).slice(0, 39000),
    },
  };
}
