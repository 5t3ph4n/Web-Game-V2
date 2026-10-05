# Wanderland

A browser exploration game on an original illustrated 3D planet. Follow winding paths through six regions, meet residents, find 26 optional discoveries, and wander at your own pace. There are no delivery missions or timers.

## Run

Requires Node.js 20.19+.

```sh
npm install
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build`; deploy the generated `dist/` directory to any static host. The build uses relative asset paths, including for GitHub Pages project sites.

The GitHub Pages workflow installs dependencies, validates the game, builds `dist/`, runs desktop and mobile browser checks, and deploys on pushes to `main`. Repository Pages settings must use **GitHub Actions** as the source.

## Controls

| Action | Control |
| --- | --- |
| Move | WASD or arrow keys |
| Run | Shift |
| Jump | Space |
| Interact | E, or the nearby interaction button |
| Look around | Drag the world |
| Walk to a place | Click the ground |
| Zoom | Mouse wheel, or Settings |
| Map / journal | M / J |
| Close a panel | Escape |

Touch screens have a thumbstick and jump/interaction buttons. Drag the world to change the camera. The map lets you return to regions you have already visited.

Discoveries, visited regions, and preferences save in browser local storage. The traveler starts in the village on each visit. Settings offer changing daylight, afternoon, sunset, and night, plus ambient audio and an option to disable shadows. Audio begins after a user gesture.

## Implementation

- `src/main.js`: spherical movement, camera, collisions, interactions, audio, persistence, map, journal, and controls.
- `src/world.js`: procedural terrain, paths, six regions, architecture, landmarks, and environment animation.
- `src/characters.js`: animated traveler and wildlife.
- `src/style.css` / `index.html`: responsive game interface.

All models and audio are original and generated in code. The Messenger reference informed spherical traversal, illustrated outlines, and a muted miniature-world aesthetic. Its code and artwork are not included. The supplied AssetHoard guide was reviewed; no third-party game assets were needed. Three.js and Vite are included through npm under their respective licenses. The Three.js license is included in `public/licenses/`, and fonts are included with their licenses in `public/fonts/`.

The game requires a browser with WebGL and hardware acceleration. Soft shadows can be disabled in Settings on slower devices.

## Checks

```sh
npm run check
npm run build
```

With the development server running, `npm test` runs the Playwright desktop and mobile smoke checks. Install its browser with `npx playwright install chromium`, or point at an existing Chromium installation:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm test
```

`GAME_URL` can target a production preview or another static host. The smoke checks exercise keyboard and touch movement, jumping, all landmarks, the map and journal, settings, focus handling, and persistence. Screenshots are written to `/tmp/wander-*.png`.
