# ADR 0007: Onboarding call booking page reads both team calendars

Date: 2026-11-19
Status: Accepted

## Context

The welcome email (surge-hq, fulfillment step ONB-06) has a "Pick a time" button for the onboarding call. Sam and Mario decided on Nov 18 (fulfillment decision D-03) that this is a small booking page on the onboarding site that reads both of their calendars. The discovery call on thesurgeagency.com books through a GoHighLevel calendar, which is for leads, not paying clients, so this is a separate build (finding F-07).

## Decision

- `/book` is the page. `/book?c=<client-slug>&company=<Business name>` prefills the business name and tags the booking with the client.
- `GET /api/booking/availability` returns every start time when all team calendars are free. Defaults: one hour, weekdays, 9:00 to 16:00 Pacific, a start each hour, 15 minutes kept clear around other meetings, 24 hours notice, 21 days ahead. All of it is set by `BOOKING_*` environment variables (see `src/lib/booking-slots.js`).
- `POST /api/booking/book` checks the time again, writes the event onto each team calendar, and emails the client a confirmation with a calendar file, with Sam and Mario on cc.
- Google access is the service account the site already uses for Drive (`GOOGLE_SERVICE_ACCOUNT_JSON`). Each team calendar is shared with it with "Make changes to events".
- A service account cannot send Google invitations to guests without domain-wide delegation. We did not want that much access, so the event is written straight onto each team calendar with no guests and the client gets our own email instead.
- If a calendar cannot be read, no times are offered at all. If no calendar accepts the event, the booking is not confirmed. Both rules exist to prevent double bookings.
- `GET /api/booking/availability?check=1` is the setup check: which calendars can be read and written, and the account to share them with.

## Consequences

- The client is not a guest on the Google event. Rescheduling is by reply, not a Google button.
- The page is public and has no login. A hidden field stops simple bots and only offered times can be booked, but there is no rate limit yet.
- The booking is not written back to the Surge HQ board. HQ's calendar sync picks the event up as a meeting. Marking the "Onboarding call booked and held" card is still done by a person.
- Slot logic has tests: `npm test`.

## Update, 2026-11-19: host mode

Sam's first test booking showed two problems with the decision above: Google will not create a Meet room for the service account, and without a Meet room made by one of us, Meet note taking is not dependable. Sam chose to grant the wider access.

- `BOOKING_HOST` (for example sam@thesurgeagency.com) turns on host mode. The service account acts as that person through Workspace domain-wide delegation, limited to two scopes: `calendar.events` and `calendar.freebusy`.
- The call is one real Google event on the host's calendar with its own Meet room. The other team members and the client are guests and Google sends the invitation, so the client can accept, decline and propose a new time the normal way.
- Free/busy for both team calendars is read as the host, so individual calendar sharing is no longer needed in this mode.
- Our branded confirmation still goes to the client, without the calendar file, since Google's invite covers it.
- If Google refuses host mode, the booking falls back to the shared-calendar method above with the standing room in `BOOKING_MEET_LINK`.
- Trade-off accepted: with this delegation the service account key could read and change calendar events for anyone in the Workspace. It cannot reach mail, Drive or anything else. The key lives only in Vercel.
