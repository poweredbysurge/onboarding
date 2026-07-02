# ADR-0001: ICP Pipeline Moves Into Onboarding, Asana Replaces Notion

**Status:** Accepted
**Date:** 2026-07-01
**Decider:** Sam Delgado
**Implementation status:** Code complete, gated on preview deploy + `ASANA_PAT`
**Repo scope:** onboarding (onboarding.thesurgeagency.com)

## Context

The ICP intake form used to live in surge-web at `thesurgeagency.com/icp`. On submit it wrote to Google Drive (client folder + ICP text file) and to a Notion Clients DB (Status = Onboarding). Two things changed:

1. ICP is part of onboarding, so the code should live in the onboarding repo, not the marketing site. The onboarding repo already owns the per-client onboarding pages (for example `/homesource`) and the `/api/notify` + `/api/upload` handlers.
2. Notion is being retired as the client task home (July 2026). Asana is where client projects now live. There is a `[TEMPLATE] Client Project` in the `⚡ S U R G E` team that is duplicated per client. The ICP submit is the natural trigger to instantiate that project.

The onboarding repo was a static site (HTML forms in `homesource/`, Vercel serverless functions in `api/`, `cleanUrls` in `vercel.json`). It had no framework. To host the ICP React page it needed a real framework.

## Decision

**Convert the onboarding repo to Next.js (App Router).**

- Per-client HTML forms moved from `homesource/` to `public/homesource/`. Because Next serves `public/` at exact paths only, `next.config.js` rewrites re-create the old clean URLs: `/homesource` resolves to `public/homesource/index.html`, plus explicit rewrites for `/homesource/branding` and `/homesource/launch`. A generic `/:client` rewrite covers future clients that follow the `public/<client>/index.html` convention.
- `api/notify.js` and `api/upload.js` became App Router route handlers at `src/app/api/notify/route.js` and `src/app/api/upload/route.js`, keeping the same `/api/notify` and `/api/upload` URLs the HTML forms already call. `upload` now parses multipart with the native Web `FormData` API (`await request.formData()`), which removed the `busboy` dependency.
- The ICP page, `ICPPage` route, and `ICPForm` component were copied from surge-web verbatim, along with the Surge brand tokens (bg `#09090b`, green `#dee535`, Bebas Neue + Manrope) as a trimmed Tailwind config and `globals.css`. New canonical URL: `onboarding.thesurgeagency.com/icp`.

**Replace the Notion block in `submit-icp` with an Asana block.** Same error-isolation contract as before: a failure pushes a tag into `errors`, logs, and never breaks the client's submission. On submit the route:

1. Looks for an existing `Client · {companyName}` project by exact name via a paginated `GET /projects?workspace={workspace}&archived=false`. If found, it PUTs updated notes and stops (idempotent, no duplicate on re-submission).
2. Otherwise `POST /projects/{template}/duplicate`, polls `GET /jobs/{gid}` (1s interval, 30s cap) until the duplication job succeeds, and reads `new_project.gid`.
3. PUTs the client brief into the project notes (house overview format: headline, Slack channel placeholder, Drive folder link, WHO THEY ARE, WHAT WE'RE DOING) and files the project into the Surge team. No em-dashes in generated copy.
4. Marks the template tasks `ICP form completed` and `Drive folder created + linked in project description` complete by matching task name.

The Drive block's `folderId` was hoisted to a route-scoped `driveFolderId` so the Asana brief can link `https://drive.google.com/drive/folders/{driveFolderId}`. If Drive creation failed, the brief writes "creation failed, create manually" instead.

**Deviation from the spec, forced by live behavior:** the spec called for idempotency via `GET /teams/{team}/projects` and for the `duplicate` call to pass `team`. Live testing showed Asana's `duplicate` endpoint returns a **team-less** project (the copy comes back with `team = null` even when a team is requested in the duplicate body). A team-scoped listing therefore never sees the new project, so every re-submit would create a duplicate. Two changes fix this: (a) idempotency is done at the workspace level by exact name, which is team-independent and strongly consistent; (b) after duplication the project is filed into the team with an explicit `PUT /projects/{gid}` `{ team }` (best-effort: if it is ever disallowed it logs and continues, and idempotency still holds via the workspace lookup). The `team` field was dropped from the `duplicate` body since it was a no-op.

Pinned constants (module scope): `ASANA_TEMPLATE_PROJECT_GID = 1216220935913043`, `ASANA_TEAM_GID = 16215052500132`, `ASANA_WORKSPACE_GID = 16215052500131`. Auth: `Bearer ${process.env.ASANA_PAT}`.

## Options considered

- **Keep the `api/` folder as root-level Vercel functions alongside Next** (spec offered this): rejected. With the Next.js preset, Vercel builds routing from the framework and a root `/api` folder is not reliably served. App Router route handlers keep the exact same URLs with no ambiguity, and they are the idiomatic home for these handlers now that the repo is a Next app.
- **`request.formData()` vs. porting busboy**: chose native `formData()`. App Router route handlers parse multipart natively, there is no 4MB body-parser cap to work around, and it drops a dependency. Busboy existed only to hand-parse the raw stream that Pages-style functions gave you.
- **ICP stays in surge-web, only Notion swapped for Asana**: rejected. ICP belongs with onboarding, and keeping it in the marketing site meant the marketing site kept a Google service account and Asana token it otherwise has no reason to hold.

## Consequences

- **Enables:** One home for onboarding (pages + intake + task instantiation). A signed client filling the ICP now auto-creates their Asana project, links their Drive folder, and checks off the first two onboarding tasks. Idempotent by project name, so a client re-submitting does not spawn duplicates.
- **Constrains:** Live Asana calls require `ASANA_PAT` in the onboarding Vercel project. Env vars needed here: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID`, `RESEND_API_KEY`, `ASANA_PAT` (all four are set, marked Sensitive). Slack channel creation stays manual (the brief leaves a `#client-{slug}` placeholder). The Drive block always creates a fresh client folder on every submit; a re-submission updates the Asana notes with the newest folder link but does not delete the earlier folder.
- **Defers / manual:** Domain cutover (`onboarding.thesurgeagency.com` DNS CNAME to the onboarding Vercel project) and env var provisioning are ops steps outside the code. The stale `package-lock.json` was removed so the first deploy regenerates a clean lockfile from the new `package.json`.
- **Assumes:** The Asana duplication job returns `new_project.gid` on a `succeeded` job within 30s. The two template task names are matched literally; renaming them in the template breaks the auto-complete step (a no-op that logs, not a failure).

## Verification (2026-07-01)

Local:
- `npm run build` passes. Routes: `/`, `/icp`, `/api/notify`, `/api/submit-icp`, `/api/upload`.
- Production server smoke test: `/`, `/icp`, `/homesource`, `/homesource/branding`, `/homesource/launch` all return 200 and render expected content.
- Error isolation confirmed: `POST /api/submit-icp` with no credentials returns `{ ok: true, errors: ["drive","asana"] }`; `POST /api/notify` with no payload returns 400.

Live preview deploy dry run (real Drive + real Asana, companyName `[TEST] Delete Me`):
- Submission returned `{ ok: true }` with no error tags.
- Asana project `Client · [TEST] Delete Me` created **private**, filed in **⚡ S U R G E**, all 7 template sections intact, 27 tasks.
- Notes populated in house format with the real Drive folder link hoisted in from the Drive block. No em-dashes.
- Exactly the two tasks completed: `ICP form completed` and `Drive folder created + linked in project description`. The other 25 untouched.
- Re-submission (~3.6s vs. ~20s for the first) updated the existing project's notes in place and created **no duplicate** (exactly one project remained). Idempotency confirmed.
- Test project deleted after the run; workspace left clean.

## References

- Spec: `workspace/operations/asana-migration/onboarding-asana-rewire-spec.md` (v3, 2026-07-01)
- surge-web ADR-0001: ICP moved out, redirect in place
- Template project: `[TEMPLATE] Client Project` (gid 1216220935913043) in `⚡ S U R G E` (team gid 16215052500132)
