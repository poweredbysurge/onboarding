// Industry preset packs for the ICP form (Phase 2, Smart Start).
// Each pack holds tap-to-insert suggestion chips for the long-text fields and
// pre-suggested option values for the multi-select fields (researchChannels,
// evaluationCriteria, howTheyFoundYou). Submit payload is unchanged: the chips
// only seed the same `data` fields the owner would otherwise type.

import roofing from './roofing.json';
import hvac from './hvac.json';
import plumbing from './plumbing.json';
import electrical from './electrical.json';
import landscaping from './landscaping.json';
import solar from './solar.json';
import remodeling from './remodeling.json';

// The industry chip options shown in Step 1. `label` is what gets stored in
// `data.industry` (payload stays a plain string); `key` maps to a preset pack.
export const INDUSTRY_OPTIONS = [
  { label: 'Roofing', key: 'roofing' },
  { label: 'HVAC', key: 'hvac' },
  { label: 'Plumbing', key: 'plumbing' },
  { label: 'Electrical', key: 'electrical' },
  { label: 'Landscaping/Outdoor', key: 'landscaping' },
  { label: 'Solar', key: 'solar' },
  { label: 'Remodeling/Exterior', key: 'remodeling' },
];

export const INDUSTRY_LABELS = INDUSTRY_OPTIONS.map((o) => o.label);

const PRESETS = { roofing, hvac, plumbing, electrical, landscaping, solar, remodeling };

// Resolve the preset pack for whatever is stored in `data.industry`.
// Returns null for "Other" / free-text industries (form stays fully manual).
export function presetFor(industry) {
  const match = INDUSTRY_OPTIONS.find((o) => o.label === industry);
  return match ? PRESETS[match.key] : null;
}
