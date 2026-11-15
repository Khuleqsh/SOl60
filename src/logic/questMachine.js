// SOL 60 — campaign quest state machine (pure). The game loop calls advance() each tick and reacts to its events.

export const STEPS = { LIFE: 1, POWER: 2, TRANSMIT: 3, ASCENT: 4 };

/** Initial quest state for a mode. */
export function createQuest(mode) {
  const ascent = mode === 'ascent';
  const expedition = mode === 'expedition';
  return {
    step: ascent ? STEPS.ASCENT : expedition ? STEPS.POWER : STEPS.LIFE,
    flag: expedition,
    shelter: false,
    farm: false,
    tuned: false,
    transmitting: false,
    transmitT: 0,
    replied: false,
    rocketT: -1,
    shipCalled: false,
    ledgeC: false,
    ledgeD: false,
    step4T: 0,
    summitSaid: false,
  };
}

/**
 * Advances step-to-step transitions. `devices` = { id: { done } }. `dt` counts down the Earth reply.
 * Returns an array of event names the game turns into radio lines, log entries and world changes.
 */
export function advance(q, devices, dt = 0) {
  const ev = [];
  if (q.step === STEPS.LIFE && q.flag && q.shelter && q.farm) {
    q.step = STEPS.POWER;
    ev.push('lifeSupportDone');
  }
  if (q.step === STEPS.POWER && ['sub1', 'sub2', 'weather'].every((id) => devices[id]?.done)) {
    q.step = STEPS.TRANSMIT;
    ev.push('gridRestored');
  }
  if (q.step === STEPS.TRANSMIT && q.transmitting) {
    q.transmitT -= dt;
    if (q.transmitT <= 0) {
      q.transmitting = false;
      q.replied = true;
      q.step = STEPS.ASCENT;
      ev.push('earthReplied');
    }
  }
  return ev;
}

/** Checklist rows for the HUD for the current campaign step. */
export function checklist(q, devices, extra = {}) {
  if (q.step === STEPS.LIFE)
    return [
      { label: 'Plant the mission flag', done: q.flag },
      { label: 'Secure a pressurized shelter (balance the airlock)', done: q.shelter },
      { label: 'Start Martian agriculture', done: q.farm },
    ];
  if (q.step === STEPS.POWER)
    return [
      { label: 'Solar Power Substation (route the power)', done: devices.sub1.done },
      { label: 'RTG Power Substation (route the power)', done: devices.sub2.done },
      { label: 'Calibrate REMS / MEDA weather station', done: devices.weather.done },
      { label: 'Optional: repair and charge the rover', done: devices.rover.done },
    ];
  if (q.step === STEPS.TRANSMIT)
    return [
      { label: 'Repair the relay transceiver', done: devices.relay.done },
      { label: 'Triangulate the high-gain dish', done: q.tuned },
      { label: 'Receive Earth’s reply', done: q.replied },
    ];
  return [
    { label: 'Tharsis Ledge shelter (bench 2)', done: q.ledgeC },
    { label: 'Caldera Wall shelter (bench 5)', done: q.ledgeD },
    { label: `Summit caldera${extra.pitonsLeft !== undefined ? ` · ${extra.pitonsLeft} pitons left` : ''}`, done: q.summitSaid },
    { label: 'Board the rescue rocket', done: false },
  ];
}
