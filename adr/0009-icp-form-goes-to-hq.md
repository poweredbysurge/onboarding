# ADR 0009: The ICP form hands its answers to HQ

Date: 2026-11-23
Status: Accepted

## Context

`/api/submit-icp` created a client folder at the top of the Surge shared drive and an Asana project. Both are wrong now. Since Nov 18 client folders live in `Clients/<Client>/` and are built by Surge HQ when the client pays, so the form was making a second, misplaced folder. Asana was retired in Nov 2026. This is fulfillment step ONB-07.

## Decision

- The route no longer touches Drive or Asana. It builds one markdown document from the answers (`src/lib/icp-doc.js`) and calls `public.hq_intake_icp` in Surge HQ with the same intake secret the access page uses.
- HQ saves the document as a Google Doc in the client's Documents folder, completes their "ICP form filled in" card with a link, and posts in their Slack channel.
- The client is identified by `?c=<slug>` on the link, which the welcome email adds. Without it the slug is made from the company name they type.
- If HQ cannot take the form (not connected, or a client HQ does not know), the full answers are emailed to Sam and Mario with a note to save them by hand. If that fails too, the client sees a retry and their draft is kept.
- `?company=<name>` on the link fills in the first answer.

## Consequences

- `ASANA_PAT` and `GOOGLE_DRIVE_FOLDER_ID` are no longer read by this route. `GOOGLE_SERVICE_ACCOUNT_JSON` is still used by the booking page.
- A lead who fills in the form before paying is not in HQ yet, so their answers arrive by email, not in a folder.
- The document and file names use a hyphen, not an em dash.
