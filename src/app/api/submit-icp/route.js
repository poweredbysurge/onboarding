// POST /api/submit-icp
// 1. Google Drive: create a client folder + drop the ICP questionnaire in it.
// 2. Asana: duplicate the [TEMPLATE] Client Project into the Surge team, name it
//    "Client · {companyName}", write the client brief into project notes, and mark
//    the "ICP form completed" + "Drive folder created" tasks done.
// Both blocks are error-isolated: a failure pushes a tag into `errors`, logs, and
// never breaks the client's submission.

import { google } from 'googleapis';
import { labelFor } from '@/data/icp-flow';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Render a stored option value (or array of them) as human-readable labels for
// the Drive ICP file + Asana brief. The submitted payload is unchanged; this is
// display-only. Free-text fields (no OPTIONS entry) pass through as-is.
function pretty(field, value) {
  if (Array.isArray(value)) return value.map((v) => labelFor(field, v)).join(', ');
  return labelFor(field, value || '') || '';
}

// Asana constants (module scope)
const ASANA_BASE = 'https://app.asana.com/api/1.0';
const ASANA_TEMPLATE_PROJECT_GID = '1216220935913043'; // [TEMPLATE] Client Project
const ASANA_TEAM_GID = '16215052500132';               // ⚡ S U R G E
const ASANA_WORKSPACE_GID = '16215052500131';          // Surge (org/workspace)

// Template task names to mark complete once the client reaches this step.
const ICP_TASK_NAME = 'ICP form completed';
const DRIVE_TASK_NAME = 'Drive folder created + linked in project description';

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

// Build the Asana project brief following the house overview format.
// No em-dashes anywhere in the generated copy.
function buildClientBrief(data, driveFolderUrl) {
  const companyName = data.companyName || 'Unknown Client';
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'client';
  const na = (v) => (v && String(v).trim() ? String(v).trim() : 'Not provided');
  const naOpt = (field, v) => (v && String(v).trim() ? pretty(field, v) : 'Not provided');
  const driveLine = driveFolderUrl
    ? driveFolderUrl
    : 'Drive folder: creation failed, create manually';

  return [
    `${companyName} onboarding.`,
    '',
    `Slack: create #client-${slug} and link it here.`,
    '',
    `Google Drive folder: ${driveLine}`,
    '',
    'WHO THEY ARE',
    `Company: ${na(companyName)}`,
    `Primary contact: ${na(data.yourName)} (${na(data.yourEmail)})`,
    `Website: ${na(data.companyWebsite)}`,
    `Industry: ${na(data.industry)}`,
    `Business location: ${na(data.businessLocation)}`,
    `Service area: ${na(data.markets)}`,
    `Who they serve: ${naOpt('businessModel', data.businessModel)}`,
    `Team size: ${naOpt('employeeCount', data.employeeCount)}`,
    `Annual revenue: ${naOpt('annualRevenue', data.annualRevenue)}`,
    '',
    "WHAT WE'RE DOING",
    `Average contract value: ${naOpt('avgContractValue', data.avgContractValue)}`,
    `Biggest challenges: ${na(data.biggestChallenges)}`,
    `What success looks like: ${na(data.successDefinition)}`,
  ].join('\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Thin Asana REST wrapper. Throws on non-2xx so the caller's try/catch tags 'asana'.
async function asana(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.ASANA_PAT}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(`Asana ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

// Idempotency lookup by exact project name at the WORKSPACE level.
// We deliberately do not use GET /teams/{team}/projects: Asana's project
// duplicate endpoint returns team-less projects (the duplicated project comes
// back with team = null even when a team is requested), so a team-scoped
// listing never sees them and every re-submit would create a duplicate. A
// workspace listing is strongly consistent and finds the project regardless of
// team. Paginates so it does not silently miss projects past the first page.
async function findProjectByName(projectName) {
  let offset = null;
  for (let page = 0; page < 20; page++) {
    const q = `/projects?workspace=${ASANA_WORKSPACE_GID}&archived=false&opt_fields=name&limit=100${offset ? `&offset=${offset}` : ''}`;
    const res = await asana(q);
    const hit = (res.data || []).find((p) => p.name === projectName);
    if (hit) return hit;
    offset = res.next_page?.offset || null;
    if (!offset) break;
  }
  return null;
}

export async function POST(request) {
  const data = await request.json().catch(() => ({}));
  const companyName = data.companyName || 'Unknown Client';
  const errors = [];

  // Hoisted so the Asana block can link the Drive folder in the brief.
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

  // ── Asana ─────────────────────────────────────────────────
  try {
    if (!process.env.ASANA_PAT) {
      throw new Error('ASANA_PAT is not set');
    }

    const projectName = `Client · ${companyName}`;
    const driveFolderUrl = driveFolderId
      ? `https://drive.google.com/drive/folders/${driveFolderId}`
      : null;
    const notes = buildClientBrief(data, driveFolderUrl);

    // 1. Idempotency: reuse an existing project of the same name (no duplicate on re-submit).
    const match = await findProjectByName(projectName);

    if (match) {
      await asana(`/projects/${match.gid}`, {
        method: 'PUT',
        body: { data: { notes } },
      });
      console.log(`Asana: updated existing project ${projectName} (${match.gid}), skipped duplication.`);
    } else {
      // 2. Duplicate the template. The copy inherits the template's team
      //    (⚡ S U R G E). We assign the team explicitly in step 4 as well,
      //    because the duplicate endpoint does not reliably file it into a team.
      const dup = await asana(`/projects/${ASANA_TEMPLATE_PROJECT_GID}/duplicate`, {
        method: 'POST',
        body: {
          data: {
            name: projectName,
            include: ['members', 'notes', 'task_notes', 'task_subtasks', 'task_dependencies'],
          },
        },
      });
      const jobGid = dup.data?.gid;
      if (!jobGid) throw new Error('Asana duplicate returned no job gid');

      // 3. Duplication is async: poll the job (1s interval, 30s cap).
      let newProjectGid = null;
      for (let i = 0; i < 30; i++) {
        const job = await asana(`/jobs/${jobGid}`);
        const status = job.data?.status;
        if (status === 'succeeded' || status === 'completed') {
          newProjectGid = job.data?.new_project?.gid;
          break;
        }
        if (status === 'failed') throw new Error('Asana duplicate job failed');
        await sleep(1000);
      }
      if (!newProjectGid) throw new Error('Asana duplicate job did not complete within 30s');

      // 4. Write the client brief into the project notes, and file the project
      //    into the Surge team. Team assignment is best-effort: if it is not
      //    permitted, log and continue so notes + task completion still land.
      await asana(`/projects/${newProjectGid}`, {
        method: 'PUT',
        body: { data: { notes } },
      });
      try {
        await asana(`/projects/${newProjectGid}`, {
          method: 'PUT',
          body: { data: { team: ASANA_TEAM_GID } },
        });
      } catch (teamErr) {
        console.warn(`Asana: could not set team on ${newProjectGid}:`, teamErr?.message || teamErr);
      }

      // 5. Mark the ICP + Drive tasks complete (match by name).
      const tasks = await asana(`/tasks?project=${newProjectGid}&opt_fields=name&limit=100`);
      const targets = new Set([ICP_TASK_NAME, DRIVE_TASK_NAME]);
      const toComplete = (tasks.data || []).filter((t) => targets.has(t.name));
      for (const task of toComplete) {
        await asana(`/tasks/${task.gid}`, {
          method: 'PUT',
          body: { data: { completed: true } },
        });
      }
      console.log(`Asana: created ${projectName} (${newProjectGid}), completed ${toComplete.length} task(s).`);
    }
  } catch (err) {
    console.error('Asana error:', err?.message || err);
    errors.push('asana');
  }

  return Response.json({ ok: true, errors: errors.length ? errors : undefined });
}
