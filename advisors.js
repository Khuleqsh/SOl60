// Three department advisors who disagree with each other on purpose.
// Dr. Vance wants science, Cmdr. Reyes wants you alive, Flight Director Sato wants bandwidth and budget.

import { ITEM_BY_ID } from './data.js';

const PICK = {
  rtg: [
    ['reyes', 'MMRTG aboard. Storm or no storm, the lights stay on. Good call.'],
    ['sato', '$140M for one battery. That is a third of the budget, Commander.'],
  ],
  solar: [
    ['sato', 'UltraFlex is the cheapest watt we can buy. Twenty kilos for 55 watts.'],
    ['reyes', 'Solar only works when there is sun. Opportunity learned that the hard way.'],
  ],
  shield: [
    ['reyes', 'Polyethylene shielding. Forty kilos of hydrogen between you and the Sun. I sleep better.'],
    ['vance', 'Forty kilos is a whole spectrometer. Are we explorers or a bunker?'],
  ],
  dish: [
    ['sato', 'Ka-band dish: 182 kbps. Without it the legacy archives never leave Mars.'],
    ['vance', 'The dish lets us send home what Spirit and Opportunity remember. Worth every gram.'],
  ],
  brush: [
    ['vance', 'The electrostatic brush keeps the optics clean. Dirty lenses are blind science.'],
    ['reyes', 'Dust brush also protects your suit seals. Cheap insurance.'],
  ],
  libs: [
    ['vance', 'LIBS! Two and a half times the science. Now we can read the boxwork veins.'],
    ['sato', '$110M on a laser. I hope it pays for itself in data.'],
  ],
  eclss: [
    ['reyes', 'Closed-loop ECLSS: four more sols of breathable air. Non-negotiable in my book.'],
    ['sato', 'Fifty kilos and $130M. The heaviest thing on the pallet.'],
  ],
  aerogel: [
    ['reyes', 'Aerogel liner rated to −85 °C. Gale nights hit −79 before the ground even starts.'],
  ],
  moxie: [
    ['vance', 'MOXIE makes oxygen out of Martian air. Perseverance proved it works.'],
    ['reyes', 'MOXIE eats 15 watts and clogs in dust. Do not bet your lungs on it alone.'],
  ],
  lidar: [
    ['reyes', 'Hazard LiDAR halves the drain on the slopes. Your knees will thank you.'],
    ['vance', 'LiDAR can also find lava tubes. Subsurface science and shelter in one.'],
  ],
  drill: [
    ['vance', 'Deep-core drill: two metres below the sterilised crust. That is where life would hide.'],
    ['sato', 'Remember COSPAR, Doctor. Drilling into ice means sterilising first.'],
  ],
  medkit: [
    ['reyes', 'Med-Gel kit. One use only. Make it count.'],
  ],
};

const DROP = {
  rtg: ['reyes', 'You just put the storm-proof power back on the shelf. Think hard about that.'],
  eclss: ['reyes', 'Without ECLSS you have three sols of air for a six-sol walk.'],
  libs: ['vance', 'No spectrometer? Then what exactly are we going to Mars to learn?'],
  dish: ['sato', 'No dish means the UHF relay. Half of every archive stays behind.'],
  shield: ['reyes', 'No shielding. Mars has no magnetic field, Commander.'],
};

export function advisorOnToggle(id, packed) {
  const lines = packed ? PICK[id] : DROP[id] ? [DROP[id]] : null;
  if (!lines) return null;
  const [who, text] = lines[Math.floor(Math.random() * lines.length)];
  return { who, text };
}

export function advisorBunkerTip(stats, packed, contract) {
  const has = (i) => packed.includes(i);
  if (stats.overload) return { who: 'sato', text: `PAYLOAD OVERLOAD. We are ${stats.mass - stats.maxMass} kg over. Drop something or we do not fly.` };
  if (stats.overBudget) return { who: 'sato', text: 'We are over budget. Congress will not fund that pallet.' };
  if (!has('rtg') && !has('solar')) return { who: 'reyes', text: 'You have no power source at all. The suit needs 40 watts just to keep you breathing.' };
  if (!has('eclss') && !has('moxie')) return { who: 'reyes', text: 'Three sols of oxygen. Six-sol traverse. Do the arithmetic.' };
  if (contract) {
    const miss = contract.requires.filter((r) => !has(r));
    if (miss.length) return { who: contract.id === 'rescue' ? 'sato' : 'vance', text: `The ${contract.short} contract needs ${miss.map((m) => ITEM_BY_ID[m].short).join(' and ')}.` };
  }
  if (!has('libs')) return { who: 'vance', text: 'Still no spectrometer. A walk without science is just a very expensive hike.' };
  if (!has('aerogel') && !has('rtg')) return { who: 'reyes', text: 'Nothing keeps you warm at −80 °C. Aerogel or the MMRTG, please.' };
  return null;
}

export function advisorOnRoute(assess, has) {
  const out = [];
  const slope = assess.hazards.find((h) => h.id === 'slope');
  const rad = assess.hazards.find((h) => h.id === 'rad');
  if (assess.hardware.length >= 3) out.push({ who: 'vance', text: `This line passes ${assess.hardware.length} silent machines. Their logs could double our science.` });
  else if (assess.hardware.length === 0) out.push({ who: 'vance', text: 'This route skips every legacy site. Bring it inside the cyan rings.' });
  if (slope.value > 0.6) out.push({ who: 'reyes', text: has.lidar ? 'Steep, but LiDAR will find the line.' : 'Those slopes will eat your oxygen without LiDAR.' });
  if (rad.value > 0.6) out.push({ who: 'reyes', text: 'That high ground is a radiation hot zone. Keep low until the final climb.' });
  if (assess.cospar) out.push({ who: 'sato', text: 'You are crossing a COSPAR Special Region. Sterilize, or the certification board will hear about it.' });
  if (assess.km > 70) out.push({ who: 'sato', text: `${assess.km.toFixed(0)} km is a long walk. Longer route, more drain.` });
  return out;
}

export function advisorOnSurface(event, s) {
  switch (event) {
    case 'start':
      return { who: 'sato', text: `Light-time is 14 minutes 22 seconds. By the time we hear you, it already happened. You are on your own.` };
    case 'storm':
      return s.has.rtg
        ? { who: 'reyes', text: 'Storm wall incoming. The MMRTG does not care. Keep walking.' }
        : { who: 'reyes', text: 'Storm wall incoming. Your arrays are about to go dark. Conserve.' };
    case 'preserve':
      return { who: 'vance', text: 'Beautiful. Their science lives again, and the mesh just got stronger.' };
    case 'salvage':
      return { who: 'vance', text: 'You stripped it for parts. Necessary, maybe. But we lost that archive forever.' };
    case 'lowO2':
      return { who: 'reyes', text: 'Oxygen under 25%. Slow your pace and skip anything optional.' };
    case 'lowPower':
      return { who: 'reyes', text: 'Battery under 20%. Heaters will cut out tonight if this continues.' };
    case 'mro':
      return { who: 'sato', text: 'MRO is overhead. Transmit everything now: double bandwidth for this pass.' };
    case 'focus':
      return { who: 'reyes', text: 'Your focus is slipping. Look up at sunset: Earth is out there.' };
    case 'eclipse':
      return { who: 'vance', text: s.has.libs ? 'Phobos is crossing the Sun! Point the spectrometer, we will never get this angle again.' : 'Phobos transit. No spectrometer to record it. Pity.' };
    case 'quake':
      return { who: 'vance', text: s.encounters.insight === 'preserve' ? 'InSight is listening with us. Triangulate!' : 'A marsquake. If only InSight were awake.' };
    default:
      return null;
  }
}
