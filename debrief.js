// Post-mission analysis: root-cause diagnosis and counterfactual engineering advice.

import { ITEM_BY_ID, HARDWARE, CRATERS } from './data.js';
import {
  contractResult,
  msrGrade,
  certification,
  blueprintCode,
  citationsUsed,
  familyStatus,
} from '../systems/nasaDataIntegrations.js';

const itemLine = (id) => {
  const i = ITEM_BY_ID[id];
  return `${i.name} (${i.mass} kg, $${i.cost}M)`;
};

export function buildDebrief(s, ctx = {}) {
  const win = s.done && s.alive;
  const deathSol = s.alive ? null : Math.min(6, Math.floor(s.deathT) + 1);
  const has = s.has;
  const f = s.flags;
  const storm = s.weather.filter((w) => w.storm > 0);
  const peakTau = Math.max(...s.weather.map((w) => w.tau));
  const stormRange = `Sol ${storm[0].sol} to Sol ${storm[storm.length - 1].sol}`;
  const diedInStorm = deathSol && storm.some((w) => w.sol === deathSol);
  const routeRad = s.route.samples.reduce((a, p) => a + p.rad, 0) / s.route.samples.length;
  const routeSlope = s.route.samples.reduce((a, p) => a + p.slope, 0) / s.route.samples.length;
  const coldCamps = s.route.camps.filter((c) => c.freeze > 0.45).map((c) => c.sol);

  const preserved = Object.entries(s.encounters).filter(([, v]) => v === 'preserve').map(([k]) => k);
  const salvaged = Object.entries(s.encounters).filter(([, v]) => v === 'salvage').map(([k]) => k);
  const missed = HARDWARE.filter((h) => !(h.id in s.encounters)).map((h) => h.id);

  const medals = [];
  if (f.legacyMedal) medals.push({ name: 'Legacy Medal', why: "Returned Opportunity's final telemetry" });
  if (preserved.includes('insight')) medals.push({ name: 'Seismic Archivist', why: 'Recovered the marsquake core archive' });
  if (preserved.includes('ingenuity')) medals.push({ name: 'Wright Brothers Field', why: "Recovered Ingenuity's flight recorder" });
  if (preserved.includes('spirit')) medals.push({ name: 'Free Spirit', why: "Beamed Spirit's logs out of Troy" });
  if (preserved.length === 4) medals.push({ name: 'Ghost Fleet Guardian', why: 'Preserved all four legacy missions' });
  if (win && s.sciDrill > 0) medals.push({ name: 'Deep Time', why: 'Returned subsurface cores' });

  if (s.flags.dragWheel) medals.push({ name: 'Home Plate Silica', why: 'Dragged-wheel silica discovery' });
  if (s.flags.synergy) medals.push({ name: 'Family Portrait', why: 'All six NASA Mars machines lit in gold' });
  if (s.flags.petRock) medals.push({ name: 'Mars Pet Rock', why: 'Adopted a ventifact mascot' });
  const contract = contractResult(s, ctx.contract);
  if (contract?.ok) medals.push({ name: `Contract: ${contract.short}`, why: contract.why });
  const o2Pct = (s.o2 / s.o2Cap) * 100;
  const cert = certification(s, { docked: ctx.docked !== false });
  const score = Math.round(
    s.science +
      (win ? 500 : 0) +
      (win ? (s.power + o2Pct) * 2 : 0) +
      medals.length * 150 +
      (contract?.award || 0) +
      (win ? cert.score * 3 : 0),
  );
  const rank = !win
    ? 'LOSS OF CREW'
    : score >= 4200
      ? 'FLAGSHIP-CLASS MISSION'
      : score >= 2800
        ? 'DISCOVERY-CLASS MISSION'
        : score >= 1600
          ? 'SCOUT-CLASS MISSION'
          : 'TECHNOLOGY DEMONSTRATION';

  let headline;
  let causeLabel;
  let diagnosis = [];
  let rec = { title: '', text: '', item: null, layer: null };

  if (win) {
    headline = 'MISSION SUCCESS';
    causeLabel = 'Summit reached, Sol 6';
    diagnosis.push(
      `You stood on Mount Sharp with ${Math.round(s.power)}% battery, ${Math.round(o2Pct)}% oxygen and a cumulative dose of ${Math.round(s.rad)}% of the acute limit.`,
    );
    const why = [];
    if (has.rtg)
      why.push(
        `The MMRTG converts Pu-238 decay heat to electricity, so it held 35 W while optical depth reached tau ${peakTau.toFixed(1)} and sunlight at the surface fell by more than 95%.`,
      );
    else if (has.solar)
      why.push(
        `Solar alone is a gamble: the storm of ${stormRange} cut UltraFlex output to about 2 W. Your battery reserve was just deep enough to bridge it.`,
      );
    if (has.eclss) why.push('The closed-loop ECLSS recycled exhaled CO2 and water back into oxygen, independent of weather.');
    if (has.moxie)
      why.push(
        `MOXIE split atmospheric CO2 (95% of the 730 Pa air) into oxygen${s.stats.moxieClogged ? ', though dust clogged its intake during the storm' : ''}.`,
      );
    if (has.shield) why.push('Hydrogen-rich polyethylene absorbed three quarters of the particle dose.');
    if (has.aerogel) why.push('Aerogel held the suit above its rating through nights near -80 °C.');
    diagnosis.push(...why.slice(0, 4));
    if (!why.length) diagnosis.push('You survived on raw margin and good routing. That will not work twice.');

    // What would have scored higher?
    if (missed.length) {
      const names = missed.map((id) => HARDWARE.find((h) => h.id === id).name).join(', ');
      rec = {
        title: 'Route closer to the ghosts',
        text: `Your route never came within range of ${names}. Each legacy site is worth 250 to 400 Science Data. In Stage 2, place waypoints so the path passes inside their cyan rings.`,
        layer: null,
      };
    } else if (!has.libs) {
      rec = {
        title: 'Pack the laser',
        item: 'libs',
        text: `${itemLine('libs')} multiplies all in-situ science by 2.5. On this route that was worth about ${Math.round(s.sciInSitu * 1.5 + s.sciDrill * 1.5)} more Science Data.`,
      };
    } else if (!has.dish && preserved.length) {
      rec = {
        title: 'Bring the bandwidth',
        item: 'dish',
        text: `${itemLine('dish')} lifts comms from 32 to 182 kbps. Without it, half of each legacy archive never left Mars: about ${Math.round(s.sciLegacy - (f.legacyMedal ? 400 : 0))} Science Data lost.`,
      };
    } else if (salvaged.length) {
      const names = salvaged.map((id) => HARDWARE.find((h) => h.id === id).name).join(', ');
      rec = {
        title: 'Preserve instead of salvage',
        text: `You stripped ${names} for parts. With more power and thermal margin packed in Stage 1, you could have preserved them and banked their archives instead.`,
      };
    } else if (!has.drill && s.route.craters.length) {
      rec = {
        title: 'Drill the craters you crossed',
        item: 'drill',
        text: `Your route crossed ${s.route.craters.length} crater floor${s.route.craters.length > 1 ? 's' : ''}. ${itemLine('drill')} would have pulled a 2 m core from each: ${150 * (has.libs ? 2.5 : 1)} Science Data apiece.`,
      };
    } else {
      rec = {
        title: 'Flight-ready',
        text: 'No single change dominates. Try the lighter Atlas-Express for a tighter constraint puzzle, or route across more crater floors with the drill.',
      };
    }
  } else if (s.cause === 'hypothermia') {
    headline = 'LOSS OF CREW';
    causeLabel = `Hypothermia, Sol ${deathSol}`;
    const rating = has.aerogel ? -85 : -60;
    diagnosis.push(
      `Core temperature fell below 28 °C on the night of Sol ${deathSol}. Mars has an atmosphere of just 730 Pa, 0.7% of Earth's. That thin CO2 holds almost no heat, so when the Sun sets the ground radiates straight to space.`,
    );
    diagnosis.push(
      `REMS lows ran near ${Math.min(...s.weather.map((w) => w.nightT))} °C. Your suit was rated to ${rating} °C, and the worst camp (Sol ${s.stats.coldestSol}) was effectively ${Math.round(s.stats.coldestEff)} °C at your skin loop.`,
    );
    if (s.stats.coldestFreeze > 0.45)
      diagnosis.push(
        'That camp sat on low-thermal-inertia dust. Loose fines store little daytime heat and cool about 12 °C below bedrock by dawn.',
      );
    if (s.vehicle.thermalDrift < 0)
      diagnosis.push('The 260-day SLS cruise let the heater loop drift 6 °C out of calibration, which you carried every night.');
    if (!has.aerogel) {
      rec = {
        title: 'Counterfactual: line the suit',
        item: 'aerogel',
        text: `${itemLine('aerogel')} would have extended the suit rating from -60 °C to -85 °C. Silica aerogel is 99% trapped gas and conducts 0.015 W/m·K. Every night of this mission stays inside that envelope on bedrock.`,
      };
    } else if (!has.rtg) {
      rec = {
        title: 'Counterfactual: carry your own heat',
        item: 'rtg',
        text: `${itemLine('rtg')} sheds about 2 kW of waste heat. Plumbed into the suit loop it is worth +15 °C every night, on top of 35 W of storm-proof power.`,
      };
    } else {
      rec = {
        title: 'Counterfactual: read the TES layer',
        layer: 'thermal',
        text: `Camps on Sols ${coldCamps.join(', ') || s.stats.coldestSol} sat in freeze zones. Toggle TES Thermal Inertia in Stage 2 and shift waypoints so the Sol markers land on orange bedrock. Spirit's heater units (+20 °C) are a second way out.`,
      };
    }
  } else if (s.cause === 'radiation') {
    headline = 'LOSS OF CREW';
    causeLabel = `Radiation Sickness, Sol ${deathSol}`;
    diagnosis.push(
      `Cumulative dose crossed the acute threshold on Sol ${deathSol}. Mars lost its global magnetic field about 4 billion years ago, and its atmosphere is a column of only 16 g/cm² (Earth: 1,030). Galactic cosmic rays and solar protons reach the surface nearly unimpeded.`,
    );
    diagnosis.push(
      `Curiosity's RAD instrument measures a background of about 0.67 mSv per sol. The solar particle event${f.speDose > 30 ? 's' : ''} added ${Math.round(f.speDose)} points of your dose in hours${f.sheltered ? '' : ', and you did not take cover'}.`,
    );
    if (routeRad > 0.4)
      diagnosis.push('Your route also held high ground for long stretches. Every kilometre of altitude is less air overhead.');
    if (s.vehicle.transitRad > 10)
      diagnosis.push('The slow SLS transfer added 14 points of deep-space dose before you ever touched down.');
    if (!has.shield) {
      rec = {
        title: 'Counterfactual: bring hydrogen',
        item: 'shield',
        text: `${itemLine('shield')} cuts dose by 75%. Hydrogen nuclei are the same mass as the incoming protons, so they stop them efficiently and shatter heavy ions without a spray of secondary neutrons. Your final dose would have been about ${Math.round(s.rad * 0.3)}%.`,
      };
    } else {
      rec = {
        title: 'Counterfactual: read the RAD layer',
        layer: 'rad',
        text: `Shielding was aboard but the route maximised exposure. Toggle RAD Space Weather in Stage 2, keep waypoints in the dark-violet lowlands until the final climb, and dig in during particle events. ${has.medkit ? '' : itemLine('medkit') + ' buys one more recovery.'}`,
      };
    }
  } else if (s.cause === 'power') {
    headline = 'LOSS OF CREW';
    causeLabel = `Power Blackout, Sol ${deathSol}`;
    diagnosis.push(
      `The battery bus reached 0% on Sol ${deathSol}. With no power the CO2 scrubber fans stop, the heater loop goes cold and the suit becomes a sealed bag.`,
    );
    if (diedInStorm && (has.solar || f.wing) && !has.rtg)
      diagnosis.push(
        `The dust storm of ${stormRange} raised optical depth to tau ${peakTau.toFixed(1)}. Direct sunlight scales as e^-tau, so your arrays fell from 55 W to about 2 W. This is exactly what silenced Opportunity in June 2018.`,
      );
    else if (!has.rtg && !has.solar)
      diagnosis.push('You launched with no generation at all. A 120 W·sol battery cannot run a 40 W suit for six sols.');
    else
      diagnosis.push(
        `Generation never covered the load: 40 W of suit baseline${has.moxie ? ', 15 W for MOXIE' : ''}, night heaters up to 24 W, and mobility on a ${s.route.km.toFixed(0)} km route.`,
      );
    if (has.moxie && has.rtg && !has.solar)
      diagnosis.push('A single MMRTG yields 35 W. MOXIE alone takes 15 W of that, leaving the suit in permanent deficit.');
    if (!has.rtg) {
      rec = {
        title: 'Counterfactual: go nuclear',
        item: 'rtg',
        text: `${itemLine('rtg')} delivers a constant 35 W from radioactive decay, day and night, at any optical depth. Through the storm that is the difference between a ${Math.round(40 - 35)} W shortfall and a ${Math.round(40 - 2)} W one.`,
      };
    } else if (!has.solar) {
      rec = {
        title: 'Counterfactual: add a second source',
        item: 'solar',
        text: `${itemLine('solar')} is the cheapest watts available: +55 W on clear sols recharges the battery ahead of the storm, and the MMRTG carries you through it.${has.moxie ? ' Or leave MOXIE behind and save 15 W.' : ''}`,
      };
    } else {
      rec = {
        title: 'Counterfactual: read the MOLA layer',
        layer: 'slope',
        item: has.lidar ? null : 'lidar',
        text: `Mean slope load on your route was ${Math.round(routeSlope * 100)}%. Toggle MOLA Topography in Stage 2 and keep to the green. ${has.lidar ? '' : itemLine('lidar') + ' halves steep-terrain drain.'} Salvaging Opportunity's cells (+30%) is the emergency option.`,
      };
    }
  } else {
    headline = 'LOSS OF CREW';
    causeLabel = `Oxygen Depletion, Sol ${deathSol}`;
    diagnosis.push(
      `Suit oxygen ran out on Sol ${deathSol}. The Martian atmosphere is 95% CO2 at 730 Pa: there is nothing to breathe and no pressure to breathe it at.`,
    );
    if (!has.eclss && !has.moxie)
      diagnosis.push('Base tanks hold three sols of oxygen. You launched on a six-sol traverse with no way to make or recycle more.');
    if (has.moxie && s.stats.moxieClogged)
      diagnosis.push(
        'MOXIE pulls Martian air through a HEPA filter. During the storm, dust loading cut its output by up to 65%, just as your reserves ran thin.',
      );
    if (f.leaked > 0.2)
      diagnosis.push(
        `The suit seal leak vented ${Math.round((f.leaked / s.o2Cap) * 100)}% of your tank to an ambient pressure of 0.7% of Earth sea level.`,
      );
    if (f.injured) diagnosis.push('The fall on the slope raised your metabolic rate, and oxygen use, by 20%.');
    if (routeSlope > 0.2 && !has.lidar)
      diagnosis.push('Steep ground on your route pushed breathing rate well above the resting 0.84 kg of O2 per day.');
    if (!has.eclss) {
      rec = {
        title: 'Counterfactual: close the loop',
        item: 'eclss',
        text: `${itemLine('eclss')} adds four sols of endurance by reducing exhaled CO2 back to oxygen in a Sabatier reactor. It does not care about dust or sunlight.${has.moxie ? '' : ' MOXIE is the lighter alternative, if you can power and clean it.'}`,
      };
    } else if (!has.moxie && !has.lidar) {
      rec = {
        title: 'Counterfactual: spend less air',
        item: 'lidar',
        layer: 'slope',
        text: `ECLSS gave seven sols, but slopes and the leak consumed the margin. ${itemLine('lidar')} halves terrain exertion, and the MOLA layer in Stage 2 shows where the walls are.`,
      };
    } else {
      rec = {
        title: 'Counterfactual: protect the seals',
        item: has.brush ? 'medkit' : 'brush',
        text: has.brush
          ? `${itemLine('medkit')} seals a suit leak completely in one application.`
          : `${itemLine('brush')} keeps perchlorate dust off suit seals and the MOXIE intake filter: no leak, and oxygen production holds at 85% through the storm.`,
      };
    }
  }

  const cost = s.packed.reduce((a, id) => a + ITEM_BY_ID[id].cost, 0) + (ctx.extraCost || 0);
  const mass = s.packed.reduce((a, id) => a + ITEM_BY_ID[id].mass, 0);
  const efficiency = cost > 0 ? s.science / cost : 0;
  const msr = msrGrade({ science: s.science, cost: cost + (s.vehicle.budget ? 0 : 0), mass, alive: s.alive && s.done });
  const blueprint = blueprintCode({
    vehicleId: s.vehicle.id,
    windowId: s.vehicle.windowId,
    mode: s.mode,
    packed: s.packed,
    waypoints: s.route.waypoints,
    seedText: ctx.seedText,
    contractId: ctx.contract?.id,
  });
  return {
    contract,
    cert,
    cost,
    mass,
    efficiency,
    msr,
    blueprint,
    citations: citationsUsed(s, ctx),
    family: familyStatus(s),
    badges: { petRock: s.flags.petRock, synergy: s.flags.synergy },
    lost: s.lost,
    win,
    headline,
    causeLabel,
    rank,
    score,
    diagnosis,
    rec,
    medals,
    deathSol,
    stats: {
      power: Math.max(0, s.power),
      o2: Math.max(0, o2Pct),
      rad: Math.min(100, s.rad),
      thermal: Math.max(0, s.thermal),
      focus: Math.max(0, s.focus),
      comms: s.comms,
      sciBonus: Math.round(s.sciBonus),
      science: Math.round(s.science),
      sciInSitu: Math.round(s.sciInSitu),
      sciLegacy: Math.round(s.sciLegacy),
      sciDrill: Math.round(s.sciDrill),
      km: s.route.km,
    },
    encounters: HARDWARE.map((h) => ({
      id: h.id,
      name: h.name,
      result: s.encounters[h.id] || 'missed',
    })),
    craters: s.route.craters.map((c) => ({
      name: CRATERS.find((k) => k.id === c.id).name,
      drilled: !!s.craterHits[c.id],
    })),
    history: s.history,
    marks: s.marks,
    weather: s.weather,
    endT: s.alive ? s.T : s.deathT,
    vehicle: s.vehicle,
    packed: s.packed,
    log: s.log,
  };
}
