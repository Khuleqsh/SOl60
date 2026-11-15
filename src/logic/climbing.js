// SOL 60 — Peak-inspired climbing rules (pure, framework-free): grip drain, glove regolith, pitons, fall arrest.

export const GRIP_MAX = 100;
export const ROPE_LENGTH = 5; // metres of slack below a piton before it catches you

/**
 * Grip change per second. Climbing drains it (faster with regolith-caked gloves, in dust storms and in the cold);
 * standing on solid ground recovers it. Hanging still on a piton recovers slowly.
 */
export function gripRate({ climbing, moving = true, onPiton = false, gloveDust = 0, dust = 0, tempC = -40 }) {
  if (!climbing) return 14;
  if (onPiton && !moving) return 6;
  const cold = tempC < -50 ? (-50 - tempC) / 60 : 0;
  return -(2.6 + (moving ? 0.8 : 0) + gloveDust * 4 + dust * 1.6 + cold * 1.2);
}

/** Regolith dust accumulates on the gloves while climbing (faster in storms); brushing clears it. */
export const gloveDustRate = (dust) => 0.022 * (1 + dust * 3);

/** O2 multiplier from exertion: climbing in thin air is hard work. */
export const climbO2Mul = (climbing) => (climbing ? 2.1 : 1);

/**
 * Places a piton at the player. Returns the new anchor, or null when there are none left.
 * The anchor remembers the wall direction so a caught fall puts you back on the face.
 */
export function placePiton(state, p) {
  if (!(state.pitons > 0)) return null;
  state.pitons--;
  state.anchor = { x: p.x, y: p.y, z: p.z, dx: p.climb ? p.climb.dx : 0, dz: p.climb ? p.climb.dz : 0 };
  state.pitonsUsed = (state.pitonsUsed || 0) + 1;
  return state.anchor;
}

/**
 * Rope arrest: if the player is falling and has dropped more than ROPE_LENGTH below the anchor, the rope catches
 * them on the face beneath the piton. Returns true if a fall was arrested. `ground(x, z)` is the terrain height.
 */
export function tryArrest(p, anchor, ground) {
  if (!anchor || p.grounded || p.climb || p.vy > -3) return false;
  if (anchor.y - p.y < ROPE_LENGTH) return false;
  if (Math.hypot(p.x - anchor.x, p.z - anchor.z) > 12) return false;
  const y = Math.max(anchor.y - ROPE_LENGTH * 0.6, ground(anchor.x, anchor.z) + 0.2);
  p.x = anchor.x;
  p.z = anchor.z;
  p.y = y;
  p.vx = p.vy = p.vz = 0;
  if (anchor.dx || anchor.dz) {
    p.climb = { dx: anchor.dx, dz: anchor.dz, t: 0 };
    p.grounded = false;
  }
  return true;
}

/** Anchors are left behind once you have moved well away from them. */
export const anchorStale = (anchor, p) => !anchor || Math.hypot(p.x - anchor.x, p.z - anchor.z) > 30 || p.y - anchor.y > 45;
