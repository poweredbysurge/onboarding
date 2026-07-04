# ADR-0004: ICP Form Refit to Home Services, Cut B2B Fields, Add Business Location

**Status:** Accepted
**Date:** 2026-07-03
**Decider:** Sam Delgado
**Implementation status:** Code complete, verified against a local production build in Chrome; folded into the Phase 2 branch/PR, gated on preview deploy
**Repo scope:** onboarding (onboarding.thesurgeagency.com)

## Context

The ICP form is for The Surge Agency's home-services clients (roofers, HVAC, plumbers, remodelers), who almost all serve homeowners (B2C). The form it was cloned from carried generic B2B-sale questions that do not fit that owner and actively distract: "Typical Client Company Size (11-50 employees)", "Buyer Job Titles / Roles (VP of Operations, Facilities Director)", "Client's Business Model (B2B/B2C)". A roofer filling this out has to mentally translate or skip them, which lowers completion quality on the fields that actually matter.

Separately, the form never captured a clean, structured location up front. "Markets Served" was a single free-text field, and there was no business physical location at all. That location is exactly what downstream keyword research and local SEO need, so collecting it at intake avoids re-researching it later.

This is a same-session refit requested after Phase 2 was built but before it merged, so it is folded into the Phase 2 branch (`phase2-icp-industry-presets`, PR #2) rather than stacked as a separate change, since it edits the same Step 1/Step 2 fields and the same preset packs.

## Decision

**Cut the B2B fields that do not fit a home-services owner.** Removed from the form and from `INITIAL`:
- `clientCompanySize` (Typical Client Company Size) — pure B2B.
- `clientRevenue` (Typical Client Annual Revenue / Budget) — B2B framing; job value is already captured by `avgContractValue` in Step 5.
- `clientModel` (Client's Business Model B2B/B2C/Consumer) — redundant.
- `buyerTitles` (Buyer Job Titles / Roles) — B2B org-chart language; Step 4's `decisionMakers` ("Who's involved in the buying decision") covers the same ground in plain language. Its Phase 2 preset entry was removed from all seven packs.
- `clientIndustry` (Client's Industry or Business Type) — answer is almost always "homeowners"; folded into the single reframed audience field below.
- `companyStage` (Startup / Growing / Established / Enterprise) — SaaS-flavored; team size + annual revenue already convey scale.

**Reframe `businessModel` into one home-services-native audience field.** Step 1's "Business Model (B2B/B2C/Both)" becomes "Who Do You Serve?" with options Homeowners / Businesses (Commercial) / Both. This single field replaces the cluster of cut audience questions. The field key `businessModel` is kept (only the label and option values change) to minimize schema churn; the ICP text file now prints it as "Who They Serve."

**Add a structured Business Location and rename Markets Served to Service Area.** Step 1 gains `businessLocation` (their shop/office, city+state or a full address) and relabels `markets` to "Service Area" (the cities/regions they take jobs in). The two are distinct on purpose: the physical base anchors local SEO / Google Business Profile, the service area drives geo-targeting and keyword research.

**Auto-suggest Client Geography from those fields.** Step 2 keeps `clientGeography` but adds a tap-to-insert suggestion built from Step 1 (`geoSuggestions` = service area first, then business location, de-duped), reusing the Phase 2 `SuggestionChips` component with a "Suggested from your service area" label. It is a suggestion the owner taps, not a forced auto-fill, so their answer stays theirs. Net Step 2 is now just two fields: describe your ideal client, and geography.

**Server contract updated to match.** `formatICP` and `buildClientBrief` in `submit-icp/route.js` drop the cut fields, add Business Location / Service Area / Who They Serve, and relabel accordingly. The payload is still a flat string map; no route logic or error-isolation changed.

## Options considered

- **Keep the B2B fields but hide them for B2C**: rejected. Conditional visibility adds state and still leaves the fields in the schema and the ICP output. The form is home-services only; the simplest correct move is to remove what does not belong.
- **Reframe `clientRevenue` to "typical job budget" instead of cutting**: considered (it was the middle option offered), rejected in favor of the full cut. `avgContractValue` already asks job value in Step 5; a second budget field is redundant and lengthens the form.
- **One combined "Business Location / Service Area" field**: rejected in favor of two. The physical base and the service radius genuinely differ (a Fort Worth shop serving all of DFW), and both are independently useful downstream (local SEO vs. geo-targeting).
- **Auto-fill `clientGeography` outright from the service area**: rejected. Same principle as the Phase 2 presets, the owner's answers are never assumed. A tap-to-insert suggestion gives the convenience without fabricating an answer.
- **Separate branch/PR for the refit**: rejected. Phase 2 is unmerged and touches the same fields and packs; a separate branch would add `buyerTitles` presets and a plain geography field only to remove/rework them. One coherent PR is cleaner.

## Consequences

- **Enables:** A home-services owner sees only questions that fit their business. Step 2 stops asking about employee headcounts and job titles and focuses on who they love working with and where. Intake now captures a clean business location + service area, so keyword research and local SEO start from real data instead of a later research pass.
- **Constrains:** Old drafts (`icp-draft-v1`) saved before this change may carry the removed keys; they are harmless (no component reads them, and `hasContent`/restore just ignore them). Removing fields is a one-way narrowing of the ICP text file; historical submissions already written are unaffected.
- **No new dependencies, no route logic change, `/icp` still prerenders static.** Design and Tailwind tokens untouched; the geography suggestion reuses the existing chip styling. No em-dashes in any added copy.

## Verification (2026-07-03)

`next build` passes; no dangling references to the cut fields; `/icp` still prerenders static. Driven through real Chrome against a local production build:

Refit (13/13):
- Step 1 shows Business Location, Service Area, and "Who Do You Serve?" with home-services options (Homeowners / Businesses / Commercial / Both); Company Stage and the B2B "Business Model" label are gone.
- Step 2 no longer shows Typical Client Company Size, Buyer Job Titles, Client's Business Model, or Client's Industry; it keeps only the ideal-client description and geography.
- Client Geography shows "Suggested from your service area"; the suggestion chip carries the Service Area value and tapping it fills the field ("Dallas-Fort Worth metro").

Regression: Phase 1 (10/10) and Phase 2 (10/10) still pass after the schema change.

## References

- Requested by Sam mid-session, 2026-07-03 (make the ICP form home-services specific; collect business location to seed geography + keyword research)
- ADR-0002 (Phase 1), ADR-0003 (Phase 2 presets) this refit is folded into
- Component: `src/components/surge/ICPForm.jsx`; server contract: `src/app/api/submit-icp/route.js`
