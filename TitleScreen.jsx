import { MODES } from '../game/data.js';
import { PATCH_ICONS, PATCH_RIMS } from '../systems/ultimateFeatures.js';
import { Btn, PatchImg, Tag } from './common.jsx';

const ICON_LABEL = { rocket: 'Rocket', rover: 'Rover', atom: 'Atom', mars: 'Mars' };

export function TitleScreen({ mode, setMode, seedText, setSeedText, patch, setPatch, patchUrl, onStart, onJudge, onArchive, blueprint, setBlueprint, onLoadBlueprint, blueprintError }) {
  const words = patch.motto.trim().split(/\s+/).filter(Boolean);
  return (
    <div className="title-screen">
      <div className="title-hero">
        <div className="eyebrow">NASA SPACE APPS CHALLENGE 2026 · GALE CRATER, MARS</div>
        <h1 className="logo">
          SOL 60<span>RED HORIZON</span>
        </h1>
        <p className="lede">
          Pack a lander in 60 seconds. Plan a traverse with real orbital data. Walk six sols across Gale Crater past the silent
          machines NASA left behind, and bring their memories home.
        </p>
        <div className="title-actions">
          <Btn tone="amber" className="btn-xl" onClick={onStart}>
            Begin Mission Briefing
          </Btn>
          <Btn tone="ghost" onClick={onArchive}>
            NASA Hardware Archive
          </Btn>
          <button type="button" className="judge-link" onClick={onJudge} title="Auto-equips a viable loadout and compresses every stage into about 90 seconds">
            ▶ Judge Quick-Tour (90 s demo)
          </button>
        </div>
      </div>

      <div className="title-grid">
        <section className="panel">
          <header className="panel-head">Play Mode</header>
          <div className="mode-list">
            {Object.values(MODES).map((m) => (
              <button key={m.id} type="button" className={`mode-card ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)}>
                <span className="mode-tag">{m.tag}</span>
                <strong>{m.name}</strong>
                <span>{m.blurb}</span>
              </button>
            ))}
          </div>
          <label className="field">
            <span>
              Mission Seed <small>(same seed = same weather)</small>
            </span>
            <input value={seedText} maxLength={24} onChange={(e) => setSeedText(e.target.value.toUpperCase())} placeholder="GALE-2026" />
          </label>
          <div className="seed-chips">
            {['GALE-2026', 'DUST-STORM', 'BLUE-SUNSET'].map((s) => (
              <button type="button" key={s} className="chip" onClick={() => setSeedText(s)}>
                {s}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setSeedText('')}>
              RANDOM
            </button>
          </div>
          <Tag k="rems" />
        </section>

        <section className="panel">
          <header className="panel-head">Mission Patch Designer</header>
          <div className="patch-designer">
            <PatchImg src={patchUrl} size={150} className="patch-big" />
            <div className="patch-controls">
              <div className="field-label">Icon</div>
              <div className="chip-row">
                {PATCH_ICONS.map((i) => (
                  <button type="button" key={i} className={`chip ${patch.icon === i ? 'on' : ''}`} onClick={() => setPatch({ ...patch, icon: i })}>
                    {ICON_LABEL[i]}
                  </button>
                ))}
              </div>
              <div className="field-label">Rim colour</div>
              <div className="chip-row">
                {PATCH_RIMS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-label={`Rim ${c}`}
                    className={`swatch ${patch.rim === c ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => setPatch({ ...patch, rim: c })}
                  />
                ))}
              </div>
              <label className="field">
                <span>
                  3-word motto <small>({words.length}/3)</small>
                </span>
                <input
                  value={patch.motto}
                  maxLength={30}
                  onChange={(e) => setPatch({ ...patch, motto: e.target.value.toUpperCase().split(/\s+/).slice(0, 3).join(' ') })}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">How it works</header>
          <ol className="howto">
            <li>
              <b>Bunker</b>: 60 s to pack 12 NASA modules within mass and budget.
            </li>
            <li>
              <b>Mars Map</b>: 6 orbital data layers. Place 3 waypoints.
            </li>
            <li>
              <b>Surface</b>: land with the sky crane, survive 6 sols, preserve or salvage ghost hardware.
            </li>
            <li>
              <b>Debrief</b>: root cause, What-If lab, MSR grade, Mars selfie.
            </li>
          </ol>
          <div className="keys">
            <span>
              <kbd>WASD</kbd> walk
            </span>
            <span>
              <kbd>Drag</kbd> orbit
            </span>
            <span>
              <kbd>E</kbd>/<kbd>Click</kbd> grab
            </span>
            <span>
              <kbd>X</kbd> X-ray
            </span>
          </div>
          <label className="field">
            <span>Load Mission Blueprint</span>
            <input value={blueprint} onChange={(e) => setBlueprint(e.target.value)} placeholder="SOL60|SLS-HOH|FD|..." />
          </label>
          <Btn small onClick={onLoadBlueprint} disabled={!blueprint.trim()}>
            Load blueprint
          </Btn>
          {blueprintError && <div className="err">{blueprintError}</div>}
        </section>
      </div>
    </div>
  );
}
