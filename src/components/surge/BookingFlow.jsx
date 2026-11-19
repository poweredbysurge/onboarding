'use client';

// Onboarding call booking page (fulfillment ONB-09). The welcome email's "Pick a time" button
// lands here. Shows every time both Sam and Mario are free, in the visitor's own time zone.
// Link format: /book?c=<client-slug>&company=<Business name>  (both optional).

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarCheck, Check, Clock, Video } from 'lucide-react';

const GRID = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
  backgroundSize: '44px 44px',
  maskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, #000 30%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, #000 30%, transparent 75%)',
};

const COVER = [
  'Your goals and what a good month looks like',
  'Who your best customers are',
  'Account access, photos and anything we still need',
];

const ERRORS = {
  slot_taken: 'That time was just taken. Pick another one.',
  slot_not_offered: 'That time is no longer open. Pick another one.',
  invalid_email: 'That email does not look right. Check it and try again.',
  missing_fields: 'Fill in your name, email and business name.',
  calendar_unavailable: 'We could not reach the calendar. Try again in a minute, or reply to your welcome email and we will book it for you.',
};

function dayParts(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    long: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const localDateKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function BookingFlow() {
  const params = useSearchParams();
  const client = params.get('c') || '';

  const [status, setStatus] = useState('loading'); // loading | ready | down
  const [slots, setSlots] = useState([]);
  const [minutes, setMinutes] = useState(60);
  const [day, setDay] = useState(null);
  const [start, setStart] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', company: params.get('company') || '', notes: '', website: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const zone = useMemo(() => {
    try {
      const short = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
      return short || Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch { return 'your time'; }
  }, []);

  const load = async () => {
    try {
      const res = await fetch('/api/booking/availability', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'down');
      const all = (data.days || []).flatMap((d) => d.slots);
      setSlots(all);
      setMinutes(data.minutes || 60);
      setStatus('ready');
      return all;
    } catch {
      setStatus('down');
      return [];
    }
  };

  useEffect(() => { load(); }, []);

  // Group by the visitor's own calendar day, so a late Pacific time shows on the right day back east.
  const days = useMemo(() => {
    const map = new Map();
    for (const iso of slots) {
      const key = localDateKey(iso);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(iso);
    }
    return [...map.entries()].map(([date, times]) => ({ date, times }));
  }, [slots]);

  useEffect(() => {
    if (days.length && !days.some((d) => d.date === day)) setDay(days[0].date);
  }, [days, day]);

  const times = days.find((d) => d.date === day)?.times || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/booking/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, start, client }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(ERRORS[data.error] || ERRORS.calendar_unavailable);
        if (data.error === 'slot_taken' || data.error === 'slot_not_offered') { setStart(null); await load(); }
        return;
      }
      setDone(data);
    } catch {
      setError(ERRORS.calendar_unavailable);
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white placeholder-white/30 outline-none focus:border-surge-green transition-colors';
  const label = 'block text-white/60 mb-2';
  const eyebrow = 'text-surge-green uppercase tracking-[0.22em]';

  return (
    <main className="relative bg-surge-bg min-h-screen text-surge-text overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={GRID} />

      <div className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-8 pb-16">
        <a href="https://thesurgeagency.com" aria-label="The Surge Agency">
          <img src="/brand/surge-wordmark-green.svg" alt="Surge" className="h-7 w-auto" />
        </a>

        <div className="mt-10 sm:mt-14 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          {/* What this is */}
          <section className="min-w-0">
            <div className={eyebrow} style={{ fontSize: 12, fontFamily: 'var(--font-mono), monospace' }}>Step 3 of 5 · Onboarding call</div>
            <h1 className="font-display text-white mt-3 tracking-wide" style={{ fontSize: 'clamp(46px, 7vw, 68px)', lineHeight: 0.95 }}>
              Pick a time that works
            </h1>
            <p className="mt-5 text-white/65 max-w-md">
              One call with Sam and Mario to get everything lined up before we start building.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-white/80">
                <Clock size={16} className="text-surge-green" /> {minutes} minutes
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-white/80">
                <Video size={16} className="text-surge-green" /> Video call
              </span>
            </div>

            <div className="mt-8 hidden lg:block">
              <div className="text-white/45 mb-3">What we cover</div>
              <ul className="space-y-3">
                {COVER.map((c) => (
                  <li key={c} className="flex items-start gap-3 text-white/80">
                    <span className="mt-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-surge-green/15">
                      <Check size={13} className="text-surge-green" strokeWidth={3} />
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* The picker */}
          <section className="min-w-0 self-start rounded-3xl border border-white/10 bg-surge-card p-5 sm:p-8">
            {done ? (
              <div className="py-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surge-green">
                  <CalendarCheck size={30} className="text-surge-bg" />
                </div>
                <h2 className="font-display text-white mt-6 tracking-wide" style={{ fontSize: 44, lineHeight: 1 }}>You're booked</h2>
                <p className="mt-4 text-xl text-white font-semibold">{dayParts(localDateKey(done.start)).long}</p>
                <p className="text-white/70">{timeLabel(done.start)} {zone}, {minutes} minutes</p>
                {done.meetLink && (
                  <a href={done.meetLink} className="cta-fill mt-7 inline-flex items-center gap-2 rounded-full border border-surge-green px-6 py-3 font-bold text-surge-green">
                    <Video size={18} /> Video call link
                  </a>
                )}
                <p className="mt-7 text-white/55 max-w-sm mx-auto">
                  {done.emailed
                    ? `We sent the details and a calendar file to ${form.email}.`
                    : 'We have it on our calendar. Sam or Mario will email you the details.'}
                </p>
              </div>
            ) : status === 'loading' ? (
              <div className="py-16 text-center text-white/50">Checking the calendar...</div>
            ) : status === 'down' || !days.length ? (
              <div className="py-10 text-center">
                <h2 className="font-display text-white tracking-wide" style={{ fontSize: 36, lineHeight: 1 }}>
                  {status === 'down' ? 'The calendar is not loading' : 'No open times right now'}
                </h2>
                <p className="mt-4 text-white/65 max-w-sm mx-auto">
                  Reply to your welcome email with a few times that work and we will book it for you.
                </p>
                <a href="mailto:sam@thesurgeagency.com?subject=Onboarding%20call%20times" className="cta-fill mt-7 inline-flex rounded-full border border-surge-green px-6 py-3 font-bold text-surge-green">
                  Email Sam and Mario
                </a>
              </div>
            ) : !start ? (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-xl font-bold text-white">Choose a day</h2>
                  <span className="text-white/45">Times in {zone}</span>
                </div>

                <div className="mt-4 -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-3" role="tablist" aria-label="Days with open times">
                  {days.map((d) => {
                    const p = dayParts(d.date);
                    const on = d.date === day;
                    return (
                      <button
                        key={d.date} type="button" role="tab" aria-selected={on} onClick={() => setDay(d.date)}
                        className={`flex-none w-[76px] rounded-2xl border px-2 py-3 text-center transition-colors ${on ? 'border-surge-green bg-surge-green text-surge-bg' : 'border-white/10 bg-white/[0.03] text-white hover:border-white/30'}`}
                      >
                        <div className={on ? 'text-surge-bg/70' : 'text-white/50'}>{p.weekday}</div>
                        <div className="text-2xl font-extrabold leading-tight">{p.day}</div>
                        <div className={on ? 'text-surge-bg/70' : 'text-white/50'}>{p.month}</div>
                      </button>
                    );
                  })}
                </div>

                <h2 className="mt-6 text-xl font-bold text-white">{day ? dayParts(day).long : 'Choose a time'}</h2>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {times.map((iso) => (
                    <button
                      key={iso} type="button" onClick={() => { setStart(iso); setError(null); }}
                      className="rounded-xl border border-white/10 bg-white/[0.03] py-3.5 font-bold text-white transition-colors hover:border-surge-green hover:text-surge-green"
                    >
                      {timeLabel(iso)}
                    </button>
                  ))}
                </div>
                {error && <p className="mt-5 text-[#ff8a8a]" role="alert">{error}</p>}
              </>
            ) : (
              <form onSubmit={submit} noValidate>
                <button type="button" onClick={() => { setStart(null); setError(null); }} className="inline-flex items-center gap-2 text-white/55 hover:text-white transition-colors">
                  <ArrowLeft size={16} /> Change time
                </button>

                <div className="mt-4 rounded-2xl border border-surge-green/30 bg-surge-green/[0.07] px-5 py-4">
                  <div className="text-lg font-bold text-white">{dayParts(localDateKey(start)).long}</div>
                  <div className="text-white/75">{timeLabel(start)} {zone}, {minutes} minutes</div>
                </div>

                <div className="mt-6 space-y-4">
                  <div>
                    <label className={label} htmlFor="bk-name">Your name</label>
                    <input id="bk-name" className={input} value={form.name} onChange={set('name')} autoComplete="name" required />
                  </div>
                  <div>
                    <label className={label} htmlFor="bk-email">Email</label>
                    <input id="bk-email" type="email" inputMode="email" className={input} value={form.email} onChange={set('email')} autoComplete="email" required />
                  </div>
                  <div>
                    <label className={label} htmlFor="bk-company">Business name</label>
                    <input id="bk-company" className={input} value={form.company} onChange={set('company')} autoComplete="organization" required />
                  </div>
                  <div>
                    <label className={label} htmlFor="bk-notes">Anything you want us to know first? (optional)</label>
                    <textarea id="bk-notes" rows={3} className={input} value={form.notes} onChange={set('notes')} />
                  </div>
                  {/* Hidden from people; bots fill it in and get ignored. */}
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} className="hidden" aria-hidden="true" />
                </div>

                {error && <p className="mt-5 text-[#ff8a8a]" role="alert">{error}</p>}

                <button
                  type="submit"
                  disabled={sending || !form.name.trim() || !form.email.trim() || !form.company.trim()}
                  className="mt-6 w-full rounded-full bg-surge-green py-4 text-lg font-extrabold text-surge-bg transition-opacity disabled:opacity-40"
                >
                  {sending ? 'Booking...' : 'Book the call'}
                </button>
              </form>
            )}
          </section>
        </div>

        <p className="mt-10 text-white/40">
          Need help? Email <a className="text-white/70 underline underline-offset-4" href="mailto:sam@thesurgeagency.com">sam@thesurgeagency.com</a>.
        </p>
      </div>
    </main>
  );
}
