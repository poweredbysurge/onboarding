# Surge / Client Onboarding

Per-client onboarding pages. Each client gets a folder; the onboarding page lives at `[client]/onboarding.html`.

## Clients

| Client | Path | Status |
|--------|------|--------|
| Home Source Roofing | [`homesource/onboarding.html`](homesource/onboarding.html) | Active |

## How to add a new client

1. Copy `homesource/` as a starting template.
2. Update the `CLIENT_CONFIG` block at the top of `onboarding.html` (client name, stakeholders, market, work email, Surge contacts, platforms, prefilled services).
3. Commit on a branch, open a PR. Vercel deploys a preview.
4. Merge to `main` to ship.

## Deployment

Deploys to Vercel (when configured). Each client is served at `[domain]/[client]`.

## Source of truth

The Home Source onboarding page was originally authored in `surge-workspace/clients/homesource/Onboarding/onboarding.html`. The copy here is the canonical, deployable version. If you edit one, sync the other (or pick one and delete the other).
