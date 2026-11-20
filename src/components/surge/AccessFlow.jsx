'use client';

// Account access page (fulfillment ONB-08). The welcome email's "Start the access steps" button
// lands here. The client picks the accounts they have, then gets one screen per account showing
// exactly where to click to invite us. No passwords anywhere on this page.
// Link format: /access?c=<client-slug>&company=<Business name>&only=<groups or account keys>

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, BarChart3, Check, Copy, ExternalLink, Globe, LifeBuoy, Link2, MapPin,
  Eye, EyeOff, KeyRound, Lock, Megaphone, Search, Share2, ShieldCheck, Tags,
} from 'lucide-react';
import { GROUPS, INVITE_EMAIL, accountsFor } from '@/lib/access-accounts';

const ICONS = {
  gbp: MapPin, ga4: BarChart3, gsc: Search, gtm: Tags, google_ads: Megaphone, meta: Megaphone,
  website: Globe, domain: Link2, facebook_page: Share2,
};

const GRID = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
  backgroundSize: '44px 44px',
  maskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, #000 30%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, #000 30%, transparent 75%)',
};

const STATUS_LABEL = {
  done: 'Invite sent', shared: 'Login shared securely', requested: 'We will send the request', help: 'We will help on the call', skipped: 'Skipped for now',
};

const slugify = (s) => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function load(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}
function save(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: progress just is not kept */ }
}

export default function AccessFlow() {
  const params = useSearchParams();
  const company = params.get('company') || '';
  const client = slugify(params.get('c')) || slugify(company) || 'unknown';
  const accounts = useMemo(() => accountsFor(params.get('only')), [params]);
  const storeKey = `surge-access-${client}`;

  const [phase, setPhase] = useState('pick'); // pick | steps | done
  const [picked, setPicked] = useState([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState({}); // key -> { status, option, detail, note }
  const [option, setOption] = useState(null);
  const [detail, setDetail] = useState('');
  const [note, setNote] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fieldError, setFieldError] = useState('');
  // Password drop. Only shown when the server says 1Password is connected. What is typed here
  // lives in this screen's memory until it is sent, and is never saved on the device.
  const [dropOn, setDropOn] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [drop, setDrop] = useState({ site: '', username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);
  const [dropError, setDropError] = useState('');

  useEffect(() => {
    fetch('/api/access/secret', { cache: 'no-store' }).then((r) => r.json()).then((d) => setDropOn(Boolean(d.enabled))).catch(() => {});
  }, []);

  // Pick up where they left off on this device.
  useEffect(() => {
    const saved = load(storeKey);
    if (saved?.picked?.length) {
      const still = saved.picked.filter((k) => accounts.some((a) => a.key === k));
      setPicked(still);
      setResults(saved.results || {});
      const next = still.findIndex((k) => !saved.results?.[k]);
      if (still.length && next === -1) setPhase('done');
      else if (Object.keys(saved.results || {}).length) { setIndex(Math.max(next, 0)); setPhase('steps'); }
    }
  }, [storeKey, accounts]);

  const queue = accounts.filter((a) => picked.includes(a.key));
  const current = queue[index];
  const chosen = current?.kind === 'choose' ? current.options.find((o) => o.key === option) : null;

  const resetStep = () => { setOption(null); setDetail(''); setNote(''); setHelpOpen(false); setFieldError(''); setCopied(false); setDropOpen(false); setDrop({ site: '', username: '', password: '' }); setShowPw(false); setDropError(''); };

  const report = (payload) => {
    // Fire and forget: the page keeps its own progress, so a failed report never blocks the client.
    fetch('/api/access/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client, company, ...payload }),
    }).catch(() => {});
  };

  const finishStep = (status) => {
    const entry = { status, option: option || '', detail: detail.trim(), note: note.trim() };
    const nextResults = { ...results, [current.key]: entry };
    setResults(nextResults);
    save(storeKey, { picked, results: nextResults });
    report({ account: current.key, ...entry });
    resetStep();
    if (index + 1 < queue.length) { setIndex(index + 1); window.scrollTo({ top: 0 }); return; }
    setPhase('done');
    window.scrollTo({ top: 0 });
    report({ finish: true, items: queue.map((a) => ({ account: a.key, ...nextResults[a.key] })) });
  };

  const sendRequest = () => {
    const ask = current.ask;
    const value = detail.trim();
    if (!value) { setFieldError('Fill this in so we can send the request.'); return; }
    if (ask.pattern && !new RegExp(ask.pattern).test(value)) { setFieldError('That does not look right. It should look like ' + ask.placeholder + '.'); return; }
    finishStep('requested');
  };

  const sendDrop = async () => {
    if (dropBusy) return;
    if (!drop.username.trim() || !drop.password) { setDropError('Add the username and the password.'); return; }
    setDropBusy(true);
    setDropError('');
    try {
      const res = await fetch('/api/access/secret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, company, account: current.key, option: option || '', ...drop, note: note.trim() }),
      });
      if (!res.ok) throw new Error('failed');
      finishStep('shared');
    } catch {
      setDropError('That did not go through. Try again, or choose "I need help" and we will sort it out on the call.');
    } finally {
      setDropBusy(false);
    }
  };

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(INVITE_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* they can select it by hand */ }
  };

  const toggle = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const start = () => { save(storeKey, { picked, results }); setIndex(Math.max(queue.findIndex((a) => !results[a.key]), 0)); setPhase('steps'); window.scrollTo({ top: 0 }); };

  const eyebrow = { fontSize: 12, fontFamily: 'var(--font-mono), monospace' };
  const card = 'rounded-3xl border border-white/10 bg-surge-card p-5 sm:p-8';
  const input = 'w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white placeholder-white/30 outline-none focus:border-surge-green transition-colors';

  const EmailBox = ({ role }) => (
    <div className="rounded-2xl border border-surge-green/30 bg-surge-green/[0.07] p-4 sm:p-5">
      <div className="text-white/55">Invite this email</div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <span className="break-all text-[15px] font-bold text-white sm:text-lg">{INVITE_EMAIL}</span>
        <button type="button" onClick={copyEmail} className="inline-flex flex-none items-center gap-2 rounded-full bg-surge-green px-4 py-2 font-bold text-surge-bg">
          {copied ? <Check size={16} strokeWidth={3} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {role && <div className="mt-3 text-white/75">Role to choose: <span className="font-bold text-white">{role}</span></div>}
    </div>
  );

  const Steps = ({ steps }) => (
    <ol className="mt-5 space-y-3.5">
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-3.5">
          <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border border-surge-green/50 font-bold text-surge-green">{i + 1}</span>
          <span className="text-white/85">{s}</span>
        </li>
      ))}
    </ol>
  );

  const OpenLink = ({ link }) => link ? (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className="cta-fill mt-6 inline-flex items-center gap-2 rounded-full border border-surge-green px-5 py-3 font-bold text-surge-green">
      {link.label} <ExternalLink size={16} />
    </a>
  ) : null;

  const HelpAndSkip = () => (
    <div className="mt-4">
      {dropOpen ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2.5 font-bold text-white"><Lock size={17} className="text-surge-green" /> Share a login securely</div>
          <p className="mt-2 text-white/55">Only for accounts with no way to invite us. It goes straight into our password manager (1Password). It is not emailed, not saved on this page, and only Sam and Mario can open it.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-white/60 mb-2" htmlFor="ac-site">Where do you sign in? (optional)</label>
              <input id="ac-site" className={input} value={drop.site} onChange={(e) => setDrop({ ...drop, site: e.target.value })} placeholder="networksolutions.com" autoComplete="off" />
            </div>
            <div>
              <label className="block text-white/60 mb-2" htmlFor="ac-user">Username or email</label>
              <input id="ac-user" className={input} value={drop.username} onChange={(e) => { setDrop({ ...drop, username: e.target.value }); setDropError(''); }} autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </div>
            <div>
              <label className="block text-white/60 mb-2" htmlFor="ac-pw">Password</label>
              <div className="relative">
                <input id="ac-pw" type={showPw ? 'text' : 'password'} className={`${input} pr-12`} value={drop.password} onChange={(e) => { setDrop({ ...drop, password: e.target.value }); setDropError(''); }} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={200} />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-white/55 hover:text-white">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-white/60 mb-2" htmlFor="ac-dnote">Anything we should know? (optional)</label>
              <input id="ac-dnote" className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="It texts a code to my phone when you sign in" />
            </div>
          </div>
          {dropError && <p className="mt-3 text-[#ff8a8a]" role="alert">{dropError}</p>}
          <button type="button" onClick={sendDrop} disabled={dropBusy} className="mt-4 w-full rounded-full bg-surge-green py-3.5 font-extrabold text-surge-bg disabled:opacity-50">
            {dropBusy ? 'Sending...' : 'Send securely'}
          </button>
          <button type="button" onClick={() => { setDropOpen(false); setDrop({ site: '', username: '', password: '' }); setDropError(''); }} className="mt-3 w-full text-white/50 hover:text-white transition-colors">Cancel</button>
        </div>
      ) : helpOpen ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <label className="block text-white/60 mb-2" htmlFor="ac-note">What got in the way? (optional)</label>
          <textarea id="ac-note" rows={2} className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="I can't find the setting, I don't know the login..." />
          <p className="mt-2 text-white/45">Do not type a password here. We will sort it out with you on the call.</p>
          {dropOn && (
            <button type="button" onClick={() => { setHelpOpen(false); setDropOpen(true); }} className="mt-3 inline-flex items-center gap-2 text-surge-green hover:underline underline-offset-4">
              <KeyRound size={16} /> There is no way to invite you. Share the login securely instead
            </button>
          )}
          <button type="button" onClick={() => finishStep('help')} className="mt-3 w-full rounded-full border border-white/25 py-3 font-bold text-white hover:border-white/60 transition-colors">
            Send and go to the next one
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-2 text-white/65 hover:text-white transition-colors">
            <LifeBuoy size={16} /> I need help with this one
          </button>
          <button type="button" onClick={() => finishStep('skipped')} className="text-white/45 hover:text-white transition-colors">Skip for now</button>
        </div>
      )}
    </div>
  );

  return (
    <main className="relative bg-surge-bg min-h-screen text-surge-text overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={GRID} />
      <div className="relative mx-auto max-w-3xl px-5 sm:px-8 pt-8 pb-16">
        <a href="https://thesurgeagency.com" aria-label="The Surge Agency">
          <img src="/brand/surge-wordmark-green.svg" alt="Surge" className="h-7 w-auto" />
        </a>

        {phase === 'pick' && (
          <>
            <div className="mt-10 sm:mt-14">
              <div className="text-surge-green uppercase tracking-[0.22em]" style={eyebrow}>Step 2 of 5 · Account access</div>
              <h1 className="font-display text-white mt-3 tracking-wide" style={{ fontSize: 'clamp(44px, 7vw, 64px)', lineHeight: 0.95 }}>
                Give us access to your accounts
              </h1>
              <p className="mt-5 text-white/65 max-w-xl">
                Tick the accounts{company ? ` ${company} has` : ' you have'}. We will show you exactly where to click for each one. Most take about a minute.
              </p>
              <div className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-white/80">
                <ShieldCheck size={17} className="text-surge-green" /> No passwords. You invite us, and you can remove us any time.
              </div>
            </div>

            <div className="mt-8 space-y-7">
              {GROUPS.filter((g) => accounts.some((a) => a.group === g.key)).map((g) => (
                <section key={g.key}>
                  <h2 className="text-lg font-bold text-white">{g.label}</h2>
                  <p className="text-white/50">{g.blurb}</p>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {accounts.filter((a) => a.group === g.key).map((a) => {
                      const Icon = ICONS[a.key] || Globe;
                      const on = picked.includes(a.key);
                      return (
                        <button
                          key={a.key} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(a.key)}
                          className={`flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-colors ${on ? 'border-surge-green bg-surge-green/[0.08]' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}
                        >
                          <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${on ? 'bg-surge-green text-surge-bg' : 'bg-white/[0.06] text-white/70'}`}>
                            {on ? <Check size={20} strokeWidth={3} /> : <Icon size={20} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-bold text-white">{a.name}</span>
                            <span className="block text-white/50">{a.short}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-9">
              <button type="button" onClick={start} disabled={!picked.length} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-surge-green py-4 text-lg font-extrabold text-surge-bg transition-opacity disabled:opacity-40 sm:w-auto sm:px-10">
                {picked.length ? `Start with ${picked.length} account${picked.length === 1 ? '' : 's'}` : 'Tick at least one'} <ArrowRight size={20} />
              </button>
              <p className="mt-4 text-white/45">Not sure what you have? Tick your best guess. You can ask for help on any step.</p>
            </div>
          </>
        )}

        {phase === 'steps' && current && (
          <>
            <div className="mt-8 flex items-center justify-between gap-4">
              <button type="button" onClick={() => { resetStep(); if (index > 0) setIndex(index - 1); else setPhase('pick'); }} className="inline-flex items-center gap-2 text-white/55 hover:text-white transition-colors">
                <ArrowLeft size={16} /> Back
              </button>
              <span className="text-white/55">{index + 1} of {queue.length}</span>
            </div>
            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {queue.map((a, i) => (
                <span key={a.key} className={`h-1.5 flex-1 rounded-full ${i < index ? 'bg-surge-green' : i === index ? 'bg-surge-green/60' : 'bg-white/10'}`} />
              ))}
            </div>

            <section className={`${card} mt-6`}>
              <div className="flex items-center gap-3.5">
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-surge-green text-surge-bg">
                  {(() => { const Icon = ICONS[current.key] || Globe; return <Icon size={22} />; })()}
                </span>
                <h1 className="font-display text-white tracking-wide" style={{ fontSize: 'clamp(32px, 6vw, 44px)', lineHeight: 1 }}>{current.name}</h1>
              </div>
              <p className="mt-4 text-white/65">{current.why}</p>

              {current.kind === 'invite' && (
                <>
                  <div className="mt-6">{EmailBox({ role: current.role })}</div>
                  {Steps({ steps: current.steps })}
                  {OpenLink({ link: current.link })}
                  <button type="button" onClick={() => finishStep('done')} className="mt-7 w-full rounded-full bg-surge-green py-4 text-lg font-extrabold text-surge-bg">I sent the invite</button>
                  {HelpAndSkip()}
                </>
              )}

              {current.kind === 'request' && (
                <>
                  {Steps({ steps: current.steps })}
                  <div className="mt-6">
                    <label className="block text-white/60 mb-2" htmlFor="ac-detail">{current.ask.label}</label>
                    <input id="ac-detail" className={input} value={detail} onChange={(e) => { setDetail(e.target.value); setFieldError(''); }} placeholder={current.ask.placeholder} autoComplete="off" />
                    <p className="mt-2 text-white/45">{current.ask.hint}</p>
                    {fieldError && <p className="mt-2 text-[#ff8a8a]" role="alert">{fieldError}</p>}
                  </div>
                  <button type="button" onClick={sendRequest} className="mt-6 w-full rounded-full bg-surge-green py-4 text-lg font-extrabold text-surge-bg">Send it</button>
                  {OpenLink({ link: current.link })}
                  {HelpAndSkip()}
                </>
              )}

              {current.kind === 'choose' && !chosen && (
                <>
                  <h2 className="mt-6 text-lg font-bold text-white">{current.question}</h2>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {current.options.map((o) => (
                      <button key={o.key} type="button" onClick={() => { setOption(o.key); if (o.help) setHelpOpen(true); }} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left font-bold text-white transition-colors hover:border-surge-green hover:text-surge-green">
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-5"><button type="button" onClick={() => finishStep('skipped')} className="text-white/45 hover:text-white transition-colors">Skip for now</button></div>
                </>
              )}

              {current.kind === 'choose' && chosen && (
                <>
                  <button type="button" onClick={() => { setOption(null); setHelpOpen(false); }} className="mt-5 inline-flex items-center gap-2 text-white/55 hover:text-white transition-colors">
                    <ArrowLeft size={15} /> {chosen.label} · change
                  </button>
                  {chosen.help ? (
                    <>
                      <p className="mt-4 text-white/85">No problem. Tell us what you know and we will work it out together on the onboarding call.</p>
                      {HelpAndSkip()}
                    </>
                  ) : (
                    <>
                      <div className="mt-4">{EmailBox({ role: chosen.role })}</div>
                      {Steps({ steps: chosen.steps })}
                      {OpenLink({ link: chosen.link })}
                      <button type="button" onClick={() => finishStep('done')} className="mt-7 w-full rounded-full bg-surge-green py-4 text-lg font-extrabold text-surge-bg">I sent the invite</button>
                      {HelpAndSkip()}
                    </>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="mt-10 sm:mt-14">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surge-green"><Check size={32} className="text-surge-bg" strokeWidth={3} /></div>
              <h1 className="font-display text-white mt-6 tracking-wide" style={{ fontSize: 'clamp(44px, 7vw, 64px)', lineHeight: 0.95 }}>That's the access steps done</h1>
              <p className="mt-5 text-white/65 max-w-xl">We will confirm each invite on our side. Anything you skipped or asked for help with, we will finish together on the onboarding call.</p>
            </div>
            <section className={`${card} mt-8`}>
              <ul className="divide-y divide-white/10">
                {queue.map((a) => {
                  const r = results[a.key];
                  const good = r?.status === 'done' || r?.status === 'requested';
                  return (
                    <li key={a.key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                      <span className="font-bold text-white">{a.name}</span>
                      <span className={`flex-none text-right ${good ? 'text-surge-green' : 'text-white/55'}`}>{STATUS_LABEL[r?.status] || 'Not started'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href={`/book?c=${encodeURIComponent(client)}${company ? `&company=${encodeURIComponent(company)}` : ''}`} className="inline-flex items-center gap-2 rounded-full bg-surge-green px-8 py-4 text-lg font-extrabold text-surge-bg">
                Next: pick a time for your call <ArrowRight size={20} />
              </a>
              <button type="button" onClick={() => { setPhase('pick'); window.scrollTo({ top: 0 }); }} className="text-white/55 hover:text-white transition-colors">Add or redo an account</button>
            </div>
          </>
        )}

        <p className="mt-10 text-white/40">
          Stuck? Email <a className="text-white/70 underline underline-offset-4" href="mailto:sam@thesurgeagency.com">sam@thesurgeagency.com</a>.
        </p>
      </div>
    </main>
  );
}
