# SOL 60: RED HORIZON — *Echoes of Ares-7*

**[▶ Play Live in Browser](https://khuleqsh.github.io/SOl60/)** — Zero install required (Chrome, Edge, Firefox, or Safari with WebGL).

A 3D Mars survival, science and mountain-ascent game for the **2026 NASA Space Apps Challenge**.
React 19 · Three.js r172 · Vite 8 · Tailwind 4 · Web Audio · Vitest. Everything is procedural: no external models,
textures or sound files.

---

## ▶ 60-Second Judge Path

1. Launch the live build at **[https://khuleqsh.github.io/SOl60/](https://khuleqsh.github.io/SOl60/)** directly in your browser (or run locally with `npm install` then `npm run dev` in Chrome, Edge, Firefox, or Safari with WebGL).
2. On the title screen click the big **▶ 60-Second Judge Path (Quick-Tour)** button. No setup, no loadout.
3. Sit back for about a minute. The autopilot shows:
   - the Ares-7 descent into Gale Crater, with the **scale disclosure** in the subtitles;
   - the **live NASA data overlay**: simulated temperature, pressure, wind, UV and gravity next to the published REMS / MEDA / NSSDC ranges, each with a clickable source;
   - the **visual Morse beacon HUD** with live captions;
   - the **power-routing** and **spectroscopy** puzzles being solved;
   - a **rover drive** with the energy economy on screen;
   - a dust storm drawn as a **layered cloud front**, and a **marsquake** with P-wave warning and cliff rockfall;
   - a real **cliff climb on Olympus Mons**, then the summit rescue.
4. Drag the mouse (or a finger) during any cutscene to look around 360°. Press **Space** to skip.

Everything else (Full Story Campaign, Olympus Mons Ascent, Science Expedition, Cadet Sandbox) sits right beside
it on the title screen.

> **⚠ Compressed Simulation Zone — Not to Scale / Regions Combined for Mission Playability.**
> Olympus Mons is ~21.9 km above the Mars datum and ~624 km across, in the Tharsis region (18.65° N 226.2° E).
> Gale Crater is 154 km wide, and its Aeolis Mons (Mount Sharp) rises 5.5 km above the floor (5.4° S 137.8° E).
> The two are ~5,340 km apart. The game squeezes both into one 1.2 km zone. Geology, weather and physics follow
> NASA data; distances and heights do not. The notice appears on the title screen, the loading screen, the
> opening cutscene, the bunker, the Codex and the debrief, with a real-vs-in-game table computed from the game's
> own constants.

---

## Setup

No local setup is needed to play—open **[https://khuleqsh.github.io/SOl60/](https://khuleqsh.github.io/SOl60/)** directly in any WebGL-capable browser. To run the dev server or test suite locally:

```bash
npm install
npm run dev      # development server
npm test         # Vitest: logic, data-integrity and boot smoke tests
npm run build    # production build (code-split; no chunk-size warnings suppressed)
npm run preview  # serve the production build
```

Local builds require Node 20+ and a WebGL-capable browser. The title screen detects WebGL first and explains what to do if
it is missing. A crashing 3D stage shows a readable error with a way back, never a black screen.

## Controls

| Input | Actions |
| --- | --- |
| Keyboard | **WASD** move · **Space** jump / leap off a wall · **Shift** sprint · **E** interact (hold to repair, scan, clean) · **T** place piton · **V** crouch / let go of a wall · **B** build · **Q** rotate / salvage · **F** flashlight · **R** suit shield · **N** NASA data overlay · **I** Codex · **H** hide HUD · **C** photo mode · **P** selfie · **+ / −** zoom · **Esc** settings |
| Mouse / trackpad | Click to capture or drag to look (no middle button needed) · wheel to zoom · drag during cutscenes for 360° free-look |
| Touch | On-screen thumbstick, Jump / Use / Sprint / Piton / Let-go buttons, drag the right half to look (Settings → Accessibility; on by default on tablets) |

All keys can be rebound in Settings.

## What's in the mission

- **60-second pre-launch bunker:** 100 credits buy about 4 of 9 items (208 credits in total). Each item fixes one painful problem:
  High-Capacity O2 Scrubber, Seismic Anchors & Pitons, Rover Fast-Charge Capacitor, Thermal Regolith Insulation,
  Deep-Core Spectrometer, Pioneer Signal Booster, MMRTG Power Core, Veggie Plant Chamber, RAD-Guided Shelter Liner.
- **Opening narrative cutscene:** seven subtitled beats cover the mission, thin air, extreme cold, dust storms, marsquakes, rover energy and the science goals.
- **Field puzzles (15–45 s each, mouse, touch or keyboard):** airlock **pressure/thermal valve balancing** (first entry of each shelter),
  **power routing** (substations), **spectroscopy match** against real CRISM bands (Bright Angel), **dual-dish signal triangulation**
  (Earth uplink) and **solar-array alignment** (rover recharge).
- **Rover energy economy:** driving, inclines, lights and cold drain the battery (shown in Wh). You recharge it by aiming a portable array at the Sun, brushing dust off the panels after storms, or routing power cells at a repaired substation.
- **Olympus Mons, inspired by *Peak*:** a 262 m terraced model with a basal scarp, six sheer cliff bands and one ramp ledge per band. The ramps are offset around the circumference, so the walking route spirals about 1.8 km around the mountain. Or climb the faces directly:
  - **grip** drains as you climb, faster with regolith-dusty gloves (press **E** to brush them), in storms and in the cold;
  - **pitons** (bought in the bunker) let you rest and catch your falls;
  - climbing in thin air uses more **oxygen**;
  - **low-gravity leaps** (0.38 g, ~2.8 m jumps) carry you between ledges.
- **Hazards:**
  - **Dust storms:** a layered cloud front of billowing puffs and a ground-hugging dust layer, with exponential fog and a warm sky tint.
  - **Marsquakes**, in three telegraphed stages: a P-wave rumble with dust shaken off the cliffs; boulders working loose on real cliff lips; then rocks tumbling at 3.72 m/s² with bounces, dust trails and impact scars.
  - **Solar flares** and the final **super-storm**.
- **Varied terrain:** stratified mesas, fresh impact craters with ejecta rims, a dark basaltic dune field, an alluvial fan with channels, and instanced rocks.
- **Astronaut:** a human in a NASA-style EVA suit, with a faint face and comm cap visible behind a gold visor, a PLSS backpack, and shoulder, elbow, knee and ankle bearings. The leg segments overlap their joints, so there is no gap at any pose.

## Architecture

```
src/
  App.jsx                  shell: Title -> Bunker -> Mars -> Debrief; stages are React.lazy chunks
  ui/                      Three.js-free UI: TitleScreen, SettingsModal, Debrief, PuzzleOverlay,
                           TouchControls, beaconHud (canvas), common (ScaleNotice, SourceLink, ErrorBoundary)
  stages/GameStage.jsx     WebGL stage: world + 60 fps loop + input (keyboard, mouse, touch) + HUD
  engine/
    game.js                per-frame mission logic (sim state, hazards, quests, rendering glue)
    terrainPhysics.js      analytic terrain + render-synchronised heightfield, player/climb/rover/boulder physics
    proceduralWorld.js     Three.js world: heightfield meshes, props, lights, particles, post-processing
    stormClouds.js         instanced billowing storm front
    characterAndVehicles.js astronaut rig + animator, lander, rover, hangar scene
  logic/                   pure, framework-agnostic and unit-tested
    questMachine.js        campaign step transitions + checklists
    climbing.js            grip, glove dust, pitons, rope arrest
    roverEnergy.js         drain / solar / station charging, array alignment
    puzzles.js             five puzzle rule sets (+ autopilot solver)
    morse.js               Morse timing shared by audio beacons and captions; bearings
    webgl.js               WebGL / reduced-motion / touch detection
  data/
    nasaDatasets.js        verified NASA source URLs, MOLA profiles, REMS/MEDA ranges, scale facts
    olympusRoute.js        Olympus Mons cliff bands, ramps, trail and ledge shelters
    nasaData.js, scienceData.js  layout, Codex, citations, bunker items, briefing
tests/logic.test.js        29 tests (see below)
```

**Collision is synchronised with the rendered terrain.** `buildHeightfield()` samples the terrain model once on
the render grid: the whole world plus a high-resolution Olympus Mons patch with cells of 2 m or less. The meshes are built from those
same samples, and every physics height query interpolates the exact triangle the GPU draws (tested to 1e-6 m).
Player movement is swept in substeps of 18 cm or less, slopes are measured over a fixed 0.6 m probe (a 0.32 m step-up is
allowed), and faces steeper than 1.05 can only be climbed.

**Bundle:** the title screen loads about 69 KB of app code plus React. Three.js core, the renderer, its addons, the game stage
and the bunker hangar are separate lazy chunks. Every chunk is under 500 KB with no warning-limit override.

## Real NASA data & citations

Each Codex entry, puzzle, debrief metric and data-overlay row links to its source (opens in a new tab):

| Dataset / fact | Used for | Source |
| --- | --- | --- |
| MOLA topography (MGS) | Olympus Mons & Gale profiles, heights, scale table | [PDS Geosciences: MOLA](https://pds-geosciences.wustl.edu/missions/mgs/mola.html) · [MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) · [PIA02806](https://science.nasa.gov/photojournal/major-martian-volcanoes-from-mola-olympus-mons-2) |
| Gale 154 km / Mount Sharp 5.5 km | crater + mountain scale | [NASA Photojournal](https://science.nasa.gov/photojournal/mount-sharp-inside-gale-crater-mars) |
| Curiosity REMS | diurnal temperature (≈ −80 → 0 °C), pressure, UV | [REMS](https://science.nasa.gov/mission/msl-curiosity/science-instruments/#h-rover-environmental-monitoring-station-rems) |
| Perseverance MEDA | pressure ~600–750 Pa at Jezero, wind, dust | [Mars 2020 instruments](https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/) |
| NSSDC Mars Fact Sheet | gravity 3.72–3.73 m/s², pressure range, winds 2–30 m/s | [Fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html) |
| InSight SEIS | 1,319 marsquakes, M4.7 maximum | [InSight](https://science.nasa.gov/mission/insight/) |
| MRO CRISM / Perseverance SHERLOC | mineral absorption bands in the spectroscopy puzzle | [MRO](https://science.nasa.gov/mission/mars-reconnaissance-orbiter/) |
| Feature coordinates | Gale ↔ Olympus great-circle distance | [USGS Gazetteer](https://planetarynames.wr.usgs.gov/) |

Full list: `src/data/nasaDatasets.js` (`SOURCES`) and the in-game Debrief citations
