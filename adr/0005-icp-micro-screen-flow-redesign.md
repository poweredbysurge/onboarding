# ADR-0005: ICP Redesign, One-Question-Per-Screen Flow

**Status:** Accepted (old long-form retained until the real Drive/Asana E2E passes on a deploy)
**Date:** 2026-07-03
**Decider:** Sam Delgado
**Implementation status:** Code complete, verified on a local production build (desktop + 375px mobile + Lighthouse). Old form removal and the live Drive/Asana submit are gated on a preview/prod run.
**Repo scope:** onboarding (onboarding.thesurgeagency.com)

## Context

The ICP intake was a working six-step long-form (ADR-0002 through 0004: autosave, presets, home-services refit). A design prototype in `ICP-Redesign/` reimagined it as a one-question-per-screen "micro-screen" flow: chapter breathers, a two-tone split (dark question panel + light context sidebar), auto-advancing single-choice, an undo window, a final review with edit-in-place, and percent/time-remaining progress instead of step counts. The prototype is a design-tool artifact (`*.dc.html` + `support.js` runtime); it must not be mounted in production. The task was to port the flow into real React using `ICP-Redesign/icp-screens.js` as the source of truth for screen order and grouping, and the skinned prototype for visual treatment, without changing what `/api/submit-icp` receives.

## Decision

**Contract first (drift report).** Before any UI work, every field name and option value in `icp-screens.js` was diffed against what the old `ICPForm.jsx` actually submitted. Result: **no payload drift.** 34/34 field names identical; all 14 option groups match, order-identical, on the submitted `value` (slugs like `under-500k`, `2-4-weeks`; `businessModel` = `Homeowners`/`Commercial`/`Both`). The redesign only enriches display *labels*, which are never submitted. The two "looks drifted" flags were confirmed label-only:
- Range selects (`annualRevenue` etc.) still submit slugs. To make the Drive file and Asana brief read well, a display-only `pretty()`/`labelFor()` mapping was added in `submit-icp/route.js` (slug to label, arrays joined). The POST payload is byte-identical to before; only the rendered brief improves (`Annual Revenue: Under $500K`, `Research Channels: Google Search, Google Reviews`).
- `businessModel` keeps the home-services labels as submitted values (already the case since ADR-0004); the brief prints `Who They Serve: Homeowners`.

**Flow config as a shared module.** `icp-screens.js` was ported verbatim to `src/data/icp-flow.js` (ESM: `OPTIONS`, `CHAPTERS`, `SCREENS`, `INITIAL`, `labelFor`). This is the production source of truth for screen order/grouping/options and is imported by both the flow component and the server route (for `labelFor`). Screen kinds: `intro | pair | short | single | dual | multi | long | review`.

**New component `ICPFlow.jsx`** replaces `ICPForm` inside `ICPPage`. The existing start page and its animation are untouched; `ICPPage` simply mounts `<ICPFlow/>` in place of the old stepper. `ICPFlow` owns the flow and submitted phases and restores on mount. It faithfully ports the prototype's mechanics:
- **Autosave per micro-screen** to `icp-draft-v2` as `{ data, idx, savedAt }`, debounced 400ms, restored into the exact screen. A one-time migration reads an old `icp-draft-v1` draft (data carries over, restart at screen 0). Draft clears only on confirmed submit or Start over. A `doneRef` blocks any pending autosave from resurrecting a cleared draft (the ADR-0002 fix, carried forward).
- **Auto-advance** on single-choice (and completed dual) after 450ms, with a 4s **undo** toast. **Desktop only** — see mobile note below.
- **Enter-to-continue** on desktop (not on review, not while editing, not on mobile). `Shift+Enter` is a newline in long fields.
- **Skippable** questions ("Not sure yet"); the optional notes screen is explicitly skippable.
- **Progress** is `est`-based: percent done + minutes left + an "Autosaved" pulse, never step counts.
- **Review** groups every answer by chapter with **edit-in-place** (text/long/single/multi inline editors), reading human-readable labels via `labelFor`.
- **Real submit** (not the prototype's console stub): awaits `POST /api/submit-icp`, treats non-2xx as failure with an inline error + "Try Again", clears the draft and shows the success screen only on a confirmed 2xx.
- **Reserved AI-assist slot** (disabled "Draft it for me" / "AI assist coming soon") kept in the desktop sidebar and mobile sheet for Phase 3.
- **Per-question timing instrumentation** kept: each answered screen records `{ screenId, shownAt, answeredAt, ms, skipped }` to `window.__icpTimings` + console; the `sendBeacon('/api/icp-telemetry', ...)` line is a commented stub for a Phase 3+ endpoint.

**Mobile adaptation (deliberate divergence from the prototype).** Auto-advance is **disabled on mobile** (`innerWidth < 820`); single-choice screens show an explicit Continue button instead. This removes the "auto-advance fires while scrolling" hazard on touch and is more predictable. The light sidebar collapses to a "Why we ask this" bottom sheet; the question panel is top-aligned so the keyboard does not trap inputs; touch targets are 44px+. The review row uses a narrower label column and wrapping values on mobile so long emails do not clip.

**Fonts.** The prototype uses IBM Plex Mono for its mono labels; it was added via `next/font` (`--font-mono`) alongside the existing self-hosted Bebas Neue (`--font-display`) and Manrope (`--font-body`). The component references the CSS variables, not literal family names, so it uses the same self-hosted faces as the rest of the site.

## Options considered

- **Keep the prototype's console-stub submit**: rejected. The shipped flow must actually submit and handle failure (ADR-0002 contract). The stub was replaced with the awaited, error-isolated submit.
- **Change the submitted values to the readable labels**: rejected. That breaks the wire contract the route and downstream Drive/Asana consumers expect. Readability is solved in the brief renderer instead, payload untouched.
- **Keep auto-advance on mobile**: rejected. Tapping then scrolling could advance unexpectedly. Mobile gets an explicit Continue; desktop keeps auto-advance where a click is unambiguous.
- **`icp-draft-v1` reuse**: rejected. The flow structure changed from `step` (0-5) to micro-screen `idx`, so a fresh `v2` key avoids restoring an incompatible index; a one-time data-only migration preserves an in-progress owner's answers across the cutover.
- **Mount the prototype HTML / keep two preset copies**: rejected per the brief. `src/data/icp-flow.js` + `src/data/icp-presets/` are the sole production sources of truth; the `ICP-Redesign/presets/` and `icp-presets.js` duplicates were deleted (they were byte-identical to `src/data/icp-presets/`). The remaining `ICP-Redesign/` prototype files are untracked and never ship.

## Consequences

- **Enables:** A calmer, faster intake. One decision per screen, trade presets as tappable sentences, auto-advance on choices, an honest "N% done, ~M min left," and a final review the owner can edit without going back screen by screen. The Drive file and Asana brief now read in plain English.
- **Constrains:** A larger client component (`ICPFlow.jsx`), though `/icp` still prerenders static (the restore reads localStorage in an effect, not during render). The flow config and the review-row map both enumerate the field set; adding a field means touching `icp-flow.js`, the review map, and (if option-based) `formatICP`.
- **Gated:** Per the brief, the old `ICPForm.jsx` is **kept in the tree (now unimported) until a full end-to-end test passes on a deploy** including a real submit that verifies the Drive file and Asana project. That real submit needs live credentials, which are only present on Vercel (and the preview sits behind Vercel Authentication), so it is the one check not runnable locally. Once green, `ICPForm.jsx` and the old `icp-draft-v1` path are removed.

## Verification (2026-07-03)

`next build` passes; `/icp` still prerenders static; no dangling references. Driven through real Chrome against a local production build (`next start`):

- **Desktop flow, 25/25:** progress header (% + min + Autosaved), chapter intro, Enter-to-advance, pair/short/single/dual/multi/long screens, single-choice auto-advance + undo toast + Undo-restores, dual auto-advance when both picked, autosave `icp-draft-v2 {data,idx,savedAt}`, roofing preset long-chips insert, geo-suggest from service area, "Not sure yet" skip, restore-into-correct-screen after refresh, review readable labels, edit-in-place, and the **submit POST body preserving the exact wire contract** (slugs for ranges, arrays for multi, no dead B2B fields), success screen, draft cleared.
- **Mobile 375px, 10/10:** sidebar collapses to the bottom sheet, single-choice shows Continue and **auto-advance does not fire** on tap, 44px+ touch targets, no horizontal overflow on question/long/review, the long-screen textarea reaches above the keyboard fold on focus, and the long email value no longer clips on the review card.
- **Lighthouse mobile (`/icp`, local prod build):** Performance 98, Accessibility 93, Best Practices 100, SEO 100 (FCP 0.8s, LCP 2.5s, CLS 0, TBT 0ms). Added a `main` landmark. The remaining accessibility item is color-contrast on the design's intentionally muted secondary text (matches the skinned reference).

## References

- Prototype: `ICP-Redesign/` (`icp-screens.js` flow source, `ICP Flow Surge.dc.html` skin) — untracked, not shipped.
- Production: `src/data/icp-flow.js`, `src/components/surge/ICPFlow.jsx`, `src/routes/ICPPage.jsx`, `src/app/api/submit-icp/route.js`, `src/app/layout.jsx`.
- Builds on ADR-0002 (autosave + awaited submit), ADR-0003 (presets), ADR-0004 (home-services refit).
