// The accounts the access page can walk a client through (fulfillment ONB-08).
// Plain data so Sam and Mario can fix a step without touching the page.
//
// Rules for writing a step:
// - Invites only. The client adds INVITE_EMAIL from inside their own account. No passwords here.
// - Short imperative lines. Name the button the way the product names it.
// - Products move their menus. If a path changes, fix it here and nowhere else.

export const INVITE_EMAIL = process.env.NEXT_PUBLIC_ACCESS_INVITE_EMAIL || 'manager@thesurgeagency.com';

export const GROUPS = [
  { key: 'google', label: 'Google', blurb: 'How customers find you on Google and what they do on your site.' },
  { key: 'ads', label: 'Ads', blurb: 'So we can run and measure your ads in your own accounts.' },
  { key: 'site', label: 'Website and domain', blurb: 'So we can build, launch and connect your site.' },
  { key: 'social', label: 'Social', blurb: 'So we can keep your pages consistent and connected.' },
];

// login: true  the client may hand over a login for this account through the secure password
//              form instead of inviting us. Off for Google and Meta on purpose: that password is
//              the key to the person's whole Google or Facebook account, and those sign-ins get
//              blocked by their security checks anyway.
// kind: 'invite'  the client adds our email with a role.
//       'request' we send a request and the client approves it. `ask` is what we need first.
//       'choose'  the client picks their platform, then follows that platform's invite steps.
export const ACCOUNTS = [
  {
    key: 'gbp', group: 'google', kind: 'invite',
    name: 'Google Business Profile',
    short: 'Your listing on Google Search and Maps',
    why: 'This is your listing on Google Search and Maps. We keep it accurate, post to it and track calls from it.',
    role: 'Manager',
    link: { label: 'Open Business Profile', url: 'https://business.google.com/' },
    steps: [
      'Sign in to the Google account that owns your business listing.',
      'Open your profile and click the three dots, then "Business Profile settings".',
      'Click "People and access", then "Add".',
      'Paste our email, choose "Manager" and click "Invite".',
    ],
  },
  {
    key: 'ga4', group: 'google', kind: 'invite',
    name: 'Google Analytics',
    short: 'Visitor numbers for your website',
    why: 'This shows who visits your site and what they do there. We use it to prove what is working.',
    role: 'Editor',
    link: { label: 'Open Analytics', url: 'https://analytics.google.com/' },
    steps: [
      'Click "Admin" (the gear at the bottom left).',
      'Under Account, click "Account access management".',
      'Click the blue plus, then "Add users".',
      'Paste our email, tick "Editor" and click "Add".',
    ],
  },
  {
    key: 'gsc', group: 'google', kind: 'invite',
    name: 'Google Search Console',
    short: 'How your site shows up in Google searches',
    why: 'This shows what people search to find you and flags problems Google has with your site.',
    role: 'Full',
    link: { label: 'Open Search Console', url: 'https://search.google.com/search-console/users' },
    steps: [
      'Pick your website at the top left if you have more than one.',
      'Click "Settings", then "Users and permissions".',
      'Click "Add user".',
      'Paste our email, choose "Full" and click "Add".',
    ],
  },
  {
    key: 'gtm', group: 'google', kind: 'invite',
    name: 'Google Tag Manager',
    short: 'Tracking tags on your website',
    why: 'This holds the tracking on your site. We use it to measure calls and form fills.',
    role: 'Administrator, with Publish on your container',
    link: { label: 'Open Tag Manager', url: 'https://tagmanager.google.com/' },
    steps: [
      'Click "Admin" at the top.',
      'Under Account, click "User Management".',
      'Click the blue plus, then "Add users".',
      'Paste our email, tick "Administrator", set your container to "Publish" and click "Invite".',
    ],
  },
  {
    key: 'google_ads', group: 'ads', kind: 'request',
    name: 'Google Ads',
    short: 'Your Google advertising account',
    why: 'We link your ads account to ours. You stay the owner and can remove us any time.',
    ask: { field: 'customer_id', label: 'Your Google Ads customer ID', placeholder: '123-456-7890', hint: 'Ten digits, shown at the top right of Google Ads next to your account name.', pattern: '^\\d{3}-?\\d{3}-?\\d{4}$' },
    link: { label: 'Open Google Ads', url: 'https://ads.google.com/' },
    steps: [
      'Enter your customer ID below and click "Send it".',
      'We send a link request to your account, usually within one business day.',
      'You get an email from Google. In Google Ads go to "Admin", then "Access and security", then "Managers".',
      'Click "Accept" next to The Surge Agency.',
    ],
  },
  {
    key: 'meta', group: 'ads', kind: 'request',
    name: 'Meta ads (Facebook and Instagram)',
    short: 'Your Facebook and Instagram ad account',
    why: 'We connect as a partner on your Meta business account. You stay the owner.',
    ask: { field: 'page_url', label: 'Your Facebook Page link or business name', placeholder: 'facebook.com/yourbusiness', hint: 'So we send the partner request to the right business.' },
    link: { label: 'Open Meta Business settings', url: 'https://business.facebook.com/settings/requests' },
    steps: [
      'Enter your Page link or business name below and click "Send it".',
      'We send a partner request, usually within one business day.',
      'In Meta Business settings, open "Requests".',
      'Approve the request from The Surge Agency for your Page, ad account and Instagram.',
    ],
  },
  {
    key: 'website', group: 'site', kind: 'choose', login: true,
    name: 'Your website',
    short: 'Where your current site is built',
    why: 'So we can see how your current site is built and move it without losing your Google rankings.',
    question: 'What is your website built on?',
    options: [
      {
        key: 'wordpress', label: 'WordPress', role: 'Administrator',
        steps: [
          'Log in to your WordPress dashboard (usually yoursite.com/wp-admin).',
          'Click "Users", then "Add New User".',
          'Use our email, set the role to "Administrator" and click "Add New User".',
        ],
      },
      {
        key: 'wix', label: 'Wix', role: 'Admin (Co-Owner)',
        link: { label: 'Open Wix', url: 'https://manage.wix.com/' },
        steps: [
          'Open your site dashboard and click "Settings".',
          'Click "Roles and permissions", then "Invite collaborators".',
          'Paste our email, choose "Admin (Co-Owner)" and click "Send invite".',
        ],
      },
      {
        key: 'squarespace', label: 'Squarespace', role: 'Administrator',
        link: { label: 'Open Squarespace', url: 'https://account.squarespace.com/' },
        steps: [
          'Open your site and click "Settings".',
          'Click "Permissions", then "Invite contributor".',
          'Paste our email, turn on "Administrator" and click "Invite".',
        ],
      },
      {
        key: 'godaddy_site', label: 'GoDaddy website builder', role: 'Products, Domains and Purchase',
        link: { label: 'Open GoDaddy access settings', url: 'https://account.godaddy.com/access' },
        steps: [
          'Under "People who can access my account", click "Invite to Access".',
          'Name: The Surge Agency. Email: paste ours.',
          'Choose "Products, Domains, and Purchase" and click "Invite".',
        ],
      },
      { key: 'other_site', label: 'Something else, or not sure', help: true },
    ],
  },
  {
    key: 'domain', group: 'site', kind: 'choose', login: true,
    name: 'Your domain name',
    short: 'Where you bought your web address',
    why: 'Your web address has to point at the new site on launch day. That switch happens here.',
    question: 'Where did you buy your domain?',
    options: [
      {
        key: 'godaddy', label: 'GoDaddy', role: 'Products, Domains and Purchase',
        link: { label: 'Open GoDaddy access settings', url: 'https://account.godaddy.com/access' },
        steps: [
          'Under "People who can access my account", click "Invite to Access".',
          'Name: The Surge Agency. Email: paste ours.',
          'Choose "Products, Domains, and Purchase" and click "Invite".',
        ],
      },
      {
        key: 'namecheap', label: 'Namecheap', role: 'Manager',
        link: { label: 'Open Namecheap', url: 'https://ap.www.namecheap.com/domains/list/' },
        steps: [
          'In "Domain List", click "Manage" next to your domain.',
          'Open the "Sharing and Transfer" tab.',
          'Under "Share access", paste our email, choose "Manager" and click "Add".',
        ],
      },
      {
        key: 'cloudflare', label: 'Cloudflare', role: 'Administrator',
        link: { label: 'Open Cloudflare', url: 'https://dash.cloudflare.com/' },
        steps: [
          'Click "Manage Account", then "Members".',
          'Click "Invite".',
          'Paste our email, choose "Administrator" and click "Invite".',
        ],
      },
      {
        key: 'squarespace_domain', label: 'Squarespace (or the old Google Domains)', role: 'Domain manager',
        link: { label: 'Open Squarespace domains', url: 'https://account.squarespace.com/domains' },
        steps: [
          'Click your domain, then "Permissions".',
          'Click "Invite domain manager".',
          'Paste our email and send the invite.',
        ],
      },
      { key: 'other_domain', label: 'Somewhere else, or not sure', help: true },
    ],
  },
  {
    key: 'facebook_page', group: 'social', kind: 'request',
    name: 'Facebook Page and Instagram',
    short: 'Your business pages',
    why: 'So your pages match your new site and can be connected to reviews, tracking and ads later.',
    ask: { field: 'page_url', label: 'Your Facebook Page link', placeholder: 'facebook.com/yourbusiness', hint: 'Add your Instagram name too if it is different.' },
    link: { label: 'Open Meta Business settings', url: 'https://business.facebook.com/settings/requests' },
    steps: [
      'Enter your Page link below and click "Send it".',
      'We send a partner request for your Page and Instagram, usually within one business day.',
      'In Meta Business settings, open "Requests" and approve it.',
      'No Meta business account yet? Choose "I need help" and we will set it up with you on the call.',
    ],
  },
];

export const STATUSES = ['done', 'help', 'skipped', 'requested', 'shared'];

/** May the client submit a login for this account instead of an invite? */
export const allowsLogin = (account) => Boolean(account?.login);

export const accountByKey = (key) => ACCOUNTS.find((a) => a.key === key) || null;

/** Accounts for a link like /access?only=google,site. Unknown or empty means every account. */
export function accountsFor(only) {
  const wanted = String(only || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const groups = wanted.filter((w) => GROUPS.some((g) => g.key === w));
  const keys = wanted.filter((w) => ACCOUNTS.some((a) => a.key === w));
  if (!groups.length && !keys.length) return ACCOUNTS;
  return ACCOUNTS.filter((a) => groups.includes(a.group) || keys.includes(a.key));
}

const clean = (s, max) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

/**
 * Check one report from the page before it goes anywhere.
 * Returns { ok: true, report } or { ok: false, error }.
 */
export function validateReport(body) {
  const client = clean(body?.client, 60).toLowerCase();
  const account = accountByKey(clean(body?.account, 40));
  const status = clean(body?.status, 20);
  if (!/^[a-z0-9-]{1,60}$/.test(client)) return { ok: false, error: 'missing_client' };
  if (!account) return { ok: false, error: 'unknown_account' };
  if (!STATUSES.includes(status)) return { ok: false, error: 'unknown_status' };

  let option = null;
  if (account.kind === 'choose' && body?.option) {
    option = account.options.find((o) => o.key === clean(body.option, 40)) || null;
    if (!option) return { ok: false, error: 'unknown_option' };
  }

  let detail = '';
  if (account.kind === 'request' && status === 'requested') {
    detail = clean(body?.detail, 200);
    if (!detail) return { ok: false, error: 'missing_detail' };
    if (account.ask.pattern && !new RegExp(account.ask.pattern).test(detail)) return { ok: false, error: 'bad_detail' };
  }

  return {
    ok: true,
    report: {
      client,
      company: clean(body?.company, 160),
      account: account.key,
      account_name: account.name,
      status,
      option: option?.key || '',
      option_label: option?.label || '',
      detail,
      note: clean(body?.note, 500),
    },
  };
}

/** One plain line for the HQ card, Slack or an email. */
export function reportLine(r) {
  const what = r.option_label ? `${r.account_name} (${r.option_label})` : r.account_name;
  const tail = r.note ? ` Note: ${r.note}` : '';
  if (r.status === 'done') return `${what}: client says the invite is sent. Confirm ${INVITE_EMAIL} can open it.${tail}`;
  if (r.status === 'requested') return `${what}: client is ready for our request. Send it to: ${r.detail}.${tail}`;
  if (r.status === 'shared') return `${what}: client put a login in the 1Password intake vault. Move it to their vault and delete it from intake.${tail}`;
  if (r.status === 'help') return `${what}: client needs help with this one.${tail}`;
  return `${what}: skipped for now.${tail}`;
}
