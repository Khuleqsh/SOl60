# SOL 60: RED HORIZON

A 3D Mars mission-design and survival game for the **2026 NASA Space Apps Challenge**.
Built with React, Three.js, Tailwind CSS, Vite and the Web Audio API.

You have 60 seconds in an Earth bunker to pack a Mars lander. Then you plan a route across
Gale Crater with real orbital data layers, land with a sky crane, and walk six sols to the
summit of Mount Sharp, passing the silent machines NASA left behind: Opportunity, Spirit,
InSight and Ingenuity. Preserve their data or salvage their parts. Afterwards Mission Control
explains, with real Martian physics, exactly why you lived or died.

Everything is procedural: there are **no external models, textures, images or sound files**.

---

## How to play

| Stage | What you do |
| --- | --- |
| **1. Bunker** | Pick a mission contract, launch window and rocket. Pack up to 12 modules before the timer ends. Watch Mass, Budget, Power, Comms, Life Support and Science. |
| **2. Mars Map** | Toggle 6 NASA data layers (MOLA, RAD, THEMIS, Tau, CRISM, SHARAD). Click the terrain to place 3 waypoints. |
| **3. Surface** | Hold **FIRE RETRO-THRUSTERS** to land. Survive 6 sols: answer hazards, scan landmarks, tune into ghost hardware, shelter at camp. Place your plaque and dock in orbit. |
| **4. Debrief** | Telemetry graph, root-cause diagnosis, What-If loadout lab, MSR grade, blueprint code, NASA citations, Mars selfie PNG. |

| Action | Control |
| --- | --- |
| Walk (bunker) | `W` `A` `S` `D` |
| Look around / orbit | Drag the mouse, scroll to zoom |
| Grab or drop a module | Click it, or stand near it and press `E` |
| Retro-thrusters | Hold the button or `Space` |
| X-Ray blueprint view | `X` |

Play modes: **Cadet** (90 s, hints, -40% hazard damage), **Flight Director** (60 s, full hazards),
**Sandbox** (no caps). **Judge Quick-Tour** on the title screen plays all four stages by itself in about 90 seconds.
Type a **Mission Seed** (for example `GALE-2026`) to replay the same weather.

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
├── main.jsx                 # React entry
├── App.jsx                  # Stage flow, global toggles
├── style.css                # Mission Control HUD styling
├── game/
│   ├── data.js              # Items, vehicles, contracts, hardware, NASA dataset registry
│   ├── terrain.js           # Procedural Gale Crater + 6 data layers + route maths
│   ├── sim.js               # 6-sol survival simulation (pure, replayable)
│   ├── debrief.js           # Root-cause diagnosis and scoring
│   └── advisors.js          # Dr. Vance, Cmdr. Reyes, Flight Director Sato
├── systems/
│   ├── marsEnhancements.js      # EDL debris, Ghost Mesh, berm, plaque, holograms, seismograph
│   ├── ultimateFeatures.js      # Mission patch, bootprints, CO2 geysers, orbital docking
│   ├── nasaDataIntegrations.js  # Citations, MSR grade, blueprint code, certification
│   └── nasaDataModels.js        # ESCAPADE orbiters, Apollo 12 ALSEP, Surveyor 3, dust aging
├── three/
│   ├── engine.js            # Renderer, loop, X-ray view
│   ├── textures.js          # Procedural canvas PBR textures
│   ├── models.js            # Astronaut, rovers, lander, gear
│   ├── BunkerScene.js       # Stage 1
│   ├── MapScene.js          # Stage 2
│   ├── SkyCraneScene.js     # EDL mini-game
│   ├── SurfaceScene.js      # Stage 3
│   └── ArchiveViewer.js     # Hardware Archive 3D viewer
├── ui/                      # React screens and HUD
└── audio/audio.js           # All sound, synthesised live
```

### NASA data and sources

Each system cites the dataset or instrument behind it. Turn on **NASA Data Tags** in the top bar to see them in-game,
and use **Copy NASA Data Citations** on the debrief screen for the Space Apps submission.
Terrain and weather are procedural models shaped to match those sources; they are not raw NASA data files.
