// POST /api/icp-assist — Phase 3 Claude assist for the ICP form.
//
// Two modes, one route, model claude-sonnet-5:
//   mode "website": fetch the owner's homepage (+ /about, 1 hop, 10s cap), extract
//     company basics + draft ideal/best client paragraphs.
//   mode "field": draft 2-3 short candidate answers for one long-text field from the
//     owner's rough notes + company context.
//
// Guard rails (per spec):
//   - Rate limit: 10 calls / IP / hour (best-effort in-memory; per lambda instance).
//   - max_tokens capped; temperature default (omitted); no thinking (fast + fits the cap).
//   - Never log form content: it is passed to Claude, returned, and dropped. Nothing here
//     writes request bodies or model output to logs.
//   - Never blocks the form: any failure returns a non-2xx and the client stays manual.

import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-sonnet-5';
const RATE_LIMIT = 10;          // calls
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour
const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_CHARS = 6000;    // per page, to bound tokens

// Industry chip labels the client understands (mirrors src/data/icp-flow.js).
const INDUSTRIES = ['Roofing', 'HVAC', 'Plumbing', 'Electrical', 'Landscaping/Outdoor', 'Solar', 'Remodeling/Exterior'];

// ── best-effort in-memory rate limiter (module scope) ──
const hits = new Map(); // ip -> number[] timestamps
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

// Strip a fetched HTML page to visible-ish text, capped.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PAGE_CHARS);
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'SurgeICP/1.0 (+onboarding.thesurgeagency.com)' },
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return '';
    return htmlToText(await res.text());
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Ask Claude for JSON matching `schema`; returns the parsed object or null.
async function askJson(client, { system, user, schema, maxTokens }) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' }, // fast, cheap, keeps output inside the token cap
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  });
  const text = (res.content || []).find((b) => b.type === 'text')?.text || '';
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function handleWebsite(client, url) {
  const home = await fetchPage(url.href);
  // one hop: try /about (best effort)
  let about = '';
  try { about = await fetchPage(new URL('/about', url).href); } catch { /* noop */ }
  const pageText = [home, about].filter(Boolean).join('\n\n---\n\n');
  if (!pageText) return { ok: false, error: 'unreadable' };

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['companyName', 'industry', 'businessLocation', 'markets', 'businessModel', 'idealClientDescription', 'bestClientDescription'],
    properties: {
      companyName: { type: 'string' },
      industry: { type: 'string', description: `One of: ${INDUSTRIES.join(', ')}. Empty string if none clearly fits.` },
      businessLocation: { type: 'string', description: 'City and state of the business, e.g. "Fort Worth, TX". Empty if unknown.' },
      markets: { type: 'string', description: 'Cities/regions served. Empty if unknown.' },
      businessModel: { type: 'string', description: 'One of: Homeowners, Commercial, Both. Empty if unclear.' },
      idealClientDescription: { type: 'string', description: 'A 2-3 sentence first-person draft of who their ideal client is. Empty if the site gives no basis.' },
      bestClientDescription: { type: 'string', description: 'A 2-3 sentence first-person draft describing their best kind of client. Empty if no basis.' },
    },
  };
  const system = 'You extract facts from a home-services contractor\'s website to pre-fill an intake form. Only use what the page supports. Leave a field as an empty string rather than guessing. First person, plain contractor language, no marketing fluff, no em-dashes.';
  const user = `Website content follows. Extract the fields per the schema.\n\n${pageText}`;
  const data = await askJson(client, { system, user, schema, maxTokens: 1024 });
  if (!data) return { ok: false, error: 'nodraft' };

  // Only surface non-empty fields; normalize the two constrained ones.
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    const val = String(v || '').trim();
    if (val) fields[k] = val;
  }
  if (fields.industry && !INDUSTRIES.includes(fields.industry)) delete fields.industry; // client keeps it clean
  if (fields.businessModel && !['Homeowners', 'Commercial', 'Both'].includes(fields.businessModel)) delete fields.businessModel;
  return { ok: true, fields };
}

async function handleField(client, { label, hint, industry, company, rough }) {
  const ctx = [
    company?.companyName && `Company: ${company.companyName}`,
    industry && `Trade: ${industry}`,
    company?.markets && `Service area: ${company.markets}`,
    company?.businessModel && `Serves: ${company.businessModel}`,
  ].filter(Boolean).join('. ');

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['candidates'],
    properties: {
      candidates: { type: 'array', items: { type: 'string' } },
    },
  };
  const system = 'You help a home-services business owner fill out one field of an intake form. Write in first person AS the owner, in plain contractor language. Each candidate is 2-3 sentences max. No marketing fluff, no em-dashes. Return 2-3 distinct candidates.';
  const user = [
    ctx && `About the business: ${ctx}.`,
    `The form asks: "${label}"${hint ? ` (${hint})` : ''}.`,
    rough && rough.trim() ? `Their rough notes so far: "${rough.trim()}". Sharpen and expand these.` : 'They have not written anything yet. Give them strong starting points.',
    'Return 2-3 candidate answers.',
  ].filter(Boolean).join('\n');

  const data = await askJson(client, { system, user, schema, maxTokens: 400 });
  const candidates = Array.isArray(data?.candidates)
    ? data.candidates.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3)
    : [];
  if (!candidates.length) return { ok: false, error: 'nodraft' };
  return { ok: true, candidates };
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
  if (rateLimited(clientIp(request))) {
    return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'bad_request' }, { status: 400 }); }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    if (body.mode === 'website') {
      const url = normalizeUrl(body.url);
      if (!url) return Response.json({ ok: false, error: 'bad_url' }, { status: 400 });
      const out = await handleWebsite(client, url);
      return Response.json(out, { status: out.ok ? 200 : 502 });
    }
    if (body.mode === 'field') {
      if (!body.label) return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
      const out = await handleField(client, body);
      return Response.json(out, { status: out.ok ? 200 : 502 });
    }
    return Response.json({ ok: false, error: 'bad_mode' }, { status: 400 });
  } catch (err) {
    // Log the failure class only — never the form content or model output.
    console.error('icp-assist error:', err?.status || '', err?.name || 'error');
    return Response.json({ ok: false, error: 'server_error' }, { status: 502 });
  }
}
