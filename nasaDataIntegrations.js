// NASA-resource-linked logic: dataset citations, MSR cost-efficiency grading,
// ESCAPADE space-weather sync, abrasion-gauge rules and the Family Portrait.
// Pure functions only (no Three.js), so the debrief and What-If lab can run headless.

import { NASA_DATA, ITEM_BY_ID, FAMILY, VEHICLES, WINDOWS, MODES } from '../game/data.js';

// Real mission cost benchmarks (lifecycle, then-year $M) and landed mass (kg).
export const MSR_CLASSES = [
  { id: 'pathfinder', name: 'Mars Pathfinder + Sojourner', cls: 'Discovery', cost: 265, mass: 370, year: 1997 },
  { id: 'phoenix', name: 'Phoenix Lander', cls: 'Scout', cost: 420, mass: 350, year: 2008 },
  { id: 'insight', name: 'InSight', cls: 'Discovery', cost: 830, mass: 358, year: 2018 },
  { id: 'mer', name: 'Spirit + Opportunity (MER)', cls: 'Mid-class', cost: 820, mass: 1063, year: 2004 },
  { id: 'msl', name: 'Curiosity (MSL)', cls: 'Flagship', cost: 2500, mass: 899, year: 2012 },
  { id: 'm2020', name: 'Perseverance (Mars 2020)', cls: 'Flagship', cost: 2700, mass: 1025, year: 2021 },
];

export function msrGrade({ science, cost, mass, alive }) {
  const perM = cost > 0 ? science / cost : 0;
  const perKg = mass > 0 ? science / mass : 0;
  const idx = perM * 0.65 + perKg * 0.35 * 0.25;
  const grade = !alive
    ? 'F'
    : idx >= 6
      ? 'A+'
      : idx >= 4.6
        ? 'A'
        : idx >= 3.5
          ? 'B'
          : idx >= 2.5
            ? 'C'
            : 'D';
  const tier = !alive
    ? 'NOT CERTIFIED'
    : grade.startsWith('A')
      ? 'MSR ARCHITECTURE CERTIFIED · TIER I'
      : grade === 'B'
        ? 'MSR ARCHITECTURE CERTIFIED · TIER II'
        : 'PROVISIONAL CERTIFICATION';
  let nearest = MSR_CLASSES[0];
  for (const c of MSR_CLASSES) if (Math.abs(c.cost - cost) < Math.abs(nearest.cost - cost)) nearest = c;
  return { grade, tier, perM, perKg, nearest, idx };
}

export function contractResult(s, contract) {
  if (!contract) return null;
  const has = s.has;
  const preserved = Object.values(s.encounters).filter((v) => v === 'preserve').length;
  const alive = s.alive;
  let ok = false;
  let why = '';
  if (contract.id === 'astro') {
    ok = alive && has.libs && s.science >= 1500;
    why = !has.libs ? 'LIBS Spectrometer not aboard' : s.science < 1500 ? `Only ${Math.round(s.science)} of 1,500 Science Data` : alive ? 'Boxwork astrobiology objectives met' : 'Crew lost';
  } else if (contract.id === 'ice') {
    ok = alive && has.drill && s.flags.survivedCold;
    why = !has.drill ? 'Deep-Core Drill not aboard' : !s.flags.survivedCold ? 'Never camped on -80 °C ground and lived' : alive ? 'Ice cored, cold zone survived' : 'Crew lost';
  } else {
    ok = alive && has.dish && has.brush && preserved >= 3;
    why = !(has.dish && has.brush) ? 'Needs both High-Gain Dish and Dust Brush' : preserved < 3 ? `${preserved} of 3 machines preserved` : alive ? 'Three legacy archives sent home' : 'Crew lost';
  }
  return { ...contract, ok, why, award: ok ? contract.bonus : 0 };
}

const VCODE = { atlas: 'ATL', sls: 'SLS' };
const ICODE = {
  rtg: 'RTG', solar: 'SOL', shield: 'PEB', dish: 'HGA', brush: 'EDB', libs: 'LIB',
  eclss: 'ECL', aerogel: 'AER', moxie: 'MOX', lidar: 'LDR', drill: 'DRL', medkit: 'MED',
};

export function blueprintCode({ vehicleId, windowId, mode, packed, waypoints, seedText, contractId }) {
  const items = packed.map((id) => ICODE[id] || id.toUpperCase()).join('.');
  const route = waypoints.map((w) => `${Math.round(w.x)},${Math.round(w.z)}`).join(';');
  const m = { cadet: 'CDT', director: 'FD', sandbox: 'SBX' }[mode] || 'FD';
  const win = windowId === 'fast' ? 'FST' : 'HOH';
  return `SOL60|${VCODE[vehicleId] || vehicleId}-${win}|${m}|${(contractId || 'none').toUpperCase()}|${items || 'EMPTY'}|${route}|${seedText || 'RANDOM'}`;
}

export function parseBlueprint(code) {
  const parts = String(code || '').trim().split('|');
  if (parts.length < 7 || parts[0] !== 'SOL60') return null;
  const [vw, m, c, items, route, ...seedParts] = parts.slice(1);
  const [v, w] = vw.split('-');
  const rev = Object.fromEntries(Object.entries(ICODE).map(([k, val]) => [val, k]));
  const vehicleId = Object.entries(VCODE).find(([, val]) => val === v)?.[0];
  if (!vehicleId || !VEHICLES[vehicleId]) return null;
  const waypoints = route
    .split(';')
    .map((p) => p.split(',').map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([x, z]) => ({ x, z }));
  return {
    vehicleId,
    windowId: w === 'FST' ? 'fast' : 'hohmann',
    mode: { CDT: 'cadet', FD: 'director', SBX: 'sandbox' }[m] || 'director',
    contractId: c === 'NONE' ? null : c.toLowerCase(),
    packed: items === 'EMPTY' ? [] : items.split('.').map((k) => rev[k]).filter(Boolean),
    waypoints: waypoints.length === 3 ? waypoints : null,
    seedText: seedParts.join('|'),
  };
}

export function certification(s, { docked = true } = {}) {
  const lines = [];
  let score = 100;
  if (s.route.cospar && !s.sterilized) {
    score -= 30;
    lines.push({ ok: false, text: 'Entered a COSPAR Special Region without thermal/UV sterilization (-30)' });
  } else if (s.route.cospar) lines.push({ ok: true, text: 'COSPAR Special Region entered with sterilized hardware' });
  else lines.push({ ok: true, text: 'COSPAR Special Region avoided' });
  if (s.has.rtg) {
    if (s.flags.contained) lines.push({ ok: true, text: 'MMRTG placed in Safe Containment for disposal' });
    else {
      score -= 40;
      lines.push({ ok: false, text: 'MMRTG left without Safe Containment (-40)' });
    }
  }
  if (!docked) {
    score -= 15;
    lines.push({ ok: false, text: 'Orbital docking clamps locked late by autopilot (-15)' });
  }
  if (s.lost) {
    score -= 5;
    lines.push({ ok: false, text: `${ITEM_BY_ID[s.lost].name} destroyed during EDL (-5)` });
  }
  return { score: Math.max(0, score), lines };
}

export function citationsUsed(s, ctx = {}) {
  const keys = new Set(['mola', 'rems', 'rad', 'themis', 'tau', 'pds', 'dsn', 'eyes', 'hirise']);
  if (ctx.layers?.includes('crism') || s.has.libs) keys.add('crism');
  if (ctx.layers?.includes('sharad') || s.flags.icePocket) keys.add('sharad');
  if (s.encounters.insight || s.fired?.quake) keys.add('seis');
  if (s.escapade) keys.add('escapade');
  if (s.scanned?.percache || s.abrasion?.percache) keys.add('m2020');
  if (s.has.moxie) keys.add('moxie');
  if (ctx.lunar) keys.add('alsep');
  if (s.route.cospar || s.has.rtg) keys.add('cospar');
  return [...keys].map((k) => ({ key: k, ...NASA_DATA[k] }));
}

export function citationsText(list, meta = {}) {
  const head = [
    'SOL 60: RED HORIZON · NASA Space Apps Challenge 2026',
    `NASA Data & Compliance Manifest${meta.blueprint ? ` · Blueprint ${meta.blueprint}` : ''}`,
    '',
  ];
  return head.concat(list.map((c, i) => `[${i + 1}] ${c.tag}. ${c.cite}`)).join('\n');
}

export function familyStatus(s) {
  return FAMILY.map((f) => ({ ...f, lit: !!s.family[f.id] }));
}

// Abrasion gauge: depth grows over 2 seconds to 120 microns.
export const ABRASION = { duration: 2, maxDepth: 120, zone: [40, 60] };

export function escapadeSync(commsKbps) {
  // Syncing needs a relay budget. The UHF baseline is enough; the dish makes it instant.
  return { ok: commsKbps >= 32, instant: commsKbps >= 150 };
}

export function describeLoadout({ vehicleId, windowId, mode }) {
  return `${VEHICLES[vehicleId]?.name || vehicleId} · ${WINDOWS[windowId]?.name || windowId} · ${MODES[mode]?.name || mode}`;
}
