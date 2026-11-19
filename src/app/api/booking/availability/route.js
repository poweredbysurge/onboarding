// GET /api/booking/availability
//   Open onboarding call times: every time both team calendars are free.
//   -> { days: [{ date, slots: [iso] }], minutes, timezone }
// GET /api/booking/availability?check=1
//   Setup check: which calendars this site can read and write, and the account to share them with.

import { bookingConfig, openDays } from '@/lib/booking-slots';
import { busyBlocks, calendarAccess, serviceAccountEmail } from '@/lib/booking-google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const cfg = bookingConfig();
  const check = new URL(request.url).searchParams.get('check');

  try {
    if (check) {
      return Response.json({
        share_calendars_with: serviceAccountEmail(),
        calendars: await calendarAccess(cfg.calendars),
        settings: { minutes: cfg.minutes, hours: `${cfg.startHour}:00 to ${cfg.endHour}:00 ${cfg.timezone}`, notice_hours: cfg.noticeHours, days_ahead: cfg.horizonDays, video_link: process.env.BOOKING_MEET_LINK ? 'set' : 'missing' },
      });
    }

    const now = new Date();
    const until = new Date(now.getTime() + (cfg.horizonDays + 2) * 86_400_000);
    const { busy, unreadable } = await busyBlocks(cfg.calendars, now.toISOString(), until.toISOString());
    if (unreadable.length) {
      // Never offer a time while a calendar is unreadable: that is how double bookings happen.
      console.error('booking: cannot read calendars', unreadable);
      return Response.json({ error: 'calendar_unavailable', days: [] }, { status: 503 });
    }
    return Response.json(
      { days: openDays(cfg, busy, now), minutes: cfg.minutes, timezone: cfg.timezone },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('booking availability error:', err?.message || err);
    return Response.json({ error: 'calendar_unavailable', days: [] }, { status: 503 });
  }
}
