# ADR-0002: ICP Form Autosaves to localStorage and Awaits Its Submit

**Status:** Accepted
**Date:** 2026-07-03
**Decider:** Sam Delgado
**Implementation status:** Code complete, verified against a local production build in Chrome; gated on preview deploy
**Repo scope:** onboarding (onboarding.thesurgeagency.com)

## Context

The ICP intake at `/icp` is a 6-step form and the first step of the whole onboarding pipeline (Drive folder + Asana project + client brief all key off it). Valiant lost every answer on a tab refresh, quit, and had to be re-sent the link. Because the ICP kicks off everything downstream, completion friction is lost revenue, not a cosmetic annoyance.

Two failures were in scope:

1. **No persistence.** The form held all answers in React state (`data`) and `step`, so any reload, tab close, crash, or accidental navigation wiped everything. There was no floor under a half-finished form.
2. **Fire-and-forget submit.** `handleSubmit` called `fetch('/api/submit-icp', …)` without `await`, attached only a `.catch` that logged, and then unconditionally rendered the success screen ("We've Got It."). If the request died (offline, 500, dropped connection), the owner saw success while the submission never landed, and nothing was retained to retry. A silently lost submission is the worst outcome for a form that gates onboarding.

This ADR covers Phase 1 of the ICP form improvements spec (`workspace/operations/icp-form-improvements-spec.md`, 2026-07-03). Phases 2 (industry presets) and 3 (Claude assist route) are deliberately not built yet.

## Decision

**1. Debounced localStorage autosave.** A single `useEffect` keyed on `[data, step]` persists `{ data, step, savedAt }` under `icp-draft-v1`, debounced 400ms. `step` is included so an owner returns to the page they left, not the top. localStorage (not a server-side draft) is the right scope: the ICP is filled by one owner on one machine, and per-browser persistence is exactly that reality with zero backend, no auth, and no new failure surface. Resume-by-link / cross-device drafts are explicitly out of scope until someone actually asks to switch devices mid-form.

**2. Restore on mount with a quiet banner.** A mount effect reads the draft and, only if it holds real content (`hasContent` ignores an all-empty draft), hydrates `data` + `step` and shows a low-key banner: "Picked up where you left off (saved {relative time})" with a "Start over" link that clears the draft and resets the form. No modal, no confirm wall. The restore runs in an effect, not in the `useState` initializer, so the client component still server-renders cleanly (`/icp` stays a static prerender).

**3. Clear the draft on confirmed submit only.** The draft is removed on a successful submit and on "Start over" — never on a failed submit, so a failure keeps everything on the device to retry.

**4. Awaited submit with a real error state.** `handleSubmit` now `await`s the fetch, treats any non-2xx as failure (the route is error-isolated and always answers 2xx on a real submission, so a non-ok status genuinely means it did not land), and on failure shows an inline error ("We couldn't submit your ICP just now. Your answers are saved on this device…") and relabels the button "Try Again". The success screen renders only after a confirmed 2xx. The button is disabled while in flight to prevent double submits. **The server's error-isolation contract is untouched** — the route still returns `{ ok: true, errors: [...] }` and never fails the client on a Drive/Asana sub-error; only a transport/5xx failure surfaces as a client error.

**5. `beforeunload` guard, minimal.** A listener prompts on unload only when the last keystroke was within 2s (i.e. the 400ms autosave has not flushed yet). Past 2s the draft is already saved, so no nag.

### The one non-obvious bug this closed

The debounced autosave and the "clear on submit" step race. A `setStep`/typing within 400ms before submit schedules a pending `setTimeout` write. Awaiting the fetch, then calling `removeItem`, does not cancel that already-scheduled timer; it fires afterward and **resurrects the just-cleared draft**. A returning, already-submitted owner would then be told "Picked up where you left off" on a full form they had already sent. Fix: a `doneRef` set synchronously before `clearDraft()`, checked both when scheduling and inside the timer callback, so no autosave can run after a submit lands. This was caught by the browser verification below, not by inspection.

## Options considered

- **Server-side draft accounts / resume-by-link** (spec's richer option): rejected for now. No demonstrated need, and it adds auth, storage, and a new API surface to solve a problem localStorage solves for the actual usage (one owner, one browser). Revisit only when someone needs to switch devices mid-form.
- **Read the draft in the `useState` initializer** instead of an effect: rejected. `ICPForm` renders inside a `'use client'` boundary but still SSRs on first paint; touching `localStorage` during render breaks SSR and risks hydration mismatch. The mount effect is the SSR-safe pattern and keeps `/icp` a static prerender.
- **Keep the fire-and-forget submit, just add a `.catch` toast**: rejected. The core defect is that success is shown before the request resolves. Only awaiting the result and gating the success screen on a confirmed 2xx fixes the silent-loss case.
- **Required-field validation to raise quality**: out of scope by spec. Phases 2-3 (presets, AI assist) raise answer quality without validation walls that hurt completion.
- **Versioned key `icp-draft-v1`**: chosen over an unversioned key so a future breaking change to the `data` shape can bump to `-v2` and ignore stale drafts rather than half-hydrating an incompatible one. `hasContent` also makes an unreadable/empty draft a no-op.

## Consequences

- **Enables:** An owner can close the tab, lose power, or navigate away and resume exactly where they left off, on the same browser. A failed submit no longer silently vanishes: they see an error, their answers are intact, and "Try Again" resubmits. Valiant can be re-sent the link with an honest "your progress saves now."
- **Constrains:** Persistence is per-browser and per-device by design; a different browser or a cleared cache starts fresh. The draft lives in plaintext localStorage on the owner's own machine (ICP answers are business, not secret; acceptable). No server changes, no new env vars, no new dependencies.
- **Design:** Additive only. Existing Tailwind tokens (`surge-green`, `surge-bg`, Bebas/Manrope) and layout are untouched; the restore banner reuses the green-tint chrome and the submit error uses standard Tailwind `red-*` utilities (no config change) since an error state needs a distinct color.
- **Assumes:** localStorage is available (private-mode/quota failures are caught and degrade to no autosave, form still works). The submit route keeps answering 2xx on a landed submission; if it ever starts returning non-2xx on success, the client would wrongly show the error state.

## Verification (2026-07-03)

Verified against a local production build (`next build` + `next start`, Next 16 / Turbopack) driven through real Chrome (puppeteer-core), the same bundle a preview deploy runs.

Happy path (10/10 checks):
- Autosave wrote `icp-draft-v1` as `{ data, step, savedAt }` after ~400ms; `companyName` and `step` correct.
- Advancing steps and filling a step-2 field persisted both the field and `step: 2`.
- After a hard refresh: restore banner shown ("Picked up where you left off (saved just now)"), `step` restored to where they left, and the actual field value (`companyName = "Valiant Roofing"`) present in the DOM after navigating back.
- "Start over" cleared the form fields.
- Reached the final step and submitted; success screen shown; `icp-draft-v1` cleared to `null` after the confirmed submit (this is the check that originally failed and exposed the autosave/clear race, above).

Failure + retry path (6/6 checks, first `POST /api/submit-icp` forced to 500 via request interception):
- Error message shown; success screen NOT shown; button relabeled "Try Again".
- Draft preserved after the failed submit (nothing lost).
- Retry submitted successfully; draft cleared only after the successful retry.

`next build` passes; `/icp` still prerenders as static content (SSR-safe restore confirmed).

Not done here: the live Vercel preview deploy click-through is an ops step (push to the onboarding Vercel project). The behavior above is exercised on the production bundle, so the preview is expected to match.

## References

- Spec: `workspace/operations/icp-form-improvements-spec.md` (Phase 1, 2026-07-03)
- ADR-0001: ICP pipeline moved into onboarding, Asana replaces Notion (the submit route and its error-isolation contract this ADR preserves)
- Component: `src/components/surge/ICPForm.jsx`
