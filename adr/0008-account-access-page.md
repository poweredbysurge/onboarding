# ADR 0008: Account access page, invites first

Date: 2026-11-19
Status: Accepted (parts 1 and 3 built, part 2 to do)

## Context

Access used to be collected live on the kickoff call. The fulfillment map (step ONB-08, decision D-08) moves it before the call, behind the welcome email's "Start the access steps" button. Leadsie is on hold, so this is our own page. On Nov 19 Sam chose: invites plus a secure password drop for accounts with no invite option, all four account groups, and progress reported to the client's HQ card and Slack channel.

## Decision

- `/access` is the page. `/access?c=<client-slug>&company=<Business name>&only=<groups or account keys>`. `only` limits what shows (for example `only=google,site`). Without it every account shows.
- The client ticks the accounts they have, then gets one screen per account: why we need it, the email to invite (manager@thesurgeagency.com), the role, numbered steps, a button to the right settings page, and "I sent the invite", "I need help with this one" or "Skip for now".
- Google Ads and Meta are requests: the client gives us the customer ID or Page link, we send the request, they approve.
- Website and domain ask which platform first, then show that platform's invite steps. "Not sure" goes to help.
- All account copy lives in `src/lib/access-accounts.js`. Fix a changed menu path there and nowhere else.
- Progress is kept in the browser so the client can come back. Each step is also posted to `POST /api/access/report`, which sends it to Surge HQ (`hq.intake_access`, when the three `HQ_*` variables are set) and otherwise emails the team for anything a person must act on, plus a summary at the end.
- The page has no password field. A test fails if any account step mentions one.

## Still to build

- Part 2, HQ side: `hq.intake_access` in surge-hq, a note on the client's "Account access granted" card and a post in their Slack channel.
- Part 3, password drop: a separate secure field that writes straight into a 1Password intake vault through a service account. Nothing stored in our database, email, Slack or logs.

## Consequences

- "I sent the invite" is the client's word. A person still confirms manager@ can open each account.
- The page is public with no login and no rate limit. HQ only accepts reports for a client it knows.
- Menu paths in other companies' products change. Review the steps in `access-accounts.js` when a client says one is wrong.

## Update, 2026-11-19: password drop built (part 3)

- Shown only inside "I need help with this one", as "There is no way to invite you. Share the login securely instead", and only when 1Password is connected. Invites stay the first and obvious path.
- `POST /api/access/secret` takes site, username, password and an optional note, and creates one Login item in a single 1Password vault (the intake vault) through a 1Password service account. Code: `src/lib/access-vault.js`.
- The password goes browser, HTTPS, this server's memory, 1Password. It is not written to a database, a log, an email, Slack, HQ or the browser's storage. The team is told that a login arrived for which account, never what it is. Tests cover each of those.
- Settings in Vercel: `OP_SERVICE_ACCOUNT_TOKEN` (sensitive, entered by Sam, never pasted in chat) and `OP_INTAKE_VAULT` (the vault's name or ID). Without both the drop is off and the page hides it. Check: `/api/access/secret?check=1`.
- The service account gets read and write on the intake vault only. 1Password requires read alongside write, so a leaked token could read whatever is sitting in intake. That is why intake is a pass-through: move each item to the client's vault and delete it from intake the same day.
- Not solved: the endpoint is public with no rate limit, so someone could fill the intake vault with junk items. They could not read anything.

## Update, 2026-11-19 evening: confirmations, and the password form as a main choice

From Sam's first live test. After he sent a login, the page showed the same account again with no sign that anything was received. The cause was not reproduced (the server accepted the drop and the same steps pass in a test browser), so the page no longer relies on a silent jump:

- Every answer now shows a confirmation on that account ("Login received", "Invite noted", and so on) with a "Next" button. Going back to an answered account shows it as answered, with "Do this one again".
- The password form is a main choice, not a link inside help: a full-width "Submit your password securely" button under "I sent the invite", and the primary button when the client picks "not sure".
- Logins are accepted only for accounts marked `login: true` in `access-accounts.js`: website and domain. Google and Meta are left out on purpose. That password opens the person's whole Google or Facebook account, and those sign-ins are blocked by security checks anyway. The server refuses a login for any other account.
