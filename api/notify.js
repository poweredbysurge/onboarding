import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const T = {
  bg:           '#09090b',
  surface:      '#111111',
  surface2:     '#161616',
  accent:       '#dee535',
  accentSoft:   'rgba(222,229,53,0.10)',
  accentLine:   'rgba(222,229,53,0.25)',
  border:       'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.09)',
  text:         '#ffffff',
  muted:        '#9ca3af',
  faint:        '#4b5563',
  red:          '#ff4d4d',
  green:        '#10b981',
};

function val(v) {
  if (!v || v === '' || (Array.isArray(v) && v.length === 0)) return null;
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return String(v).trim() || null;
}

function section(title, eyebrow, rows) {
  const rowsHtml = rows
    .filter(r => r.value)
    .map(r => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid ${T.border};">
          <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${T.muted};font-weight:600;margin-bottom:6px;">${r.label}</div>
          <div style="font-size:15px;color:${T.text};line-height:1.65;white-space:pre-wrap;">${r.value}</div>
        </td>
      </tr>`)
    .join('');

  if (!rowsHtml) return '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:${T.surface};border:1px solid ${T.borderStrong};border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:20px 28px 0;">
          <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${T.accent};font-weight:600;margin-bottom:4px;">${eyebrow}</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;color:${T.text};letter-spacing:0.01em;">${title}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${rowsHtml}
          </table>
        </td>
      </tr>
    </table>`;
}

function buildHtml(payload) {
  const platforms = [];
  let i = 0;
  while (payload[`platform-${i}-done`] !== undefined || payload[`platform-${i}-login`] !== undefined) {
    const name = `Platform ${i + 1}`;
    const done = payload[`platform-${i}-done`] === 'on' ? 'Access granted' : 'Not confirmed';
    const login = val(payload[`platform-${i}-login`]);
    platforms.push(`${name}: ${done}${login ? ' | Login: ' + login : ''}`);
    i++;
  }

  const services = [];
  let s = 0;
  while (payload[`service-${s}-name`] !== undefined) {
    const name = val(payload[`service-${s}-name`]);
    const pct  = val(payload[`service-${s}-pct`]);
    const pri  = val(payload[`service-${s}-priority`]);
    if (name) services.push(`${name}${pct ? ' — ' + pct + '%' : ''}${pri ? ' (' + pri + ')' : ''}`);
    s++;
  }

  const inspoLinks = [];
  const rawLinks = payload['inspoLink[]'];
  const links = rawLinks ? (Array.isArray(rawLinks) ? rawLinks : [rawLinks]) : [];
  links.filter(Boolean).forEach(l => inspoLinks.push(l));

  const submittedAt = payload.submittedAt
    ? new Date(payload.submittedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
    : new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });

  const s1 = section('Account Access', 'Step 01 · Foundation', [
    { label: 'Platform Access Status', value: platforms.length ? platforms.join('\n') : null },
    { label: 'Setup Notes', value: val(payload.accessNotes) },
  ]);
  const s2 = section('Brand Assets', 'Step 02 · Foundation', [
    { label: 'Google Drive / Dropbox Link', value: val(payload.brandDriveLink) },
    { label: 'Primary Brand Colors', value: val(payload.brandColors) },
    { label: 'Uploaded Files', value: val(payload.uploadedFileNames) },
    { label: 'Brand Notes', value: val(payload.brandNotes) },
  ]);
  const s3 = section('Website Inspiration', 'Step 03 · Foundation', [
    { label: 'Inspiration Links', value: inspoLinks.length ? inspoLinks.join('\n') : null },
    { label: 'What They Love', value: val(payload.inspoNotes) },
  ]);
  const s4 = section('Operations & SOPs', 'Step 04 · Process', [
    { label: 'Best Offers That Have Worked', value: val(payload.bestOffers) },
    { label: 'Call Center SOP', value: val(payload.callCenterSOP) },
    { label: 'Lead SOP', value: val(payload.leadSOP) },
    { label: 'Automation Wishes', value: val(payload.automationWishes) },
  ]);
  const s5 = section('Service Mix', 'Step 05 · Strategy', [
    { label: 'Services & Revenue Share', value: services.length ? services.join('\n') : null },
    { label: 'Service to Grow', value: val(payload.serviceToGrow) },
    { label: 'Packages & Upsells', value: val(payload.servicePackages) },
  ]);
  const s6 = section('Team & Tools', 'Step 06 · People', [
    { label: 'Social Media Team', value: val(payload.socialTeamIntro) },
    { label: 'Content Library', value: val(payload.contentLibrary) },
    { label: 'Existing TV / Video Assets', value: val(payload.existingTV) },
    { label: 'Other Team Members', value: val(payload.otherTeam) },
  ]);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${T.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:${T.bg};padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;">

        <!-- Header -->
        <tr>
          <td style="padding:0 0 32px;">
            <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${T.accent};font-weight:600;margin-bottom:16px;">Onboarding · ${payload.clientName}</div>
            <div style="font-size:48px;font-weight:900;color:${T.text};line-height:0.95;letter-spacing:0.01em;margin-bottom:16px;">${payload.clientName}<br><span style="color:${T.accent};">SUBMITTED.</span></div>
            <div style="width:36px;height:3px;background:${T.accent};border-radius:2px;margin:20px 0;"></div>
            <div style="font-size:15px;color:${T.muted};line-height:1.65;">
              ${payload.stakeholders} completed onboarding on ${submittedAt}. All six steps are locked in below.
            </div>
          </td>
        </tr>

        <!-- Sections -->
        <tr><td>${s1}${s2}${s3}${s4}${s5}${s6}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:32px 0 0;border-top:1px solid ${T.border};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:${T.faint};">
                  The Surge Agency <span style="color:${T.accent};">×</span> ${payload.clientName}
                </td>
                <td align="right" style="font-size:12px;color:${T.faint};">
                  sam@thesurgeagency.com
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subject, payload } = req.body;

  if (!payload?.clientName) {
    return res.status(400).json({ error: 'Missing payload' });
  }

  try {
    await resend.emails.send({
      from:    'Surge Onboarding <onboarding@thesurgeagency.com>',
      to:      ['sam@thesurgeagency.com', 'mario@thesurgeagency.com'],
      subject: subject || `Onboarding submitted: ${payload.clientName}`,
      html:    buildHtml(payload),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
