# ADR-0003: ICP Form Smart Start, Industry Preset Packs

**Status:** Accepted
**Date:** 2026-07-03
**Decider:** Sam Delgado
**Implementation status:** Code complete, verified against a local production build in Chrome; gated on preview deploy
**Repo scope:** onboarding (onboarding.thesurgeagency.com)

## Context

Phase 1 (ADR-0002) stopped owners from losing progress. It did not make the form any faster to fill. The long-text fields are the ones owners stall on: "describe your ideal client," "biggest challenges," "what keeps your best clients loyal." A roofer knows the answers cold but freezes at a blank textarea.

This is Phase 2 of the ICP form improvements spec (`workspace/operations/icp-form-improvements-spec.md`, 2026-07-03): a "Smart Start" that seeds those fields with industry-specific, owner-language starting points. No API, instant, near-zero cost. Phase 3 (Claude assist) is separate and not built here.

**Source-material gap, resolved deliberately.** The spec names the surge-market-intelligence analyzer outputs (pain points, emotional drivers, hooks per trade) as the primary source for the preset copy. As of this ADR that repo has **no committed analyzer outputs**: `outputs/` holds only a `.gitkeep`, `config/niches.json` defines just two niches (only `home_services_marketing` is active), and nothing per-trade has been generated. So the copy here is written from home-services domain knowledge and what we know from the three live clients (HomeSource, Sunrise = landscaping, Valiant = remodeling), in owner voice, no em-dashes (house rule). It is a strong first pass, not the analyzer's output. When the analyzer actually runs per trade, the packs are one editable JSON file each and should be refreshed against real signal.

## Decision

**1. Industry becomes a chip select + "Other."** Step 1's free-text "Industry / Vertical" input is replaced by a chip select: Roofing, HVAC, Plumbing, Electrical, Landscaping/Outdoor, Solar, Remodeling/Exterior, plus "Other." Selecting a chip stores its **label** in `data.industry`; "Other" reveals a free-text input and stores whatever they type. **The submit payload is unchanged** (`industry` is still a plain string), so `submit-icp` and the ICP text file need no change. The chip label doubles as the key into the preset packs.

**2. Static per-industry preset packs.** `src/data/icp-presets/{trade}.json`, one per trade, imported through `src/data/icp-presets/index.js`. Each pack holds, for the long-text fields, 3-4 tap-to-insert suggestion strings in owner language (for example roofing `biggestChallenges`: "Storm season is feast or famine, then it goes quiet for months"). Fields covered: idealClientDescription, buyerTitles, biggestChallenges, currentWorkarounds, successDefinition, goalBlockers, howTheyResearch, decisionMakers, commonObjections, bestClientDescription, clientLoyaltyDrivers, vendorValues, desiredFeelings. Each pack also carries pre-suggested option values for the three multi-selects: researchChannels, evaluationCriteria, howTheyFoundYou.

**3. Tap-to-insert, then edit.** A `SuggestionChips` block renders under each long-text field, labelled "Tap to start from one of these," using the existing CheckboxGroup visual language. Tapping appends the phrase to whatever is already in the field (`insertSuggestion` joins sentences cleanly and is idempotent per phrase, so a double-tap does not duplicate). The owner then edits freely. Nothing is auto-filled.

**4. Suggested multi-select options are highlighted, not checked.** `CheckboxGroup` gained a `suggested` prop. Suggested-but-unchecked options get a subtle green ring and dot plus a one-line "Common for your industry, tap the ones that fit." Nothing is pre-selected, so the owner's real answers are never assumed.

**5. Graceful when there is no pack.** `presetFor(data.industry)` returns the pack for a known label or `null` for "Other" / free-text. With `null`, no suggestion chips and no highlights render and the form is exactly the Phase 1 form. Preset lookup keys off `data.industry`, which the autosave already persists, so presets survive a refresh with the rest of the draft.

## Options considered

- **Wait for the analyzer outputs before writing any copy**: rejected. The mechanism (chips, insert, highlight) is independent of the copy, and shipping a grounded first pass now beats blocking Phase 2 on a pipeline that has not produced trade outputs yet. The JSON-per-trade layout makes a later refresh cheap.
- **Keep industry as free text and infer the pack with fuzzy matching**: rejected. Fragile ("Residential Roofing" vs "Roofing" vs "roofer") and invisible to the owner. An explicit chip is unambiguous, is the pack key, and still allows "Other."
- **Auto-fill the fields from the pack instead of tap-to-insert**: rejected by spec and on principle. These answers must be the owner's; presets are a starting point, not a default. Highlight-don't-check and insert-then-edit keep authorship with the owner.
- **Pre-check the suggested multi-select options**: rejected. The spec is explicit ("highlighted, not pre-checked"), and a pre-checked box silently fabricates an answer.
- **One big presets object inline in the component**: rejected in favor of one JSON file per trade so Sam (copy lead) can edit a single trade's language without touching component code, and so the eventual analyzer refresh is a clean file swap.

## Consequences

- **Enables:** An owner who picks their trade sees their own world reflected back: their storm-season cash flow, their door-knocker competitors, their "I've been burned before" objection. The blank-textarea stall is replaced by tap, edit, move on. The three multi-selects steer toward the channels/criteria that actually matter for the trade without deciding for them.
- **Constrains:** Preset copy quality is only as good as this first pass until the analyzer feeds it. Coverage is the seven listed trades; anything else is "Other" with a fully manual form (no regression, just no assist). Adding a trade means adding a JSON file and an entry in `INDUSTRY_OPTIONS`.
- **No server / payload change:** `industry` stays a string; `submit-icp`, the Drive text file, and the Asana brief are untouched. No new dependencies (JSON is imported natively). `/icp` still prerenders static.
- **Design:** Additive. Existing Tailwind tokens and layout are untouched; suggestion chips and the suggested-option ring reuse the surge-green language already in the form. No em-dashes in any preset copy.

## Verification (2026-07-03)

`next build` passes; `/icp` still prerenders as static. Driven through real Chrome against a local production build:

Phase 2 (10/10):
- Industry chips select; "Other" reveals a free-text input; the chosen label persists to the draft as a plain string ("Roofing").
- Step 2 shows "Tap to start from one of these" and the roofing `idealClientDescription` chips; tapping a chip inserts its text into the textarea; re-tapping the same chip is idempotent (no duplicate).
- Step 4 shows the "Common for your industry" suggested-option hint for the selected trade.
- Picking "Other" with a custom industry shows no preset chips (form stays fully manual).

Phase 1 regression (10/10): autosave, restore banner, step restore, restored field values, Start over, submit success, and draft-clear-on-submit all still pass after the industry field changed from a text input to a chip select.

## References

- Spec: `workspace/operations/icp-form-improvements-spec.md` (Phase 2, 2026-07-03)
- ADR-0002: Phase 1 (autosave + awaited submit) this builds on
- Preset packs: `src/data/icp-presets/*.json`, index `src/data/icp-presets/index.js`
- Source-material dependency: `repos/surge-market-intelligence` (analyzer outputs not yet generated as of this ADR)
