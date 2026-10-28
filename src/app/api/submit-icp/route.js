// POST /api/submit-icp
// 1. Google Drive: create a client folder + drop the ICP questionnaire in it.
// 2. Surge HQ: create the "Onboard {companyName}" task (it used to be an Asana project).
//    The proposal-onboarding agent sets the client up in Agency OS from there.
// Both blocks are error-isolated: a failure pushes a tag into `errors`, logs, and
// never breaks the client's submission.

import { google } from 'googleapis';
import { labelFor } from '@/data/icp-flow';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Render a stored option value (or array of them) as human-readable labels for
// the Drive ICP file + HQ brief. The submitted payload is unchanged; this is
// display-only. Free-text fields (no OPTIONS entry) pass through as-is.
function pretty(field, value) {
  if (Array.isArray(value)) return value.map((v) => labelFor(field, v)).join(', ');
  return labelFor(field, value || '') || '';
}

function formatICP(data) {
  const lines = [
    `ICP QUESTIONNAIRE — ${data.companyName || 'Unknown Company'}`,
    `Submitted: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Submitted by: ${data.yourName || 'N/A'} (${data.yourEmail || 'N/A'})`,
    '═══════════════════════════════════════════════════════════',
    '',
    'SECTION 1 — YOUR COMPANY',
    `Company Name:      ${data.companyName || ''}`,
    `Website:           ${data.companyWebsite || ''}`,
    `Industry:          ${data.industry || ''}`,
    `Team Size:         ${pretty('employeeCount', data.employeeCount)}`,
    `Annual Revenue:    ${pretty('annualRevenue', data.annualRevenue)}`,
    `Business Location: ${data.businessLocation || ''}`,
    `Service Area:      ${data.markets || ''}`,
    `Who They Serve:    ${pretty('businessModel', data.businessModel)}`,
    '',
    'SECTION 2 — IDEAL CLIENT',
    `Description:`,
    `  ${data.idealClientDescription || ''}`,
    `Geography:         ${data.clientGeography || ''}`,
    '',
    'SECTION 3 — GOALS & PAIN POINTS',
    `Biggest Challenges:`,
    `  ${data.biggestChallenges || ''}`,
    `Urgency:          ${pretty('urgency', data.urgency)}`,
    `Current Workarounds:`,
    `  ${data.currentWorkarounds || ''}`,
    `Success Definition:`,
    `  ${data.successDefinition || ''}`,
    `Goal Blockers:`,
    `  ${data.goalBlockers || ''}`,
    '',
    'SECTION 4 — BUYING JOURNEY',
    `How They Research:`,
    `  ${data.howTheyResearch || ''}`,
    `Research Channels: ${pretty('researchChannels', data.researchChannels)}`,
    `Decision Makers:`,
    `  ${data.decisionMakers || ''}`,
    `Sales Cycle:      ${pretty('salesCycleLength', data.salesCycleLength)}`,
    `Common Objections:`,
    `  ${data.commonObjections || ''}`,
    `Evaluation Criteria: ${pretty('evaluationCriteria', data.evaluationCriteria)}`,
    '',
    'SECTION 5 — BEST CLIENTS',
    `Best Client Description:`,
    `  ${data.bestClientDescription || ''}`,
    `Avg Contract Value: ${pretty('avgContractValue', data.avgContractValue)}`,
    `Avg Client Lifespan: ${pretty('avgClientLifespan', data.avgClientLifespan)}`,
    `How They Found You: ${pretty('howTheyFoundYou', data.howTheyFoundYou)}`,
    `Loyalty Drivers:`,
    `  ${data.clientLoyaltyDrivers || ''}`,
    `Marketing Spend:  ${pretty('marketingSpend', data.marketingSpend)}`,
    '',
    'SECTION 6 — COMMUNICATION',
    `Preferred Comms:  ${pretty('preferredComms', data.preferredComms)}`,
    `Social Platforms: ${pretty('socialPlatforms', data.socialPlatforms)}`,
    `Communication Tone: ${pretty('communicationTone', data.communicationTone)}`,
    `Vendor Values:`,
    `  ${data.vendorValues || ''}`,
    `Desired Feelings:`,
    `  ${data.desiredFeelings || ''}`,
    `Additional Notes:`,
    `  ${data.additionalNotes || ''}`,
  ];
  return lines.join('\n');
}

// URL-safe client slug, the same one HQ, Agency OS and the vault use (clients/<slug>/).
function slugFor(companyName) {
  return (companyName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'client';
}

// The HQ task brief: who the client is, where their Drive folder is, and the full ICP
// answers. The steps the agent follows live on its card (agents/proposal-onboarding.md
// in the brain), not here. No em-dashes anywhere in the generated copy.
function buildHqBrief(data, driveFolderUrl) {
  const companyName = data.companyName || 'Unknown Client';
  const na = (v) => (v && String(v).trim() ? String(v).trim() : 'Not provided');
  return [
    `${companyName} submitted the ICP form on ${new Date().toISOString().slice(0, 10)}.`,
    'Set them up in Agency OS following your card (onboarding steps).',
    '',
    `Slug: ${slugFor(companyName)}`,
    `Primary contact: ${na(data.yourName)} (${na(data.yourEmail)})`,
    `Website: ${na(data.companyWebsite)}`,
    `Business location: ${na(data.businessLocation)}`,
    `Service area: ${na(data.markets)}`,
    `Google Drive folder: ${driveFolderUrl || 'creation failed, flag it for Mario'}`,
    '',
    '--- Full ICP answers ---',
    formatICP(data),
  ].join('\n');
}

export async function POST(request) {
  const data = await request.json().catch(() => ({}));
  const companyName = data.companyName || 'Unknown Client';
  const errors = [];

  // Hoisted so the HQ block can link the Drive folder in the brief.
  let driveFolderId = null;

  // ── Google Drive ──────────────────────────────────────────
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const folderRes = await drive.files.create({
      requestBody: {
        name: companyName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      supportsAllDrives: true,
      fields: 'id',
    });
    driveFolderId = folderRes.data.id;

    const icpContent = formatICP(data);
    await drive.files.create({
      requestBody: {
        name: `ICP — ${companyName}.txt`,
        parents: [driveFolderId],
      },
      supportsAllDrives: true,
      media: {
        mimeType: 'text/plain',
        body: icpContent,
      },
    });
  } catch (err) {
    console.error('Google Drive error:', err);
    errors.push('drive');
  }

  // ── Surge HQ ──────────────────────────────────────────────
  // Creates the "Onboard {company}" task in Surge HQ (replaces the Asana project). The
  // proposal-onboarding agent picks it up: it creates the client in Agency OS, applies the
  // tier plan from the payment date, links this Drive folder and posts the human steps
  // (Slack channel, 1Password vault, kickoff call) in #hq.
  // Re-submits never make a second task; HQ adds the new answers as a comment instead.
  try {
    const url = process.env.HQ_SUPABASE_URL;
    const anon = process.env.HQ_SUPABASE_ANON_KEY;
    const secret = process.env.HQ_INTAKE_SECRET;
    if (!url || !anon || !secret) {
      throw new Error('HQ_SUPABASE_URL, HQ_SUPABASE_ANON_KEY or HQ_INTAKE_SECRET is not set');
    }
    const driveFolderUrl = driveFolderId
      ? `https://drive.google.com/drive/folders/${driveFolderId}`
      : null;
    const res = await fetch(`${url}/rest/v1/rpc/intake_onboarding`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'hq',
      },
      body: JSON.stringify({
        p_secret: secret,
        p_payload: {
          company: companyName,
          slug: slugFor(companyName),
          brief: buildHqBrief(data, driveFolderUrl),
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HQ intake failed (${res.status}): ${json?.message || res.statusText}`);
    console.log(`HQ: ${json.created ? 'created' : 'updated'} onboarding task ${json.task_id} for ${companyName}.`);
  } catch (err) {
    console.error('HQ error:', err?.message || err);
    errors.push('hq');
  }

  return Response.json({ ok: true, errors: errors.length ? errors : undefined });
}
