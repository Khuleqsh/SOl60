// SOL 60 — rover energy economy (pure). Battery in % of capacity; rates are per in-game second.
//
// Real reference: Curiosity's MMRTG gives ~110 W and charges Li-ion batteries that cover driving peaks; Spirit and
// Opportunity lived on solar panels that dust slowly smothered. The game compresses a sol into minutes, so rates are
// tuned for play, but the RELATIVE costs follow the real budget: driving and climbing dominate, heaters matter at
// night, dust cuts solar output, and a deployed array pointed at the Sun recharges fastest.

export const ROVER_CAPACITY_WH = 4200; // display only: % -> Wh

/** Power draw in %/s. speed m/s, grade = rise/run (+ uphill), tempC ambient, lights/scanner booleans. */
export function roverDrain({ speed = 0, grade = 0, tempC = -40, lights = false, scanning = false }) {
  const sp = Math.abs(speed);
  const drive = sp * 0.085; // ~0.8 %/s at full speed on flat ground
  const climb = sp > 0.1 ? Math.max(0, grade) * sp * 0.55 : 0; // inclines cost a lot
  const heater = tempC < -20 ? ((-20 - tempC) / 60) * 0.06 : 0; // keeping the electronics warm
  return 0.015 + drive + climb + heater + (lights ? 0.04 : 0) + (scanning ? 0.06 : 0);
}

/**
 * Solar input in %/s for the rover's own deck panels plus an optional deployed array.
 * sunElev: sine of the Sun's elevation (<=0 at night); panelDust 0..1; atmosDust 0..1 (storm opacity);
 * arrayAlign 0..1 (cosine of the angle between the array normal and the Sun) or null if no array is deployed.
 */
export function roverSolar({ sunElev, panelDust = 0, atmosDust = 0, arrayAlign = null, chargeMul = 1 }) {
  if (sunElev <= 0) return 0;
  const sun = Math.sqrt(sunElev) * (1 - atmosDust * 0.8);
  const deck = 0.05 * sun * (1 - panelDust);
  const array = arrayAlign === null ? 0 : 0.55 * sun * Math.max(0, arrayAlign) * (1 - panelDust * 0.3);
  return (deck + array) * chargeMul;
}

/** Charging from a repaired substation whose power routing has been completed (%/s). */
export const stationCharge = (chargeMul = 1) => 1.6 * chargeMul;

/** Dust settles on the panels: slowly always, fast inside a dust front (per second, 0..1). */
export const panelDustRate = (atmosDust) => 0.0008 + atmosDust * 0.012;

/** One tick of the rover battery. state = { pct, cap }; returns { drain, charge } in %/s. */
export function stepRoverBattery(state, inputs, dt) {
  const drain = inputs.driving ? roverDrain(inputs) : 0.004;
  const charge = roverSolar(inputs) + (inputs.station ? stationCharge(inputs.chargeMul) : 0) + (inputs.trickle || 0);
  const capMul = state.capMul || 1;
  state.pct = Math.min(100, Math.max(0, state.pct + ((charge - drain) / capMul) * dt));
  return { drain, charge };
}

/** Watt-hours shown on the HUD for a battery percentage. */
export const pctToWh = (pct, capMul = 1) => Math.round((pct / 100) * ROVER_CAPACITY_WH * capMul);

/** Solar array alignment: cosine between the panel normal (azimuth, tilt in radians) and the Sun direction. */
export function arrayAlignment(azimuth, tilt, sunDir) {
  const nx = Math.sin(tilt) * Math.sin(azimuth);
  const ny = Math.cos(tilt);
  const nz = -Math.sin(tilt) * Math.cos(azimuth);
  const l = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
  return Math.max(0, (nx * sunDir.x + ny * sunDir.y + nz * sunDir.z) / l);
}
