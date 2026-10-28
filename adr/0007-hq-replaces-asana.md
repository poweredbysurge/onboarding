# ADR-0007: Surge HQ replaces Asana in the ICP submit

**Status:** Accepted
**Date:** 2026-10-28
**Decider:** Mario Goncalves
**Supersedes:** the Asana half of ADR-0001

## Context

Surge is dropping Asana. Client plans now live in Agency OS (Blueprint Training) and the work runs through Surge HQ (hq.thesurgeagency.com). Trello stays the day-to-day source of truth until Mario says otherwise.

## Decision

`/api/submit-icp` keeps the Drive block exactly as it was. The Asana block is replaced by one call to Surge HQ: `POST {HQ_SUPABASE_URL}/rest/v1/rpc/intake_onboarding` with the public anon key and a shared secret (`HQ_INTAKE_SECRET`). HQ checks the secret, then creates the task "Onboard {companyName}" for the proposal-onboarding agent, with the client details, the Drive folder link and the full ICP answers as the brief. A re-submit adds a comment to the open task instead of a second task.

The agent then creates the client in Agency OS, applies the tier plan from the payment date and lists the human steps (Slack channel, 1Password vault, kickoff call) in #hq. Access is still collected live on the kickoff call.

Error isolation is unchanged: if HQ is down the client still sees success and `errors` carries `hq`.

## Env

| Variable | Value |
|---|---|
| `HQ_SUPABASE_URL` | Surge HQ Supabase project URL |
| `HQ_SUPABASE_ANON_KEY` | its public anon key |
| `HQ_INTAKE_SECRET` | from 1Password (SURGE-HQ, "HQ intake secret"); HQ stores only its sha256 |
| `ASANA_PAT` | remove |

Setup steps: surge-hq `docs/onboarding-intake.md`.
