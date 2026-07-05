# ADR-0006: ICP Claude Assist (Phase 3)

**Status:** Accepted
**Date:** 2026-07-04
**Decider:** Sam Delgado
**Implementation status:** Code complete, verified end-to-end against live Claude on the preview deploy. Gated on `ANTHROPIC_API_KEY` being present in the Production environment.
**Repo scope:** onboarding (onboarding.thesurgeagency.com)

## Context

Phase 1 stopped owners from losing progress, Phase 2 seeded the long-text fields with industry presets, and the redesign (ADR-0005) turned the whole thing into a one-question-per-screen flow with a reserved-but-disabled "AI assist" slot. Phase 3 (ICP form improvements spec, 2026-07-03) turns that slot on: Claude helps an owner *fill the form from their own inputs*, in two places. It is explicitly not a conversational "AI interview" (the spec rejected that as an unproven pattern to ship right before a lead-gen push).

## Decision

**One route, `src/app/api/icp-assist/route.js`, model `claude-sonnet-5`** (the spec names Sonnet; this is the deliberate exception to the house default of Opus). Uses `@anthropic-ai/sdk`. Two POST modes:

**1. `website` — "Pull my info from my site".** A new optional Step 1 micro-screen (`kind: 'website'`, skippable) holds a URL field + button. The route normalizes the URL, fetches the homepage and `/about` (1 hop, 10s abort, HTML/text only, stripped to text and capped at 6k chars/page), and asks Claude (structured outputs, `output_config.format`) to extract `companyName`, `industry` (constrained to the seven chip labels or empty), `businessLocation`, `markets`, `businessModel` (Homeowners/Commercial/Both or empty), and first-person drafts of `idealClientDescription` + `bestClientDescription`. Only non-empty fields are returned. The client applies them to the form and flags each with a **"drafted from your site, please check"** badge that clears the moment the owner edits that field. A busy owner pastes one URL and half of steps 1-2 populate.

**2. `field` — "Help me write this".** A button under each long-text textarea sends the field, its question label + hint, the industry, the company context from Step 1, and whatever rough words the owner has typed. Claude returns **2-3 short candidate answers** (structured outputs) rendered as tap-to-insert chips, using the same insert/remove mechanics as the Phase 2 preset chips. Prompt: first person as the owner, plain contractor language, 2-3 sentences, no marketing fluff, no em-dashes.

**Model call shape.** `thinking: {type: 'disabled'}` (Sonnet 5 runs adaptive thinking by default; disabling it keeps latency low and the output inside the token cap), `temperature` omitted (Sonnet 5 rejects non-default sampling params), `max_tokens` 1024 for the website extraction (it returns seven fields) and 400 for field drafts (the spec's cap, right-sized for 2-3 short answers). Structured outputs guarantee parseable JSON so the client never has to cope with prose.

**Guardrails (spec).**
- **Rate limit:** 10 calls per IP per hour, best-effort in-memory (module-scope Map, pruned per window). Per-lambda-instance, which the spec explicitly allows as the simplest option; a shared store (Vercel KV) is the upgrade path if abuse shows up.
- **No form content logged.** The route passes the owner's text to Claude, returns the result, and drops it. Only the failure *class* (`err.status`/`err.name`) is ever logged, never the body or the model output.
- **Never blocks the form.** Every failure path returns a non-2xx and the client shows "couldn't draft that just now" while the field stays fully manual. A missing `ANTHROPIC_API_KEY` returns 503, so the form works identically with the assist simply inert.

**Payload.** `companyWebsite` is added to `INITIAL`, the review screen, and the Drive/Asana brief. The submitted payload gains that one string; nothing else in the wire contract changes.

## Options considered

- **Model: Opus 4.8 (house default) vs Sonnet 5:** the spec pins Sonnet, and these are short extraction/drafting calls where Sonnet is the right cost/latency tier. Used `claude-sonnet-5`.
- **Thinking on vs off:** off. Adaptive thinking would eat the small `max_tokens` budget and add latency for no quality gain on these bounded tasks. Structured outputs plus a clear system prompt carry the quality.
- **Conversational assistant:** rejected by spec and on principle. The assist fills the existing form; it does not replace it with a chat.
- **Auto-fill without review vs badges:** badges. AI-filled fields are flagged and self-clear on edit, so the owner always knows what to double-check and authorship stays theirs (same principle as the Phase 2 presets: assist, never assume).
- **Rate-limit store:** in-memory over Vercel KV for now — the spec's "simplest option," no new infra, and per-instance limiting is enough at current volume.
- **Reserved sidebar slot:** the disabled "Draft it for me" button was removed; on long screens the sidebar now carries a live pointer to the real "Help me write this" button in the answer panel (where the result chips land), avoiding two buttons for one action.

## Consequences

- **Enables:** The single biggest completion lever in the spec. One URL fills company basics + first-draft paragraphs; a stuck owner taps a button and gets three trade-specific starting points instead of staring at a blank box. The team also now captures the client's website at intake.
- **Constrains:** Live assist needs `ANTHROPIC_API_KEY` in the onboarding Vercel project (present on Preview, verified; must also be set for Production for the live domain). Cost is single-digit cents for a heavy session (~15 short Sonnet calls). The in-memory rate limit is best-effort; a determined abuser hitting different lambda instances could exceed 10/hour. External fetches are homepage + /about only, capped and time-boxed.
- **No breaking change:** `submit-icp` and the redesign flow are otherwise untouched; `/icp` still prerenders static; the form degrades to exactly the ADR-0005 experience whenever the assist is unavailable.

## Verification (2026-07-04)

`next build` passes; `/api/icp-assist` registered; `/icp` still static.

Local prod build in Chrome with the assist route **mocked** (no local key):
- **Phase 3, 14/14:** website screen renders; "Pull my info from my site" applies the returned fields to form data, shows the success summary, and flags each field with the badge; the badge clears when the field is edited; prefilled values appear on their downstream screens; "Help me write this" returns draft chips that insert on tap; both failure paths (website unreadable, field draft failed) show the graceful message and leave the field manual.
- **Submit regression, 3/3:** the review screen shows the Website row, the submit payload carries `companyWebsite`, and the contract is otherwise intact.

**Real Claude, on the preview deploy** (which carries the key; driven with the Vercel Protection Bypass):
- `field` mode returned three first-person, roofing-specific candidates (storm damage, insurance, storm chasers, DFW), no em-dashes.
- `website` mode fetched a real site, extracted company name + location, and drafted first-person ideal/best-client paragraphs; inapplicable fields correctly came back empty (only non-empty fields surfaced). Bad URL and bad mode both return 400.

## References

- Spec: `workspace/operations/icp-form-improvements-spec.md` (Phase 3, 2026-07-03)
- Builds on ADR-0002 (autosave + awaited submit), ADR-0003 (presets), ADR-0004 (home-services refit), ADR-0005 (micro-screen redesign)
- Route: `src/app/api/icp-assist/route.js`; flow config: `src/data/icp-flow.js`; component: `src/components/surge/ICPFlow.jsx`
