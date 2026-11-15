// SOL 60 — WebGL capability detection (runs before any Three.js code is loaded).

/**
 * Returns { ok, version, renderer, reason }. Creates a throwaway canvas, asks for WebGL2 then WebGL1, and releases
 * the context immediately so it does not count against the browser's context limit.
 */
export function detectWebGL(doc = globalThis.document) {
  if (!doc?.createElement) return { ok: false, version: 0, renderer: '', reason: 'No browser document available.' };
  try {
    const canvas = doc.createElement('canvas');
    let gl = canvas.getContext('webgl2');
    let version = 2;
    if (!gl) {
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      version = 1;
    }
    if (!gl) return { ok: false, version: 0, renderer: '', reason: 'WebGL is disabled or unsupported in this browser.' };
    let renderer = '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, version, renderer, reason: '' };
  } catch (err) {
    return { ok: false, version: 0, renderer: '', reason: String(err?.message || err) };
  }
}

/** True when the user asked the OS for reduced motion. */
export const prefersReducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** True on touch-first devices (phones, tablets). */
export const prefersTouch = () => !!globalThis.matchMedia?.('(pointer: coarse)').matches;
