'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OPTIONS, CHAPTERS, SCREENS, INITIAL, labelFor } from '@/data/icp-flow';
import { presetFor } from '@/data/icp-presets';

/* ── Draft autosave ── */
const DRAFT_KEY = 'icp-draft-v2';     // micro-screen flow: { data, idx, savedAt }
const DRAFT_KEY_V1 = 'icp-draft-v1';  // old long-form draft: { data, step, savedAt } (migrated once)
const AUTOSAVE_MS = 400;
const MOBILE_BP = 820;

/* ── small pure helpers (shared with the old form's behavior) ── */
function hasContent(d) {
  return Object.values(d).some((v) => (Array.isArray(v) ? v.length > 0 : String(v || '').trim() !== ''));
}
function relativeTime(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
function insertSuggestion(current, phrase) {
  const cur = (current || '').trim();
  if (!cur) return phrase;
  if (cur.includes(phrase)) return cur;
  return /[.!?]$/.test(cur) ? `${cur} ${phrase}` : `${cur}. ${phrase}`;
}
function removeSuggestion(current, phrase) {
  let cur = current || '';
  cur = cur.split(`${phrase}. `).join('').split(`. ${phrase}`).join('').split(phrase).join('');
  return cur.trim().replace(/^\.\s*/, '');
}

/* ── scoped styles: keyframes, field focus, chip states + hover ── */
const STYLES = `
@keyframes icpfScreenIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes icpfToastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes icpfPulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.icpf-field { transition: border-color 0.2s; }
.icpf-field:focus { outline: none; border-color: rgba(222,229,53,0.6) !important; box-shadow: 0 0 0 1px rgba(222,229,53,0.3); }
.icpf-btn { cursor: pointer; border-style: solid; border-width: 1px; transition: all 0.2s; }
.icpf-btn:active { transform: scale(0.97); }
.icpf-opt { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.1); font-weight: 400; }
.icpf-opt:hover { border-color: rgba(255,255,255,0.2); color: #ffffff; }
.icpf-opt-sug { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.75); border-color: rgba(222,229,53,0.3); font-weight: 400; }
.icpf-opt-sug:hover { border-color: rgba(222,229,53,0.5); color: #ffffff; }
.icpf-opt-sel { background: #dee535; color: #09090b; border-color: #dee535; font-weight: 600; }
.icpf-opt-selmulti { background: rgba(222,229,53,0.1); color: #dee535; border-color: rgba(222,229,53,0.4); font-weight: 500; }
.icpf-longchip { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.55); border-color: rgba(255,255,255,0.1); }
.icpf-longchip:hover { border-color: rgba(222,229,53,0.4); color: #dee535; }
.icpf-longchip-sel { background: rgba(222,229,53,0.1); color: rgba(255,255,255,0.9); border-color: rgba(222,229,53,0.4); }
.icpf-cta { cursor: pointer; border: none; transition: all 0.3s; }
.icpf-cta:active { transform: scale(0.97); }
.icpf-cta:hover { box-shadow: 0 0 28px rgba(222,229,53,0.28); }
.icpf-submit:hover { box-shadow: 0 0 28px rgba(222,229,53,0.35); background: #dee535 !important; color: #09090b !important; }
.icpf-ghost { background: none; border: none; cursor: pointer; transition: color 0.2s; }
.icpf-ghost:hover { color: rgba(255,255,255,0.8) !important; }
.icpf-editrow:hover { background: rgba(255,255,255,0.03) !important; }
`;

const GREEN = '#dee535';
const BOLT = 'M305.86 0 154.06 212.24 287.18 253.62 0 501.53 154.06 289.44 18.78 253.62 305.86 0';
function Bolt({ fill, height, opacity = 1 }) {
  return (
    <svg viewBox="0 0 305.86 501.53" style={{ height, opacity }} aria-hidden="true">
      <polygon fill={fill} points={BOLT} />
    </svg>
  );
}

const optClass = (selected, suggested, multi) => {
  if (selected && multi) return 'icpf-btn icpf-opt-selmulti';
  if (selected) return 'icpf-btn icpf-opt-sel';
  if (suggested) return 'icpf-btn icpf-opt-sug';
  return 'icpf-btn icpf-opt';
};

// shared field (input/textarea) inline style
const fieldStyle = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '14px 16px',
  fontSize: 16, color: '#ffffff', fontFamily: 'inherit',
};

// Friendly labels for the fields the website pull can fill (badge + summary).
const FIELD_LABELS = {
  companyName: 'Company name', industry: 'Trade', businessLocation: 'Business location',
  markets: 'Service area', businessModel: 'Who you serve',
  idealClientDescription: 'Ideal client', bestClientDescription: 'Best client',
};

export default function ICPFlow() {
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState(INITIAL);
  const [otherOpen, setOtherOpen] = useState(false);
  const [restoredAt, setRestoredAt] = useState(null);
  const [undoFrom, setUndoFrom] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  /* ── Phase 3: Claude assist ── */
  const [assistFor, setAssistFor] = useState(null); // field key or 'website' currently generating
  const [aiDrafts, setAiDrafts] = useState({});     // { [field]: string[] } candidate chips
  const [assistErr, setAssistErr] = useState({});   // { [field|'website']: true }
  const [aiFilled, setAiFilled] = useState({});     // { [field]: true } drives the "drafted for you" badge
  const [webFilled, setWebFilled] = useState(null); // string[] of labels filled by the website pull

  const hydratedRef = useRef(false);
  const doneRef = useRef(false);
  const shownAtRef = useRef(Date.now());
  const timingsRef = useRef([]);
  const lastTypedRef = useRef(0);
  const saveT = useRef(null);
  const undoT = useRef(null);
  const advT = useRef(null);
  const idxRef = useRef(0);
  const dataRef = useRef(INITIAL);
  idxRef.current = idx;
  dataRef.current = data;

  const screen = SCREENS[idx];
  const preset = presetFor(data.industry);

  /* ── restore on mount (v2, migrate a v1 draft once), listeners ── */
  useEffect(() => {
    try {
      let draft = null;
      const rawV2 = localStorage.getItem(DRAFT_KEY);
      if (rawV2) {
        const d = JSON.parse(rawV2);
        if (d && d.data && typeof d.data === 'object' && hasContent(d.data)) draft = d;
      }
      if (!draft) {
        // one-time migration from the old long-form draft (data carries over, restart at screen 0)
        const rawV1 = localStorage.getItem(DRAFT_KEY_V1);
        if (rawV1) {
          const d = JSON.parse(rawV1);
          if (d && d.data && typeof d.data === 'object' && hasContent(d.data)) {
            draft = { data: d.data, idx: 0, savedAt: d.savedAt };
          }
        }
      }
      if (draft) {
        setData({ ...INITIAL, ...draft.data });
        setIdx(Math.min(Math.max(draft.idx || 0, 0), SCREENS.length - 1));
        if (draft.savedAt) setRestoredAt(draft.savedAt);
      }
    } catch (e) { /* noop */ }
    hydratedRef.current = true;
    shownAtRef.current = Date.now();

    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BP);
    onResize();
    window.addEventListener('resize', onResize);

    const onBeforeUnload = (e) => {
      if (!doneRef.current && Date.now() - lastTypedRef.current < 2000) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimeout(saveT.current); clearTimeout(undoT.current); clearTimeout(advT.current);
    };
  }, []);

  /* ── debounced autosave per micro-screen ── */
  useEffect(() => {
    if (!hydratedRef.current || doneRef.current) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      if (doneRef.current) return;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, idx, savedAt: Date.now() }));
      } catch (e) { /* noop */ }
    }, AUTOSAVE_MS);
  }, [data, idx]);

  const set = useCallback((key, val) => {
    lastTypedRef.current = Date.now();
    setData((prev) => ({ ...prev, [key]: val }));
    // Once the owner touches an AI-filled field, drop its "drafted for you" badge.
    setAiFilled((f) => (f[key] ? { ...f, [key]: false } : f));
  }, []);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_KEY_V1); } catch (e) { /* noop */ } };

  /* ── Phase 3 assist handlers (never block the form; failures degrade to manual) ── */
  const callAssist = async (payload) => {
    const res = await fetch('/api/icp-assist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || String(res.status));
    return json;
  };

  const runWebsite = async () => {
    const url = (dataRef.current.companyWebsite || '').trim();
    if (!url || assistFor) return;
    setAssistFor('website'); setAssistErr((e) => ({ ...e, website: false })); setWebFilled(null);
    try {
      const { fields } = await callAssist({ mode: 'website', url });
      const applied = Object.keys(fields).filter((k) => k in INITIAL && k !== 'companyWebsite');
      if (applied.length) {
        setData((prev) => { const next = { ...prev }; applied.forEach((k) => { next[k] = fields[k]; }); return next; });
        setAiFilled((f) => { const n = { ...f }; applied.forEach((k) => { n[k] = true; }); return n; });
        lastTypedRef.current = Date.now();
      }
      setWebFilled(applied.map((k) => FIELD_LABELS[k] || k));
    } catch (err) {
      setAssistErr((e) => ({ ...e, website: true }));
    } finally {
      setAssistFor(null);
    }
  };

  const runFieldAssist = async (s) => {
    const field = s.field;
    if (!field || assistFor) return;
    setAssistFor(field); setAssistErr((e) => ({ ...e, [field]: false }));
    try {
      const d = dataRef.current;
      const { candidates } = await callAssist({
        mode: 'field', field, label: s.title, hint: s.hint || '',
        industry: d.industry,
        company: { companyName: d.companyName, markets: d.markets, businessModel: d.businessModel },
        rough: d[field] || '',
      });
      setAiDrafts((a) => ({ ...a, [field]: candidates }));
    } catch (err) {
      setAssistErr((e) => ({ ...e, [field]: true }));
    } finally {
      setAssistFor(null);
    }
  };

  /* ── per-question timing instrumentation (stays; endpoint is a stub) ── */
  const logTiming = useCallback((skipped) => {
    const s = SCREENS[idxRef.current];
    if (!s || s.kind === 'intro' || s.kind === 'review') return;
    const entry = { screenId: s.id, shownAt: shownAtRef.current, answeredAt: Date.now(), ms: Date.now() - shownAtRef.current, skipped: !!skipped };
    timingsRef.current.push(entry);
    if (typeof window !== 'undefined') window.__icpTimings = timingsRef.current;
    // navigator.sendBeacon('/api/icp-telemetry', JSON.stringify(entry));  // Phase 3+ endpoint
  }, []);

  /* ── navigation ── */
  const goTo = useCallback((target, opts = {}) => {
    const clamped = Math.max(0, Math.min(target, SCREENS.length - 1));
    shownAtRef.current = Date.now();
    setIdx(clamped);
    setOtherOpen(false);
    setSheetOpen(false);
    if ('undoFrom' in opts) setUndoFrom(opts.undoFrom);
  }, []);

  const answeredValue = useCallback((s) => {
    const d = dataRef.current;
    if (s.kind === 'pair' || s.kind === 'dual') return s.fields.every((f) => String(d[f.key] || '').trim() !== '');
    if (s.field) { const v = d[s.field]; return Array.isArray(v) ? v.length > 0 : String(v || '').trim() !== ''; }
    return true;
  }, []);

  const next = useCallback((skipped) => {
    logTiming(skipped);
    goTo(idxRef.current + 1, { undoFrom: null });
  }, [goTo, logTiming]);

  // desktop-only auto-advance on single-choice / completed dual; mobile uses an explicit Continue.
  const autoAdvance = useCallback(() => {
    if (window.innerWidth < MOBILE_BP) return;
    clearTimeout(advT.current);
    const fromIdx = idxRef.current;
    advT.current = setTimeout(() => {
      if (idxRef.current !== fromIdx) return;
      logTiming(false);
      goTo(fromIdx + 1, { undoFrom: fromIdx });
      clearTimeout(undoT.current);
      undoT.current = setTimeout(() => setUndoFrom(null), 4000);
    }, 450);
  }, [goTo, logTiming]);

  const startOver = () => {
    clearDraft();
    shownAtRef.current = Date.now();
    setData(INITIAL);
    setIdx(0);
    setRestoredAt(null);
    setOtherOpen(false);
  };

  /* ── real submit (awaited, error/retry), mirrors the shipped contract ── */
  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch('/api/submit-icp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      doneRef.current = true;
      clearDraft();
      if (typeof window !== 'undefined') console.log('[icp-timing] full session:', timingsRef.current);
      setSubmitted(true);
    } catch (err) {
      console.error('ICP submission error:', err);
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Enter-to-continue (desktop, not review/editing) ── */
  const onKeyRef = useRef(() => {});
  onKeyRef.current = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (submitted || isMobile || editingKey) return;
    const s = SCREENS[idxRef.current];
    if (!s || s.kind === 'review') return;
    e.preventDefault();
    next(!answeredValue(s));
  };
  useEffect(() => {
    const h = (e) => onKeyRef.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  /* ── progress (est-based; percent + minutes, never step counts) ── */
  const total = SCREENS.reduce((a, s) => a + s.est, 0);
  let doneSecs = 0;
  for (let i = 0; i < idx; i++) doneSecs += SCREENS[i].est;
  const pct = Math.round((doneSecs / total) * 100);
  const minsLeft = Math.max(1, Math.ceil((total - doneSecs) / 60));

  /* ─────────────── SUBMITTED ─────────────── */
  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <style>{STYLES}</style>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(222,229,53,0.1)', border: '1px solid rgba(222,229,53,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, color: GREEN, fontSize: 26 }}>✓</div>
        <div style={{ fontFamily: "var(--font-display), sans-serif", fontWeight: 400, fontSize: 'clamp(40px, 6vw, 56px)', color: '#fff', letterSpacing: '0.025em', lineHeight: 1, marginBottom: 16 }}>We&apos;ve Got It.</div>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', maxWidth: 448, lineHeight: 1.65, margin: '0 0 32px' }}>Your ICP profile has been submitted. Our team will review your answers and use them to build your ideal customer blueprint before our first call.</p>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: GREEN, border: '1px solid rgba(222,229,53,0.2)', background: 'rgba(222,229,53,0.05)', borderRadius: 999, padding: '8px 20px' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: GREEN, animation: 'icpfPulseDot 2s ease-in-out infinite' }} />
          We&apos;ll be in touch shortly
        </span>
      </div>
    );
  }

  const chap = CHAPTERS[screen.ch - 1];
  const kind = screen.kind;
  const isQuestion = ['pair', 'short', 'single', 'dual', 'multi', 'long', 'website'].includes(kind);
  const showSidebar = isQuestion && !isMobile;
  const screenFields = screen.fields ? screen.fields.map((f) => f.key) : (screen.field ? [screen.field] : []);
  const screenAiFilled = screenFields.some((k) => aiFilled[k]);

  /* ── sidebar / bottom-sheet context (AI-assist note lives on long screens) ── */
  const contextPanel = (mobile) => (
    <>
      <div style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#71717a', marginBottom: 12 }}>Why we ask this</div>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: '#27272a', margin: '0 0 32px' }}>{screen.why}</p>
      <div style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#71717a', marginBottom: 12 }}>Example answer</div>
      <div style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px', marginBottom: kind === 'long' ? 24 : 0, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.75)', margin: 0 }}>&ldquo;{screen.example}&rdquo;</p>
      </div>
      {kind === 'long' && (
        <div style={{ border: '1px dashed rgba(0,0,0,0.25)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bolt fill="#09090b" height={12} opacity={0.5} />
          <span style={{ fontSize: 13, lineHeight: 1.5, color: '#52525b' }}>Stuck? Tap <b>Help me write this</b> by the answer box and Claude will draft it for you.</span>
        </div>
      )}
    </>
  );

  /* ── "drafted for you" badge for AI-filled fields ── */
  const AiFilledBadge = () => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '5px 10px', borderRadius: 999, background: 'rgba(222,229,53,0.08)', border: '1px solid rgba(222,229,53,0.3)' }}>
      <Bolt fill={GREEN} height={10} />
      <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'rgba(222,229,53,0.85)' }}>Drafted from your site, please check</span>
    </div>
  );

  /* ── option/chip builders ── */
  const renderSingle = (s) => {
    const opts = OPTIONS[s.options].map((o) => {
      const selected = !otherOpen && data[s.field] === o.value;
      return { label: o.label, selected, onTap: () => { setOtherOpen(false); set(s.field, o.value); autoAdvance(); } };
    });
    if (s.allowOther) {
      opts.push({ label: 'Other', selected: otherOpen, isOther: true, onTap: () => {
        if (OPTIONS.industry.some((o) => o.value === data[s.field])) set(s.field, '');
        setOtherOpen(true);
      } });
    }
    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {opts.map((o, i) => (
            <button key={i} onClick={o.onTap} className={optClass(o.selected, false, false)}
              style={{ fontFamily: 'inherit', fontSize: 16, padding: '12px 20px', minHeight: 48, borderRadius: 8 }}>{o.label}</button>
          ))}
        </div>
        {otherOpen && (
          <input type="text" className="icpf-field" placeholder={s.otherPlaceholder || 'Tell us more'} value={data[s.field] || ''}
            onChange={(e) => set(s.field, e.target.value)} style={{ ...fieldStyle, marginTop: 16 }} />
        )}
        {kind === 'single' && !otherOpen && !isMobile && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>Tap one and we move on. You can undo.</div>
        )}
      </>
    );
  };

  const renderMulti = (s) => {
    const vals = data[s.field] || [];
    const suggestedVals = (s.suggestFromPreset && preset && preset[s.field]) || [];
    const opts = OPTIONS[s.options];
    const anySuggested = opts.some((o) => !vals.includes(o.value) && suggestedVals.includes(o.value));
    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {opts.map((o) => {
            const selected = vals.includes(o.value);
            const suggested = !selected && suggestedVals.includes(o.value);
            return (
              <button key={o.value} className={optClass(selected, suggested, true)}
                onClick={() => set(s.field, selected ? vals.filter((v) => v !== o.value) : [...vals, o.value])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 15, padding: '10px 16px', minHeight: 44, borderRadius: 8 }}>
                {selected && <span style={{ fontSize: 13 }}>✓</span>}
                {suggested && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(222,229,53,0.7)', flexShrink: 0 }} />}
                {o.label}
              </button>
            );
          })}
        </div>
        {anySuggested && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(222,229,53,0.7)' }} />Common for your trade. Tap the ones that fit.
          </div>
        )}
      </>
    );
  };

  const renderDual = (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {s.fields.map((fl) => (
        <div key={fl.key}>
          <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>{fl.label}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {OPTIONS[fl.options].map((o) => {
              const selected = data[fl.key] === o.value;
              return (
                <button key={o.value} className={optClass(selected, false, false)}
                  onClick={() => {
                    set(fl.key, o.value);
                    const other = s.fields.find((x) => x.key !== fl.key);
                    if (String(data[other.key] || '').trim() !== '') autoAdvance();
                  }}
                  style={{ fontFamily: 'inherit', fontSize: 15, padding: '10px 16px', minHeight: 44, borderRadius: 8 }}>{o.label}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const renderLong = (s) => {
    const suggestions = (preset && s.presetKey && preset[s.presetKey]) || [];
    const cur = data[s.field] || '';
    return (
      <>
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {suggestions.map((text, i) => {
              const selected = cur.includes(text);
              return (
                <button key={i} className={`icpf-btn ${selected ? 'icpf-longchip-sel' : 'icpf-longchip'}`}
                  onClick={() => set(s.field, selected ? removeSuggestion(cur, text) : insertSuggestion(cur, text))}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, padding: '11px 14px', borderRadius: 8, textAlign: 'left' }}>
                  <span style={{ flexShrink: 0, color: selected ? GREEN : 'rgba(222,229,53,0.6)' }}>{selected ? '✓' : '+'}</span>
                  <span>{text}</span>
                </button>
              );
            })}
          </div>
        )}
        <textarea className="icpf-field" rows={suggestions.length > 0 ? 3 : 5} placeholder="Or write it in your own words" value={cur}
          onChange={(e) => set(s.field, e.target.value)} style={{ ...fieldStyle, resize: 'none', lineHeight: 1.5 }} />
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Shift+Enter for a new line</div>

        {/* Phase 3: per-field Claude assist */}
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={() => runFieldAssist(s)} disabled={assistFor === s.field}
            className="icpf-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, background: 'rgba(222,229,53,0.08)', color: GREEN, borderColor: 'rgba(222,229,53,0.35)', cursor: assistFor === s.field ? 'default' : 'pointer', opacity: assistFor === s.field ? 0.7 : 1 }}>
            <Bolt fill={GREEN} height={11} />
            {assistFor === s.field ? 'Drafting…' : 'Help me write this'}
          </button>
          {assistErr[s.field] && (
            <span style={{ marginLeft: 12, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Couldn&apos;t draft that just now. Keep writing by hand.</span>
          )}
        </div>
        {(aiDrafts[s.field] || []).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
              <Bolt fill={GREEN} height={10} />Drafts for you, tap to use then edit
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aiDrafts[s.field].map((text, i) => {
                const selected = cur.includes(text);
                return (
                  <button key={i} className={`icpf-btn ${selected ? 'icpf-longchip-sel' : 'icpf-longchip'}`}
                    onClick={() => set(s.field, selected ? removeSuggestion(cur, text) : insertSuggestion(cur, text))}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, padding: '11px 14px', borderRadius: 8, textAlign: 'left' }}>
                    <span style={{ flexShrink: 0, color: selected ? GREEN : 'rgba(222,229,53,0.6)' }}>{selected ? '✓' : '+'}</span>
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderWebsite = (s) => {
    const busy = assistFor === 'website';
    return (
      <>
        <input type="url" inputMode="url" className="icpf-field" placeholder={s.placeholder || ''} value={data[s.field] || ''}
          onChange={(e) => set(s.field, e.target.value)} style={fieldStyle} />
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button type="button" onClick={runWebsite} disabled={busy || !(data[s.field] || '').trim()}
            className="icpf-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '12px 22px', borderRadius: 8, background: 'rgba(222,229,53,0.1)', color: GREEN, borderColor: 'rgba(222,229,53,0.4)', cursor: busy || !(data[s.field] || '').trim() ? 'default' : 'pointer', opacity: busy || !(data[s.field] || '').trim() ? 0.55 : 1 }}>
            <Bolt fill={GREEN} height={13} />
            {busy ? 'Reading your site…' : 'Pull my info from my site'}
          </button>
        </div>
        {webFilled && webFilled.length > 0 && (
          <div style={{ marginTop: 16, borderRadius: 8, border: '1px solid rgba(222,229,53,0.25)', background: 'rgba(222,229,53,0.06)', padding: '12px 16px' }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.8)' }}>
              Got it. We filled in {webFilled.join(', ')}. You&apos;ll see each one flagged as you go, so give them a quick check.
            </p>
          </div>
        )}
        {webFilled && webFilled.length === 0 && (
          <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>We couldn&apos;t pull much from that page. No problem, just keep going and fill it in yourself.</div>
        )}
        {assistErr.website && (
          <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Couldn&apos;t read that site just now. You can keep filling this out by hand.</div>
        )}
      </>
    );
  };

  const renderPair = (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {s.fields.map((fl) => (
        <div key={fl.key}>
          <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>{fl.label}</label>
          {fl.sub && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>{fl.sub}</p>}
          <input type={fl.type || 'text'} className="icpf-field" placeholder={fl.placeholder} value={data[fl.key] || ''}
            onChange={(e) => set(fl.key, e.target.value)} style={fieldStyle} />
        </div>
      ))}
    </div>
  );

  const renderShort = (s) => {
    const geo = s.geoSuggest
      ? [data.markets, data.businessLocation].map((v) => (v || '').trim()).filter((v, i, arr) => v && arr.indexOf(v) === i)
      : [];
    return (
      <>
        <input type="text" className="icpf-field" placeholder={s.placeholder || ''} value={data[s.field] || ''}
          onChange={(e) => set(s.field, e.target.value)} style={fieldStyle} />
        {geo.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(222,229,53,0.7)' }} />Suggested from your service area · tap to use
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {geo.map((text, i) => (
                <button key={i} className="icpf-btn icpf-opt" onClick={() => set(s.field, insertSuggestion(data[s.field], text))}
                  style={{ fontFamily: 'inherit', fontSize: 14, padding: '8px 14px', minHeight: 40, borderRadius: 8, textAlign: 'left' }}>+ {text}</button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  /* ── review ── */
  const reviewRow = (key, label, kindOf, optKey, placeholder) => {
    const raw = data[key];
    const isArr = Array.isArray(raw);
    const empty = isArr ? raw.length === 0 : String(raw || '').trim() === '';
    let display;
    if (empty) display = 'Skipped';
    else if (isArr) display = raw.map((v) => labelFor(optKey, v)).join(', ');
    else if (kindOf === 'single') display = labelFor(optKey, raw);
    else display = raw;
    const editing = editingKey === key;
    return (
      <div key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={() => setEditingKey(editing ? null : key)} className="icpf-editrow"
          style={{ display: 'flex', width: '100%', boxSizing: 'border-box', alignItems: 'baseline', justifyContent: 'space-between', gap: isMobile ? 10 : 16, padding: isMobile ? '14px 16px' : '15px 20px', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
          <span style={{ flexShrink: 0, width: isMobile ? 104 : 172, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>{label}</span>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.55, color: empty ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)', fontStyle: empty ? 'italic' : 'normal' }}>
            {display}
            {aiFilled[key] && !empty && <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(222,229,53,0.75)', whiteSpace: 'nowrap' }}>✦ drafted, check it</span>}
          </span>
          <span style={{ flexShrink: 0, fontSize: 12, color: 'rgba(222,229,53,0.75)', textDecoration: editing ? 'none' : 'underline', textUnderlineOffset: 3 }}>{editing ? '' : 'Edit'}</span>
        </button>
        {editing && (
          <div style={{ padding: '4px 20px 20px' }}>
            {kindOf === 'text' && (
              <input type="text" className="icpf-field" value={raw || ''} placeholder={placeholder || ''} onChange={(e) => set(key, e.target.value)} style={{ ...fieldStyle, fontSize: 15, padding: '12px 14px' }} />
            )}
            {kindOf === 'long' && (
              <textarea className="icpf-field" rows={4} value={raw || ''} placeholder={placeholder || ''} onChange={(e) => set(key, e.target.value)} style={{ ...fieldStyle, fontSize: 15, padding: '12px 14px', resize: 'none', lineHeight: 1.55 }} />
            )}
            {(kindOf === 'single' || kindOf === 'multi') && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {OPTIONS[optKey].map((o) => {
                  const sel = kindOf === 'single' ? raw === o.value : (raw || []).includes(o.value);
                  return (
                    <button key={o.value} className={optClass(sel, false, kindOf === 'multi')}
                      onClick={() => {
                        if (kindOf === 'single') set(key, o.value);
                        else { const vs = raw || []; set(key, sel ? vs.filter((v) => v !== o.value) : [...vs, o.value]); }
                      }}
                      style={{ fontFamily: 'inherit', fontSize: 14, padding: '9px 14px', minHeight: 42, borderRadius: 8 }}>{o.label}</button>
                  );
                })}
              </div>
            )}
            <button onClick={() => setEditingKey(null)} className="icpf-btn"
              style={{ marginTop: 14, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: 'rgba(222,229,53,0.1)', color: GREEN, borderColor: 'rgba(222,229,53,0.4)', borderRadius: 6, padding: '9px 20px' }}>Done</button>
          </div>
        )}
      </div>
    );
  };

  const REVIEW_MAP = [
    [1, [['yourName', 'Your name', 'text', null, 'Jane Smith'], ['yourEmail', 'Your email', 'text', null, 'jane@company.com'], ['companyName', 'Company', 'text', null, 'Acme Roofing Co.'], ['companyWebsite', 'Website', 'text', null, 'acme.com'], ['industry', 'Trade', 'text', null, 'Roofing'], ['employeeCount', 'Team size', 'single', 'employeeCount'], ['annualRevenue', 'Annual revenue', 'single', 'annualRevenue'], ['businessLocation', 'Location', 'text', null, 'Fort Worth, TX'], ['markets', 'Service area', 'text', null, 'DFW metro'], ['businessModel', 'Who you serve', 'single', 'businessModel']]],
    [2, [['idealClientDescription', 'Ideal client', 'long'], ['clientGeography', 'Client geography', 'text']]],
    [3, [['biggestChallenges', 'Their challenges', 'long'], ['urgency', 'Urgency', 'single', 'urgency'], ['currentWorkarounds', 'Solving it today', 'long'], ['successDefinition', 'What a win looks like', 'long'], ['goalBlockers', 'What stops them', 'long']]],
    [4, [['howTheyResearch', 'How they research', 'long'], ['researchChannels', 'Info channels', 'multi', 'researchChannels'], ['decisionMakers', 'Who signs off', 'long'], ['salesCycleLength', 'Sales cycle', 'single', 'salesCycleLength'], ['commonObjections', 'Objections', 'long'], ['evaluationCriteria', 'How they compare', 'multi', 'evaluationCriteria']]],
    [5, [['bestClientDescription', 'Best client', 'long'], ['avgContractValue', 'Average job value', 'single', 'avgContractValue'], ['avgClientLifespan', 'Repeat business', 'single', 'avgClientLifespan'], ['howTheyFoundYou', 'How they found you', 'multi', 'howTheyFoundYou'], ['clientLoyaltyDrivers', 'Why they stay', 'long'], ['marketingSpend', 'Marketing spend', 'single', 'marketingSpend']]],
    [6, [['preferredComms', 'Contact channels', 'multi', 'preferredComms'], ['socialPlatforms', 'Social platforms', 'multi', 'socialPlatforms'], ['communicationTone', 'Tone', 'single', 'communicationTone'], ['vendorValues', 'Vendor values', 'long'], ['desiredFeelings', 'After feeling', 'long'], ['additionalNotes', 'Anything else', 'long']]],
  ];

  /* ─────────────── FLOW ─────────────── */
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#09090b', fontFamily: "var(--font-body), sans-serif" }}>
      <style>{STYLES}</style>

      {/* Progress header */}
      <div style={{ background: 'rgba(9,9,11,0.9)', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(12px)' }}>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: '0 auto 0 0', background: GREEN, boxShadow: '0 0 12px rgba(222,229,53,0.4)', transition: 'width 0.5s ease-out', width: `${pct}%` }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 24px', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bolt fill={GREEN} height={14} />
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>ICP Intake · {chap.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: GREEN }}>{pct}% done</span>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>~{minsLeft} min left</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: GREEN, animation: 'icpfPulseDot 2s ease-in-out infinite' }} />Autosaved
            </span>
          </div>
        </div>
      </div>

      {/* Restored-draft banner */}
      {restoredAt && (
        <div style={{ background: 'rgba(222,229,53,0.05)', borderBottom: '1px solid rgba(222,229,53,0.2)' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 24px' }}>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Picked up where you left off (saved {relativeTime(restoredAt)})</span>
            <button onClick={startOver} className="icpf-ghost" style={{ fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.05em', color: 'rgba(222,229,53,0.8)' }}>Start over</button>
          </div>
        </div>
      )}

      {/* CHAPTER INTRO */}
      {kind === 'intro' && (() => {
        const chapScreens = SCREENS.filter((x) => x.ch === screen.ch && x.kind !== 'intro' && x.kind !== 'review');
        const secs = chapScreens.reduce((a, x) => a + x.est, 0);
        return (
          <div style={{ flex: 1, background: '#09090b', backgroundImage: 'linear-gradient(rgba(222,229,53,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(222,229,53,0.025) 1px, transparent 1px), radial-gradient(120% 60% at 50% 100%, rgba(222,229,53,0.07), transparent 70%)', backgroundSize: '60px 60px, 60px 60px, 100% 100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
            <div key={screen.id} style={{ maxWidth: 640, textAlign: 'center', animation: 'icpfScreenIn 0.5s ease-out both' }}>
              <div style={{ fontSize: 12, letterSpacing: '0.35em', textTransform: 'uppercase', color: GREEN, marginBottom: 20 }}>Chapter {screen.ch} of 6 · {chap.label}</div>
              <div style={{ fontFamily: "var(--font-display), sans-serif", fontWeight: 400, fontSize: 'clamp(44px, 6vw, 64px)', color: '#fff', lineHeight: 1, letterSpacing: '0.025em', marginBottom: 20 }}>{chap.title}</div>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: 'rgba(255,255,255,0.5)', margin: '0 0 14px' }}>{chap.body}</p>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 36 }}>{chapScreens.length} quick questions · about {Math.max(1, Math.round(secs / 60))} min</div>
              <button onClick={() => next(false)} className="icpf-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, letterSpacing: '0.025em', background: GREEN, color: '#09090b', padding: '15px 38px', borderRadius: 4 }}>Continue <span style={{ fontSize: 16 }}>›</span></button>
              {!isMobile && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 16 }}>press Enter ↵</div>}
            </div>
          </div>
        );
      })()}

      {/* QUESTION */}
      {isQuestion && (
        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch' }}>
          <div style={{ flex: 1.5, background: '#09090b', backgroundImage: 'radial-gradient(120% 60% at 50% 100%, rgba(222,229,53,0.05), transparent 70%)', display: 'flex', flexDirection: 'column', justifyContent: isMobile ? 'flex-start' : 'center', padding: isMobile ? '32px 24px 40px' : '56px clamp(24px, 5vw, 80px)', minHeight: 0 }}>
            <div key={screen.id} style={{ maxWidth: 660, width: '100%', animation: 'icpfScreenIn 0.35s ease-out both' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: GREEN, marginBottom: 14 }}>{chap.label}</div>
              <div style={{ fontFamily: "var(--font-display), sans-serif", fontWeight: 400, fontSize: 'clamp(32px, 4vw, 44px)', color: '#fff', lineHeight: 1.05, letterSpacing: '0.02em', marginBottom: 10 }}>{screen.title}</div>
              {screen.hint && <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 8px' }}>{screen.hint}</p>}
              {isMobile && kind !== 'website' && (
                <button onClick={() => setSheetOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'rgba(222,229,53,0.7)', textDecoration: 'underline', textUnderlineOffset: 3, marginBottom: 8 }}>Why we ask this</button>
              )}
              <div style={{ height: 24 }} />
              {screenAiFilled && <AiFilledBadge />}

              {kind === 'pair' && renderPair(screen)}
              {kind === 'short' && renderShort(screen)}
              {kind === 'single' && renderSingle(screen)}
              {kind === 'dual' && renderDual(screen)}
              {kind === 'multi' && renderMulti(screen)}
              {kind === 'long' && renderLong(screen)}
              {kind === 'website' && renderWebsite(screen)}

              {/* actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 36, flexWrap: 'wrap' }}>
                {(kind !== 'single' || otherOpen || isMobile) && (
                  <button onClick={() => next(!answeredValue(screen))} className="icpf-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, letterSpacing: '0.025em', background: GREEN, color: '#09090b', padding: '14px 32px', borderRadius: 4 }}>Continue <span style={{ fontSize: 15 }}>›</span></button>
                )}
                <button onClick={() => next(!answeredValue(screen))} className="icpf-ghost" style={{ fontFamily: 'inherit', fontSize: 14, color: 'rgba(255,255,255,0.45)', textDecoration: 'underline', textUnderlineOffset: 3, padding: '8px 0' }}>Not sure yet</button>
                {!isMobile && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>press Enter ↵</span>}
              </div>
              {idx > 0 && (
                <button onClick={() => goTo(idx - 1)} className="icpf-ghost" style={{ padding: '8px 0 0', fontFamily: 'inherit', fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 14 }}>‹ Back</button>
              )}
            </div>
          </div>

          {showSidebar && (
            <div style={{ flex: 1, background: '#e8e8e8', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '56px clamp(24px, 4vw, 60px)' }}>
              <div key={screen.id} style={{ maxWidth: 400, animation: 'icpfScreenIn 0.35s ease-out 0.05s both' }}>{contextPanel(false)}</div>
            </div>
          )}
        </div>
      )}

      {/* REVIEW */}
      {kind === 'review' && (
        <div style={{ flex: 1, background: '#e8e8e8', padding: '56px 24px 112px' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', animation: 'icpfScreenIn 0.4s ease-out both' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#71717a', marginBottom: 14 }}>Final check</div>
            <div style={{ fontFamily: "var(--font-display), sans-serif", fontWeight: 400, fontSize: 'clamp(40px, 5vw, 56px)', color: '#09090b', lineHeight: 1, letterSpacing: '0.02em', marginBottom: 12 }}>Look It Over, Then Send It.</div>
            <p style={{ fontSize: 15, color: '#52525b', lineHeight: 1.65, margin: '0 0 40px', maxWidth: 560 }}>Tap any answer to change it right here. Skipped questions are fine to leave skipped.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {REVIEW_MAP.map(([chNum, rows]) => (
                <div key={chNum}>
                  <div style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#71717a', marginBottom: 10 }}>Chapter {chNum} · {CHAPTERS[chNum - 1].label}</div>
                  <div style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
                    {rows.map((r) => reviewRow(r[0], r[1], r[2], r[3], r[4]))}
                  </div>
                </div>
              ))}
            </div>

            {submitError && (
              <div style={{ marginTop: 32, display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 8, border: '1px solid rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)', padding: '14px 18px' }}>
                <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>!</span>
                <p style={{ fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, color: '#7f1d1d', margin: 0 }}>We couldn&apos;t submit your ICP just now. Your answers are saved on this device, so nothing is lost. Please try again.</p>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 44 }}>
              <button onClick={handleSubmit} disabled={submitting} className="icpf-submit"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, letterSpacing: '0.025em', background: '#09090b', color: '#fff', padding: '17px 42px', borderRadius: 4, border: 'none', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Submitting…' : submitError ? 'Try Again' : 'Submit My ICP'} <span style={{ fontSize: 15 }}>✓</span>
              </button>
              <button onClick={() => goTo(idx - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: '#71717a', textDecoration: 'underline', textUnderlineOffset: 3 }}>‹ Back</button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undoFrom !== null && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50, animation: 'icpfToastIn 0.2s ease-out both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#111113', border: '1px solid rgba(222,229,53,0.3)', color: '#fff', borderRadius: 8, padding: '12px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: GREEN }} />Answer saved</span>
            <button onClick={() => { clearTimeout(undoT.current); goTo(undoFrom, { undoFrom: null }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3, color: GREEN }}>Undo</button>
          </div>
        </div>
      )}

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <>
          <div onClick={() => setSheetOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61, background: '#e8e8e8', borderRadius: '16px 16px 0 0', padding: '20px 24px 32px', animation: 'icpfToastIn 0.25s ease-out both' }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(0,0,0,0.2)', margin: '0 auto 20px' }} />
            {contextPanel(true)}
            <button onClick={() => setSheetOpen(false)} style={{ width: '100%', marginTop: 22, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, background: '#09090b', color: '#fff', border: 'none', borderRadius: 8, padding: 15, cursor: 'pointer' }}>Got it</button>
          </div>
        </>
      )}
    </div>
  );
}
