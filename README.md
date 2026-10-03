# Elsewhere

A small, self-contained browser exploration game with an original pastel isometric world. Wander six regions, meet residents, and collect twelve optional moments. No delivery missions or timers.

## Run

Requires Node.js 20.11+ (validated with Node.js 24). No downloads, package dependencies, API keys, asset services, or build step are required.

```sh
cd /workspace/Web-Game-V2
npm run dev
```

The HTTP server listens on port 3000, or the `PORT` environment variable. Use your development environment's port access to open the game. The server is for development use.

## Play

- WASD or arrows: move relative to the screen; Shift: run.
- Space: jump (including over small rocks); E: interact nearby.
- M: world map; J: journal; Escape: close a panel.
- Mobile: joystick, jump arrow, and interaction star.
- Sound button: enable synthesized ambient notes and interaction sounds.

Discoveries persist in browser local storage. Movement, time, and session interactions restart on reload. The campfire advances time to sunset. Trees sway, birds drift, and fireflies emerge at night. The map marks discovered and undiscovered places.

## Checks

```sh
npm run check
npm test
```

Optional browser integration test, using a separate disposable Chromium profile and the running development server:

```sh
chromium --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --user-data-dir=/tmp/elsewhere-chrome about:blank
# In another terminal:
node tests/browser-smoke.mjs
```

The browser test exercises movement, jumping, bell interaction, journal, map, persistence, and mobile controls; it rejects JavaScript exceptions and writes screenshots under `/tmp/elsewhere-*.png`. Use this dedicated browser profile for tests, not a personal browser session.

## Structure

- `src/world.js`: deterministic island generation, regions, discoveries, collision.
- `src/game.js`: canvas rendering, controls, simulation, audio, and UI.
- `src/style.css`: responsive overlay UI.
- `server.js`: dependency-free static development server.

All visual assets are generated with canvas and all audio is synthesized locally. No third-party game assets are included. Messenger was requested as inspiration, but the reference could not be inspected because its domain was blocked by the cloud network policy; matching its exact mechanics or scale is not claimed.

## GitHub Pages

Play at https://5t3ph4n.github.io/Web-Game-V2/ once the Pages deployment succeeds.

The `Deploy game to GitHub Pages` workflow validates the game and publishes only `index.html` and `src/` on every push to `main`. In repository Settings → Pages, the source must be **GitHub Actions**. You can also run the workflow manually from the Actions tab. No Node server runs on Pages; the browser loads the static game directly.

The browser smoke test accepts `GAME_URL` to validate an alternate URL, including a project subdirectory.
