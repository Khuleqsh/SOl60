# SOL 60: RED HORIZON

A 3D open-world Mars survival game for the **2026 NASA Space Apps Challenge**.
Built with React, Three.js, Tailwind CSS, Vite and the Web Audio API.

Year 2034. You are the solo pathfinder astronaut of **Ares-7**, 14 minutes and 22 seconds of radio
silence from Earth. Pack your lander in 60 seconds, choose a landing zone from real orbital data
layers, ride a 6-second rocket landing into Gale Crater, and survive six sols beside the silent
machines NASA left behind: Opportunity, Spirit, InSight and Ingenuity. Preserve their memories or
salvage their parts to stay alive. Afterwards the debrief explains, with real Martian physics,
exactly why you lived or died.

Everything is procedural: there are **no external models, textures, images or sound files**.

---

## How to play

| Stage | What you do |
| --- | --- |
| **1. Contract & Bunker** | Pick a contract (Astrobiology, Subsurface Ice, Legacy Rover Rescue), launch window and rocket. 60 s to pack up to 12 NASA modules within Mass and Budget. |
| **2. Mars Trek Map** | Toggle 6 NASA data layers (MOLA, RAD, THEMIS, Tau, CRISM, SHARAD) and click **any** landing zone. Its data shapes the world: terrain roughness, radiation, night cold, storm haze, rock science and buried ice. |
| **3. Surface** | 6-second rocket + parachute landing (skippable), then a seeded open-world Gale Crater across 6 sols. Track the four pioneers by stereo Morse beacon, lock their signal, watch the holographic replay, then **Preserve** or **Salvage**. Survive the solar particle event, Phobos eclipse, marsquake, Great Storm and Sol 5 freeze; bolt a memorial plaque and launch on the Mars Ascent Vehicle. |
| **4. Debrief** | One of 4 endings, Captain's Log, Mastcam-Z gallery, Sol-by-Sol telemetry, diagnosis, What-If loadout lab (replays your actual path with different gear), NASA citations, Mars selfie PNG. |

Default controls (all rebindable in **Settings › Keybinds**, opened with `Esc` or the gear icon):

`WASD` move · `Space` Mars jump (g = 3.72 m/s²) · `Shift` sprint · `E` interact · `B` build berm ·
`F` helmet light · `G` flare · `C` Mastcam-Z · `X` X-ray · `I` NASA Codex.
Click the view to capture the mouse (or drag to orbit); scroll to zoom.

Play modes: **Cadet** (hazards −40%), **Flight Director** (full hazards), **Sandbox** (no caps).
**Judge Quick-Tour** plays every stage on autopilot in about 90 s.
Every run gets a new random **Mission Seed**; type one (for example `GALE-2026`) to replay the same world.

On integrated GPUs choose **Settings › Graphics › Low (Max FPS)**.

---

## For developers

```bash
git clone https://github.com/Khuleqsh/The-martian.git
cd The-martian
npm install
npm run dev
```

Open the address Vite prints (usually `http://localhost:5173`). You need Node.js 20.19+ or 22+.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

### Project structure

```
src/
├── App.jsx                       # Stage flow, settings/keybinds, mission parameters
├── data/nasaKnowledge.js         # Discovery popups, Codex, rover memories, radio script, endings, citations
├── engine/
│   ├── terrainAndPhysics.js      # Shared getTerrainHeight/Normal, seeded world gen, collisions, physics, build checks
│   ├── proceduralGraphics.js     # GLSL sky, terrain, instanced boulders, Ares-7 rocket, chute, dust, storm wall, berms
│   ├── openWorld.js              # 60 fps loop over one mutable sim object; events, interactions, cinematics, compass
│   ├── missionModel.js           # Pure life-support model shared by the live game and the What-If lab
│   └── audioEngine.js            # Web Audio synthesis, CO2 filter, stereo Morse beacons
├── components/
│   ├── SurfaceStage.jsx          # Mounts the engine, owns simRef, 5 Hz HUD sync
│   ├── HudAndModals.jsx          # HUD, compass, radio, discovery cards, choice, Mastcam-Z, Codex
│   ├── SettingsModal.jsx         # Keybinds, graphics presets, audio & accessibility
│   ├── DebriefScreen.jsx         # Stage 4
│   └── StageErrorBoundary.jsx    # Friendly recovery if WebGL is unavailable
├── ui/                           # Title, Stage 1 (briefing + bunker), Stage 2 map, archive, shared widgets
├── three/                        # Bunker, map and archive scenes; shared models and textures
├── game/                         # Static mission data, map layers, advisors
└── systems/                      # Patch designer, plaques, holograms, ESCAPADE / ALSEP models
legacy/                           # Previous rail-based surface sim and EDL mini-game (not compiled)
```

### NASA data and sources

Every discovery popup and Codex entry names its NASA mission, instrument or archive. Turn on
**NASA Data Tags** in the top bar to see sources in the planning stages, and use **Copy NASA
Citations** on the debrief screen for the Space Apps submission. Terrain and weather are procedural
models shaped to match those sources; they are not raw NASA data files. In reality the four
pioneers rest at different sites across Mars; the game gathers them in Gale Crater to honour them
on one expedition.
