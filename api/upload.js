// POST /api/upload  (multipart/form-data)
// Fields: files (one or more), driveFolderId, clientName
// Uploads brand files to Google Drive, then emails Sam and Mario with Drive links.

import { google } from 'googleapis';
import Busboy from 'busboy';
import { Readable } from 'stream';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const T = {
  bg:           '#09090b',
  surface:      '#111111',
  borderStrong: 'rgba(255,255,255,0.09)',
  border:       'rgba(255,255,255,0.06)',
  accent:       '#dee535',
  text:         '#ffffff',
  muted:        '#9ca3af',
  faint:        '#4b5563',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawKey) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
    return res.status(500).json({ error: 'Drive not configured' });
  }

  let credentials;
  try {
    credentials = JSON.parse(rawKey);
  } catch {
    try {
      credentials = JSON.parse(Buffer.from(rawKey, 'base64').toString('utf-8'));
    } catch (err) {
      console.error('Failed to parse service account credentials:', err);
      return res.status(500).json({ error: 'Invalid Drive credentials' });
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const fields = {};
  const files = [];

  await new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    bb.on('field', (name, val) => { fields[name] = val; });
    bb.on('file', (fieldName, stream, info) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => files.push({
        filename: info.filename,
        mimeType: info.mimeType || 'application/octet-stream',
        buffer: Buffer.concat(chunks),
      }));
      stream.on('error', reject);
    });
    bb.on('close', resolve);
    bb.on('error', reject);
    req.pipe(bb);
  });

  const { driveFolderId, clientName } = fields;

  if (!driveFolderId) {
    return res.status(400).json({ error: 'Missing driveFolderId' });
  }

  const results = [];
  for (const file of files) {
    try {
      const resp = await drive.files.create({
        requestBody: { name: file.filename, parents: [driveFolderId] },
        media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
        fields: 'id,webViewLink,name',
      });
      results.push({ name: resp.data.name, id: resp.data.id, link: resp.data.webViewLink });
    } catch (err) {
      console.error(`Failed to upload ${file.filename}:`, err.message);
    }
  }

  if (results.length > 0) {
    const fileRows = results.map(f => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid ${T.border};">
          <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${T.muted};font-weight:600;margin-bottom:6px;">File</div>
          <div style="font-size:15px;color:${T.text};line-height:1.65;">${f.name}</div>
          <div style="margin-top:6px;">
            <a href="${f.link}" style="font-size:13px;color:${T.accent};text-decoration:none;">View in Drive</a>
          </div>
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${T.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${T.bg};padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;">
        <tr>
          <td style="padding:0 0 32px;">
            <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${T.accent};font-weight:600;margin-bottom:16px;">Brand Assets · ${clientName || 'Client'}</div>
            <div style="font-size:48px;font-weight:900;color:${T.text};line-height:0.95;letter-spacing:0.01em;margin-bottom:16px;">FILES<br><span style="color:${T.accent};">IN DRIVE.</span></div>
            <div style="width:36px;height:3px;background:${T.accent};border-radius:2px;margin:20px 0;"></div>
            <div style="font-size:15px;color:${T.muted};line-height:1.65;">${results.length} file${results.length !== 1 ? 's' : ''} uploaded to the ${clientName || 'client'} Google Drive folder.</div>
          </td>
        </tr>
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:${T.surface};border:1px solid ${T.borderStrong};border-radius:16px;overflow:hidden;">
              <tr><td style="padding:0 28px 8px;"><table width="100%" cellpadding="0" cellspacing="0">${fileRows}</table></td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 0 0;border-top:1px solid ${T.border};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:${T.faint};">The Surge Agency <span style="color:${T.accent};">x</span> ${clientName || 'Client'}</td>
                <td align="right" style="font-size:12px;color:${T.faint};">sam@thesurgeagency.com</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from:    'Surge Onboarding <onboarding@thesurgeagency.com>',
      to:      ['sam@thesurgeagency.com', 'mario@thesurgeagency.com'],
      subject: `Files uploaded to Drive: ${clientName || 'Client'}`,
      html,
    }).catch(err => console.error('Upload notify failed:', err.message));
  }

  return res.status(200).json({ ok: true, files: results });
}
