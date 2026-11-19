# ADR 0008: Account access page, invites first

Date: 2026-11-19
Status: Accepted (part 1 of 3 built)

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
