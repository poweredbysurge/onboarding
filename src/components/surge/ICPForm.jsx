import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, ChevronRight, ChevronLeft, Building2, Users, Target, ShoppingCart, Star, MessageSquare, RotateCcw, AlertCircle, Plus, Sparkles } from 'lucide-react';
import { INDUSTRY_OPTIONS, INDUSTRY_LABELS, presetFor } from '@/data/icp-presets';

/* ── Draft autosave (Phase 1: never lose progress) ── */
const DRAFT_KEY = 'icp-draft-v1';
const AUTOSAVE_MS = 400;

// True if a restored draft holds any answer worth resuming (ignores empty/blank drafts).
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

/* ── Shared input styles ── */
const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 font-body text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-surge-green/60 focus:ring-1 focus:ring-surge-green/30 transition-all duration-200';
const labelCls = 'block font-body text-xs tracking-widest uppercase text-white/50 mb-2';
const textareaCls = `${inputCls} resize-none`;

/* ── Reusable field wrappers ── */
function Field({ label, hint = null, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {hint && <p className="font-body text-xs text-white/70 mb-2 leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

/* ── Phase 2: Smart Start preset chips ── */

// Append a suggestion to whatever the owner has already typed. Idempotent per
// phrase, and joins sentences cleanly so tapping several chips reads naturally.
function insertSuggestion(current, phrase) {
  const cur = (current || '').trim();
  if (!cur) return phrase;
  if (cur.includes(phrase)) return cur; // already inserted, no-op
  return /[.!?]$/.test(cur) ? `${cur} ${phrase}` : `${cur}. ${phrase}`;
}

// Tap-to-insert chips shown under a long-text field, using the CheckboxGroup
// visual language. Renders nothing when the industry has no preset pack.
function SuggestionChips({ suggestions, onInsert }) {
  if (!suggestions || !suggestions.length) return null;
  return (
    <div className="mt-3">
      <p className="font-body text-[11px] tracking-wide text-white/40 mb-2 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-surge-green/70" />
        Tap to start from one of these
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onInsert(s)}
            className="font-body text-xs text-left px-3 py-1.5 rounded-lg border bg-white/5 text-white/55 border-white/10 hover:border-surge-green/40 hover:text-surge-green transition-all duration-200 flex items-start gap-1.5 max-w-full"
          >
            <Plus className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Industry chip select + "Other" free-text, replacing the old free-text input.
// Stores the chosen label (or the free-text) in `data.industry` as a plain string.
function IndustrySelect({ value, onChange }) {
  const known = INDUSTRY_LABELS.includes(value);
  const [otherOpen, setOtherOpen] = useState(value !== '' && !known);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {INDUSTRY_OPTIONS.map((opt) => {
          const selected = !otherOpen && value === opt.label;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setOtherOpen(false); onChange(opt.label); }}
              className={`font-body text-sm px-4 py-2 rounded-lg border transition-all duration-200 ${
                selected
                  ? 'bg-surge-green text-surge-bg border-surge-green font-semibold'
                  : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => { setOtherOpen(true); if (INDUSTRY_LABELS.includes(value)) onChange(''); }}
          className={`font-body text-sm px-4 py-2 rounded-lg border transition-all duration-200 ${
            otherOpen
              ? 'bg-surge-green text-surge-bg border-surge-green font-semibold'
              : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white'
          }`}
        >
          Other
        </button>
      </div>
      {otherOpen && (
        <input
          className={inputCls}
          placeholder="Tell us your industry or vertical"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function RadioGroup({ name, options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`font-body text-sm px-4 py-2 rounded-lg border transition-all duration-200 ${
              selected
                ? 'bg-surge-green text-surge-bg border-surge-green font-semibold'
                : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxGroup({ options, values, onChange, suggested = [] }) {
  const toggle = (val) => {
    const next = values.includes(val) ? values.filter((v) => v !== val) : [...values, val];
    onChange(next);
  };
  const hasSuggestions = suggested.length > 0;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = values.includes(opt.value);
          const isSuggested = !checked && suggested.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`font-body text-sm px-4 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 ${
                checked
                  ? 'bg-surge-green/10 text-surge-green border-surge-green/40 font-medium'
                  : isSuggested
                  ? 'bg-white/5 text-white/75 border-surge-green/30 hover:border-surge-green/50 hover:text-white'
                  : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white'
              }`}
            >
              {checked && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
              {isSuggested && <span className="w-1.5 h-1.5 rounded-full bg-surge-green/70 flex-shrink-0" />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {hasSuggestions && (
        <p className="font-body text-[11px] tracking-wide text-white/40 mt-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-surge-green/70 flex-shrink-0" />
          Common for your industry, tap the ones that fit
        </p>
      )}
    </div>
  );
}

/* ── Steps config ── */
const STEPS = [
  { id: 'company',      label: 'Your Company',       icon: Building2 },
  { id: 'client',       label: 'Ideal Client',        icon: Users },
  { id: 'goals',        label: 'Goals & Pain Points', icon: Target },
  { id: 'buying',       label: 'Buying Journey',      icon: ShoppingCart },
  { id: 'best',         label: 'Best Clients',        icon: Star },
  { id: 'comms',        label: 'Communication',       icon: MessageSquare },
];

const INITIAL = {
  // Step 1 Your Company
  companyName: '',
  yourName: '',
  yourEmail: '',
  industry: '',
  employeeCount: '',
  annualRevenue: '',
  markets: '',
  businessModel: '',
  companyStage: '',

  // Step 2 Ideal Client
  idealClientDescription: '',
  clientIndustry: '',
  clientCompanySize: '',
  clientRevenue: '',
  buyerTitles: '',
  clientGeography: '',
  clientModel: '',

  // Step 3 Goals & Pain Points
  biggestChallenges: '',
  urgency: '',
  currentWorkarounds: '',
  successDefinition: '',
  goalBlockers: '',

  // Step 4 Buying Journey
  howTheyResearch: '',
  researchChannels: [],
  decisionMakers: '',
  salesCycleLength: '',
  commonObjections: '',
  evaluationCriteria: [],

  // Step 5 Best Clients
  bestClientDescription: '',
  avgContractValue: '',
  avgClientLifespan: '',
  howTheyFoundYou: [],
  clientLoyaltyDrivers: '',
  marketingSpend: '',

  // Step 6 Communication
  preferredComms: [],
  socialPlatforms: [],
  communicationTone: '',
  vendorValues: '',
  desiredFeelings: '',
  additionalNotes: '',
};

/* ── Step components ── */

function StepCompany({ data, set }) {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-6">
        <Field label="Your Name">
          <input className={inputCls} placeholder="Jane Smith" value={data.yourName} onChange={(e) => set('yourName', e.target.value)} />
        </Field>
        <Field label="Your Email">
          <input className={inputCls} type="email" placeholder="jane@company.com" value={data.yourEmail} onChange={(e) => set('yourEmail', e.target.value)} />
        </Field>
      </div>
      <Field label="Company Name">
        <input className={inputCls} placeholder="Acme Roofing Co." value={data.companyName} onChange={(e) => set('companyName', e.target.value)} />
      </Field>
      <Field label="Industry / Vertical" hint="Pick the closest fit. We use this to suggest starting points as you go.">
        <IndustrySelect value={data.industry} onChange={(v) => set('industry', v)} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-6">
        <Field label="Team Size">
          <select className={inputCls} value={data.employeeCount} onChange={(e) => set('employeeCount', e.target.value)}>
            <option value="">Select range</option>
            <option value="1-5">1–5 employees</option>
            <option value="6-20">6–20 employees</option>
            <option value="21-50">21–50 employees</option>
            <option value="51-200">51–200 employees</option>
            <option value="200+">200+ employees</option>
          </select>
        </Field>
        <Field label="Annual Revenue">
          <select className={inputCls} value={data.annualRevenue} onChange={(e) => set('annualRevenue', e.target.value)}>
            <option value="">Select range</option>
            <option value="under-500k">Under $500K</option>
            <option value="500k-1m">$500K – $1M</option>
            <option value="1m-3m">$1M – $3M</option>
            <option value="3m-10m">$3M – $10M</option>
            <option value="10m+">$10M+</option>
          </select>
        </Field>
      </div>
      <Field label="Markets Served" hint="Where do you operate? List states, cities, or regions.">
        <input className={inputCls} placeholder="e.g. Dallas-Fort Worth, Texas, Southeast US..." value={data.markets} onChange={(e) => set('markets', e.target.value)} />
      </Field>
      <Field label="Business Model">
        <RadioGroup
          name="businessModel"
          options={[{ value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }, { value: 'Both', label: 'Both' }]}
          value={data.businessModel}
          onChange={(v) => set('businessModel', v)}
        />
      </Field>
      <Field label="Company Stage">
        <RadioGroup
          name="companyStage"
          options={[
            { value: 'startup', label: 'Startup' },
            { value: 'growing', label: 'Growing' },
            { value: 'established', label: 'Established' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
          value={data.companyStage}
          onChange={(v) => set('companyStage', v)}
        />
      </Field>
    </div>
  );
}

function StepClient({ data, set, preset }) {
  return (
    <div className="space-y-6">
      <Field label="Describe Your Ideal Client" hint="In your own words who do you most love working with? What kind of person or business?">
        <textarea className={textareaCls} rows={4} placeholder="e.g. Homeowners in established neighborhoods, aged 40–65, who own their home and care about quality over price. They want the job done right, not the cheapest bid..." value={data.idealClientDescription} onChange={(e) => set('idealClientDescription', e.target.value)} />
        <SuggestionChips suggestions={preset?.idealClientDescription} onInsert={(s) => set('idealClientDescription', insertSuggestion(data.idealClientDescription, s))} />
      </Field>
      <Field label="Client's Industry or Business Type">
        <input className={inputCls} placeholder="e.g. Homeowners, Commercial building owners, Property managers..." value={data.clientIndustry} onChange={(e) => set('clientIndustry', e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-6">
        <Field label="Typical Client Company Size" hint="For B2B: how big is the client's business?">
          <select className={inputCls} value={data.clientCompanySize} onChange={(e) => set('clientCompanySize', e.target.value)}>
            <option value="">Select range</option>
            <option value="individual">Individual / Family</option>
            <option value="micro">Micro (1–10 employees)</option>
            <option value="small">Small (11–50 employees)</option>
            <option value="mid">Mid-size (51–250)</option>
            <option value="enterprise">Enterprise (250+)</option>
            <option value="na">N/A (consumer)</option>
          </select>
        </Field>
        <Field label="Typical Client Annual Revenue / Budget">
          <select className={inputCls} value={data.clientRevenue} onChange={(e) => set('clientRevenue', e.target.value)}>
            <option value="">Select range</option>
            <option value="under-100k">Under $100K</option>
            <option value="100k-500k">$100K – $500K</option>
            <option value="500k-2m">$500K – $2M</option>
            <option value="2m-10m">$2M – $10M</option>
            <option value="10m+">$10M+</option>
            <option value="consumer">Consumer household</option>
          </select>
        </Field>
      </div>
      <Field label="Buyer Job Titles / Roles" hint="Who typically makes or influences the purchase decision?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. Homeowner, Property Manager, Facilities Director, VP of Operations..." value={data.buyerTitles} onChange={(e) => set('buyerTitles', e.target.value)} />
        <SuggestionChips suggestions={preset?.buyerTitles} onInsert={(s) => set('buyerTitles', insertSuggestion(data.buyerTitles, s))} />
      </Field>
      <Field label="Client Geography">
        <input className={inputCls} placeholder="Where are your ideal clients located? Cities, regions, or national?" value={data.clientGeography} onChange={(e) => set('clientGeography', e.target.value)} />
      </Field>
      <Field label="Client's Business Model">
        <RadioGroup
          name="clientModel"
          options={[{ value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }, { value: 'Both', label: 'Both' }, { value: 'consumer', label: 'Consumer' }]}
          value={data.clientModel}
          onChange={(v) => set('clientModel', v)}
        />
      </Field>
    </div>
  );
}

function StepGoals({ data, set, preset }) {
  return (
    <div className="space-y-6">
      <Field label="Biggest Challenges Your Ideal Clients Face" hint="What keeps them up at night? What problems are they actively trying to solve?">
        <textarea className={textareaCls} rows={4} placeholder="e.g. They need a new roof but don't trust contractors. They've been burned before by low-quality work or disappearing companies..." value={data.biggestChallenges} onChange={(e) => set('biggestChallenges', e.target.value)} />
        <SuggestionChips suggestions={preset?.biggestChallenges} onInsert={(s) => set('biggestChallenges', insertSuggestion(data.biggestChallenges, s))} />
      </Field>
      <Field label="How Urgent Are These Problems?">
        <RadioGroup
          name="urgency"
          options={[
            { value: 'nice', label: 'Nice-to-solve' },
            { value: 'important', label: 'Important' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'critical', label: 'Mission-critical' },
          ]}
          value={data.urgency}
          onChange={(v) => set('urgency', v)}
        />
      </Field>
      <Field label="How Are They Solving These Problems Today?" hint="What are they doing now even if it's a workaround?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. Asking friends for referrals, searching Google for local roofers, getting 3 quotes..." value={data.currentWorkarounds} onChange={(e) => set('currentWorkarounds', e.target.value)} />
        <SuggestionChips suggestions={preset?.currentWorkarounds} onInsert={(s) => set('currentWorkarounds', insertSuggestion(data.currentWorkarounds, s))} />
      </Field>
      <Field label="What Does Success Look Like for Them?" hint="How do they know they've made the right decision? What metrics or milestones define a win?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. Project completed on time and on budget, no leaks, clear communication throughout, zero surprises..." value={data.successDefinition} onChange={(e) => set('successDefinition', e.target.value)} />
        <SuggestionChips suggestions={preset?.successDefinition} onInsert={(s) => set('successDefinition', insertSuggestion(data.successDefinition, s))} />
      </Field>
      <Field label="What Obstacles Prevent Them from Moving Forward?" hint="Budget constraints, trust issues, organizational barriers, fear of being wrong be specific.">
        <textarea className={textareaCls} rows={3} placeholder="e.g. Price sensitivity, worry about disruption to daily life, uncertainty about how to evaluate quality..." value={data.goalBlockers} onChange={(e) => set('goalBlockers', e.target.value)} />
        <SuggestionChips suggestions={preset?.goalBlockers} onInsert={(s) => set('goalBlockers', insertSuggestion(data.goalBlockers, s))} />
      </Field>
    </div>
  );
}

function StepBuying({ data, set, preset }) {
  return (
    <div className="space-y-6">
      <Field label="How Do Ideal Clients Research Solutions?" hint="Walk us through how they go from 'I have a problem' to 'I'm ready to hire someone.'">
        <textarea className={textareaCls} rows={4} placeholder="e.g. They Google the problem first, then look at Google reviews, then ask a neighbor, then get 2–3 quotes..." value={data.howTheyResearch} onChange={(e) => set('howTheyResearch', e.target.value)} />
        <SuggestionChips suggestions={preset?.howTheyResearch} onInsert={(s) => set('howTheyResearch', insertSuggestion(data.howTheyResearch, s))} />
      </Field>
      <Field label="Where Do They Get Information? (Select all that apply)">
        <CheckboxGroup
          options={[
            { value: 'google', label: 'Google Search' },
            { value: 'google-reviews', label: 'Google Reviews' },
            { value: 'facebook', label: 'Facebook' },
            { value: 'nextdoor', label: 'Nextdoor' },
            { value: 'linkedin', label: 'LinkedIn' },
            { value: 'youtube', label: 'YouTube' },
            { value: 'referrals', label: 'Word of Mouth' },
            { value: 'direct-mail', label: 'Direct Mail' },
            { value: 'yard-signs', label: 'Yard Signs' },
            { value: 'industry-events', label: 'Industry Events' },
            { value: 'publications', label: 'Trade Publications' },
            { value: 'other', label: 'Other' },
          ]}
          values={data.researchChannels}
          onChange={(v) => set('researchChannels', v)}
          suggested={preset?.researchChannels}
        />
      </Field>
      <Field label="Who's Involved in the Buying Decision?" hint="Who signs off? Who influences? Are there multiple stakeholders?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. Homeowner makes the final call, but their spouse has veto power. In commercial, PM approves but CFO signs..." value={data.decisionMakers} onChange={(e) => set('decisionMakers', e.target.value)} />
        <SuggestionChips suggestions={preset?.decisionMakers} onInsert={(s) => set('decisionMakers', insertSuggestion(data.decisionMakers, s))} />
      </Field>
      <Field label="Typical Sales Cycle Length">
        <select className={inputCls} value={data.salesCycleLength} onChange={(e) => set('salesCycleLength', e.target.value)}>
          <option value="">Select length</option>
          <option value="same-day">Same day decision</option>
          <option value="1-week">Within 1 week</option>
          <option value="2-4-weeks">2–4 weeks</option>
          <option value="1-3-months">1–3 months</option>
          <option value="3-6-months">3–6 months</option>
          <option value="6-months+">6+ months</option>
        </select>
      </Field>
      <Field label="Most Common Objections They Raise" hint="What do prospects push back on? Price, timing, trust, contract terms?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. 'Your price is higher than the other guys.' 'I want to wait until after the holidays.' 'I've been burned before.'" value={data.commonObjections} onChange={(e) => set('commonObjections', e.target.value)} />
        <SuggestionChips suggestions={preset?.commonObjections} onInsert={(s) => set('commonObjections', insertSuggestion(data.commonObjections, s))} />
      </Field>
      <Field label="What Factors Matter Most When They Evaluate? (Select all that apply)">
        <CheckboxGroup
          options={[
            { value: 'price', label: 'Price' },
            { value: 'roi', label: 'ROI / Value' },
            { value: 'trust', label: 'Trust / Reputation' },
            { value: 'reviews', label: 'Reviews & References' },
            { value: 'speed', label: 'Speed to Start' },
            { value: 'quality', label: 'Quality of Work' },
            { value: 'warranty', label: 'Warranty' },
            { value: 'communication', label: 'Communication' },
            { value: 'local', label: 'Local / Proximity' },
            { value: 'experience', label: 'Years of Experience' },
          ]}
          values={data.evaluationCriteria}
          onChange={(v) => set('evaluationCriteria', v)}
          suggested={preset?.evaluationCriteria}
        />
      </Field>
    </div>
  );
}

function StepBest({ data, set, preset }) {
  return (
    <div className="space-y-6">
      <Field label="Describe Your Single Best Client" hint="Think of the client you'd clone if you could. What made them a dream to work with?">
        <textarea className={textareaCls} rows={4} placeholder="e.g. The Hendersons paid upfront, referred us to 4 neighbors, never haggled, trusted our expertise completely, left a glowing review..." value={data.bestClientDescription} onChange={(e) => set('bestClientDescription', e.target.value)} />
        <SuggestionChips suggestions={preset?.bestClientDescription} onInsert={(s) => set('bestClientDescription', insertSuggestion(data.bestClientDescription, s))} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-6">
        <Field label="Average Contract / Job Value">
          <select className={inputCls} value={data.avgContractValue} onChange={(e) => set('avgContractValue', e.target.value)}>
            <option value="">Select range</option>
            <option value="under-5k">Under $5K</option>
            <option value="5k-15k">$5K – $15K</option>
            <option value="15k-30k">$15K – $30K</option>
            <option value="30k-100k">$30K – $100K</option>
            <option value="100k-500k">$100K – $500K</option>
            <option value="500k+">$500K+</option>
          </select>
        </Field>
        <Field label="Average Client Lifespan / Repeat Business">
          <select className={inputCls} value={data.avgClientLifespan} onChange={(e) => set('avgClientLifespan', e.target.value)}>
            <option value="">Select range</option>
            <option value="one-time">One-time project</option>
            <option value="1-2-years">Repeat in 1–2 years</option>
            <option value="3-5-years">Repeat in 3–5 years</option>
            <option value="ongoing">Ongoing / monthly</option>
            <option value="referral-only">One-time but refers others</option>
          </select>
        </Field>
      </div>
      <Field label="How Did Your Best Clients Find You? (Select all that apply)">
        <CheckboxGroup
          options={[
            { value: 'referral', label: 'Referral / Word of mouth' },
            { value: 'google-organic', label: 'Google (organic)' },
            { value: 'google-ads', label: 'Google Ads' },
            { value: 'facebook-ads', label: 'Facebook / Instagram Ads' },
            { value: 'yelp', label: 'Yelp / Angi / HomeAdvisor' },
            { value: 'door-knocking', label: 'Door Knocking / Sales' },
            { value: 'direct-mail', label: 'Direct Mail' },
            { value: 'yard-sign', label: 'Yard Sign' },
            { value: 'repeat', label: 'Past customer / Return' },
            { value: 'other', label: 'Other' },
          ]}
          values={data.howTheyFoundYou}
          onChange={(v) => set('howTheyFoundYou', v)}
          suggested={preset?.howTheyFoundYou}
        />
      </Field>
      <Field label="What Keeps Your Best Clients Loyal?" hint="Why don't they leave for a competitor?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. They trust us completely, we're always responsive, they know we'll stand behind our work..." value={data.clientLoyaltyDrivers} onChange={(e) => set('clientLoyaltyDrivers', e.target.value)} />
        <SuggestionChips suggestions={preset?.clientLoyaltyDrivers} onInsert={(s) => set('clientLoyaltyDrivers', insertSuggestion(data.clientLoyaltyDrivers, s))} />
      </Field>
      <Field label="Current Monthly Marketing Spend">
        <select className={inputCls} value={data.marketingSpend} onChange={(e) => set('marketingSpend', e.target.value)}>
          <option value="">Select range</option>
          <option value="under-1k">Under $1K/mo</option>
          <option value="1k-3k">$1K – $3K/mo</option>
          <option value="3k-7k">$3K – $7K/mo</option>
          <option value="7k-15k">$7K – $15K/mo</option>
          <option value="15k+">$15K+/mo</option>
          <option value="none">Not currently spending</option>
        </select>
      </Field>
    </div>
  );
}

function StepComms({ data, set, preset }) {
  return (
    <div className="space-y-6">
      <Field label="How Do Ideal Clients Prefer to Communicate? (Select all that apply)">
        <CheckboxGroup
          options={[
            { value: 'phone', label: 'Phone Call' },
            { value: 'text', label: 'Text / SMS' },
            { value: 'email', label: 'Email' },
            { value: 'in-person', label: 'In-Person' },
            { value: 'video-call', label: 'Video Call' },
            { value: 'live-chat', label: 'Live Chat' },
            { value: 'social-dm', label: 'Social Media DM' },
          ]}
          values={data.preferredComms}
          onChange={(v) => set('preferredComms', v)}
        />
      </Field>
      <Field label="Which Social Platforms Are They Most Active On? (Select all that apply)">
        <CheckboxGroup
          options={[
            { value: 'facebook', label: 'Facebook' },
            { value: 'instagram', label: 'Instagram' },
            { value: 'nextdoor', label: 'Nextdoor' },
            { value: 'linkedin', label: 'LinkedIn' },
            { value: 'youtube', label: 'YouTube' },
            { value: 'tiktok', label: 'TikTok' },
            { value: 'x-twitter', label: 'X / Twitter' },
            { value: 'none', label: 'Not social media active' },
          ]}
          values={data.socialPlatforms}
          onChange={(v) => set('socialPlatforms', v)}
        />
      </Field>
      <Field label="What Communication Tone Resonates Best With Them?">
        <RadioGroup
          name="communicationTone"
          options={[
            { value: 'conversational', label: 'Conversational' },
            { value: 'professional', label: 'Professional' },
            { value: 'direct', label: 'Direct & Blunt' },
            { value: 'educational', label: 'Educational' },
            { value: 'inspirational', label: 'Inspirational' },
          ]}
          value={data.communicationTone}
          onChange={(v) => set('communicationTone', v)}
        />
      </Field>
      <Field label="What Values Matter Most to Ideal Clients When Choosing a Vendor?" hint="Trust, transparency, local community ties, environmental responsibility what signals quality to them?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. They want to support local businesses, value transparency about pricing, and need to feel the contractor is honest and won't cut corners..." value={data.vendorValues} onChange={(e) => set('vendorValues', e.target.value)} />
        <SuggestionChips suggestions={preset?.vendorValues} onInsert={(s) => set('vendorValues', insertSuggestion(data.vendorValues, s))} />
      </Field>
      <Field label="How Should Clients Feel After Working With You?" hint="Think emotionally what lasting impression do you want to leave?">
        <textarea className={textareaCls} rows={3} placeholder="e.g. Relieved it's finally handled. Proud of the investment. Confident they made the right call. Safe and protected..." value={data.desiredFeelings} onChange={(e) => set('desiredFeelings', e.target.value)} />
        <SuggestionChips suggestions={preset?.desiredFeelings} onInsert={(s) => set('desiredFeelings', insertSuggestion(data.desiredFeelings, s))} />
      </Field>
      <Field label="Anything Else We Should Know?" hint="Any context, nuance, or details that would help us understand your ideal client better.">
        <textarea className={textareaCls} rows={4} placeholder="Share anything you feel is important market quirks, unusual client segments, competitive dynamics, what makes your market unique..." value={data.additionalNotes} onChange={(e) => set('additionalNotes', e.target.value)} />
      </Field>
    </div>
  );
}

const STEP_COMPONENTS = [StepCompany, StepClient, StepGoals, StepBuying, StepBest, StepComms];

/* ── Main form ── */
export default function ICPForm() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [restoredAt, setRestoredAt] = useState(null); // savedAt of a restored draft; drives the banner

  const hydratedRef = useRef(false); // guard so autosave never clobbers the draft before restore runs
  const lastTypedRef = useRef(0);    // for the beforeunload guard
  const doneRef = useRef(false);     // set once a submit lands, so a pending autosave can't resurrect the draft

  const set = (key, val) => {
    lastTypedRef.current = Date.now();
    setData((prev) => ({ ...prev, [key]: val }));
  };

  // Restore any draft on mount (client-only; keeps SSR clean). Runs before autosave.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && draft.data && typeof draft.data === 'object' && hasContent(draft.data)) {
          setData({ ...INITIAL, ...draft.data });
          if (typeof draft.step === 'number') {
            setStep(Math.min(Math.max(draft.step, 0), STEPS.length - 1));
          }
          if (draft.savedAt) setRestoredAt(draft.savedAt);
        }
      }
    } catch (err) {
      console.warn('ICP draft restore failed:', err);
    }
    hydratedRef.current = true;
  }, []);

  // Debounced autosave of the whole form + current step.
  useEffect(() => {
    if (!hydratedRef.current || doneRef.current) return; // not before restore, not after a submit landed
    const id = setTimeout(() => {
      if (doneRef.current) return; // a submit cleared the draft while this write was pending
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, step, savedAt: Date.now() }));
      } catch (err) {
        console.warn('ICP draft save failed:', err);
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [data, step]);

  // Warn on unload only if they typed within the last 2s (autosave has not flushed yet).
  useEffect(() => {
    const handler = (e) => {
      if (Date.now() - lastTypedRef.current < 2000) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* noop */ }
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const next = () => { setStep((s) => Math.min(s + 1, STEPS.length - 1)); scrollTop(); };
  const prev = () => { setStep((s) => Math.max(s - 1, 0)); scrollTop(); };

  const startOver = () => {
    clearDraft();
    setData(INITIAL);
    setStep(0);
    setRestoredAt(null);
    scrollTop();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch('/api/submit-icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      // The route is error-isolated and always answers 2xx on a real submission,
      // so a non-ok status means the submission did not land. Don't fake success.
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      doneRef.current = true; // block any pending autosave before we clear the draft
      clearDraft();           // only clear the draft once the submission is confirmed
      setSubmitted(true);
    } catch (err) {
      console.error('ICP submission error:', err);
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const StepComponent = STEP_COMPONENTS[step];
  const currentStep = STEPS[step];
  const preset = presetFor(data.industry); // Phase 2: industry preset pack, or null for "Other"

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="w-16 h-16 rounded-full bg-surge-green/10 border border-surge-green/30 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-8 h-8 text-surge-green" />
        </div>
        <h2 className="font-display text-4xl sm:text-5xl text-white tracking-wide mb-4">
          We've Got It.
        </h2>
        <p className="font-body text-base text-white/50 max-w-md leading-relaxed mb-8">
          Your ICP profile has been submitted. Our team will review your answers and use them to build your ideal customer blueprint before our first call.
        </p>
        <span className="inline-flex items-center gap-2 font-body text-xs tracking-widest uppercase text-surge-green border border-surge-green/20 bg-surge-green/5 rounded-full px-5 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-surge-green animate-pulse" />
          We'll be in touch shortly
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-16">

      {/* ── Restored-draft banner ── */}
      {restoredAt && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-surge-green/20 bg-surge-green/5 px-4 py-3">
          <p className="font-body text-xs sm:text-sm text-white/70 leading-relaxed">
            Picked up where you left off <span className="text-white/40">(saved {relativeTime(restoredAt)})</span>
          </p>
          <button
            type="button"
            onClick={startOver}
            className="flex-shrink-0 inline-flex items-center gap-1.5 font-body text-xs tracking-wide text-surge-green/80 hover:text-surge-green transition-colors duration-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start over
          </button>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="mb-8 sm:mb-12">
        <div className="flex items-center justify-between mb-3">
          <span className="font-body text-xs tracking-widest uppercase text-surge-green">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="font-body text-xs text-white/60 tracking-wide">
            {Math.round(((step + 1) / STEPS.length) * 100)}% complete
          </span>
        </div>

        {/* Track */}
        <div className="h-px bg-white/10 w-full relative">
          <div
            className="absolute inset-y-0 left-0 bg-surge-green transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Mobile step indicator */}
        <div className="flex sm:hidden items-center gap-3 mt-4">
          {(() => { const Icon = currentStep.icon; return (
            <div className="w-9 h-9 rounded-full border-2 border-surge-green bg-surge-green/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-surge-green" />
            </div>
          ); })()}
          <div>
            <p className="font-body text-xs text-surge-green tracking-widest uppercase leading-none mb-0.5">{currentStep.label}</p>
            <div className="flex gap-1 mt-1">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-4 bg-surge-green' : i < step ? 'w-2 bg-surge-green/50' : 'w-2 bg-white/10'}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Desktop step dots */}
        <div className="hidden sm:flex items-start justify-between mt-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => i < step && setStep(i)}
                className={`flex flex-col items-center gap-2 group ${i < step ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  done ? 'bg-surge-green border-surge-green'
                  : active ? 'bg-surge-green/10 border-surge-green'
                  : 'bg-white/5 border-white/10'
                }`}>
                  {done
                    ? <CheckCircle2 className="w-5 h-5 text-surge-bg" />
                    : <Icon className={`w-5 h-5 ${active ? 'text-surge-green' : 'text-white/60'}`} />
                  }
                </div>
                <span className={`font-body text-xs tracking-wide text-center w-24 leading-tight ${active ? 'text-white' : done ? 'text-surge-green/70' : 'text-white/60'}`}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step header ── */}
      <div className="mb-6 sm:mb-10">
        <p className="font-body text-xs tracking-widest uppercase text-surge-green mb-2 sm:mb-3">
          {currentStep.label}
        </p>
        <h2 className="font-display text-3xl sm:text-5xl text-white tracking-wide leading-none">
          {step === 0 && 'Tell Us About Your Business.'}
          {step === 1 && 'Who Is Your Ideal Client?'}
          {step === 2 && 'Their Goals & Pain Points.'}
          {step === 3 && 'How They Buy.'}
          {step === 4 && 'Your Best Clients.'}
          {step === 5 && 'How They Communicate.'}
        </h2>
        <p className="font-body text-sm text-white/40 mt-2 sm:mt-3 leading-relaxed max-w-xl">
          {step === 0 && 'Start with the basics. This grounds every ad, landing page, and campaign we build in your actual market reality.'}
          {step === 1 && 'The more precisely we can picture your ideal client, the sharper your targeting and the lower your cost per lead.'}
          {step === 2 && 'Their problems are your ad copy. Their urgency determines your offer. Their definition of success becomes your campaign promise.'}
          {step === 3 && 'Knowing how they buy tells us where to run ads, how to structure your website funnel, and what objections to handle before they ever talk to you.'}
          {step === 4 && 'Your best clients tell us exactly who to target and what messaging closes them. We build campaigns to find more of them.'}
          {step === 5 && 'Platform selection, ad creative tone, and website copy all depend on how your ideal client communicates. Help us speak their language.'}
        </p>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4 sm:p-10 mb-6 sm:mb-8">
          <StepComponent data={data} set={set} preset={preset} />
        </div>

        {/* ── Submit error ── */}
        {submitError && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="font-body text-xs sm:text-sm text-red-200/90 leading-relaxed">
              We couldn't submit your ICP just now. Your answers are saved on this device, so nothing is lost. Please try again.
            </p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            onClick={prev}
            className={`flex items-center justify-center gap-2 font-body text-sm text-white/50 hover:text-white transition-colors duration-200 py-3 sm:py-0 ${isFirst ? 'invisible' : ''}`}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {isLast ? (
            <button
              type="submit"
              disabled={submitting}
              className="cta-fill w-full sm:w-auto flex items-center justify-center gap-2 font-body text-sm font-semibold tracking-wide bg-surge-green text-surge-bg px-8 py-4 sm:py-3.5 rounded transition-all duration-300 hover:shadow-xl hover:shadow-surge-green/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting…' : submitError ? 'Try Again' : 'Submit My ICP'}
              {!submitting && <CheckCircle2 className="w-4 h-4" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="cta-fill w-full sm:w-auto flex items-center justify-center gap-2 font-body text-sm font-semibold tracking-wide bg-surge-green text-surge-bg px-8 py-4 sm:py-3.5 rounded transition-all duration-300 hover:shadow-xl hover:shadow-surge-green/20"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
