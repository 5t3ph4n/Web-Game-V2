import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run npm run dev or npm run preview first. GAME_URL can point at either server.
const url = process.env.GAME_URL || 'http://127.0.0.1:3000';
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const failures = [];
const runtimeErrors = [];
const failedRequests = [];
const observe = (page, device) => {
  page.on('pageerror', error => runtimeErrors.push(`${device}: ${error.message}`));
  page.on('requestfailed', request => failedRequests.push(`${device}: ${request.url()} — ${request.failure()?.errorText}`));
};
const state = page => page.evaluate(() => window.wanderland.state);
const distance = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.reduce((sum, value, index) => sum + value * b[index], 0)))) * 80;
async function check(name, action) {
  try { await action(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`); }
}
async function ready(page) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.wanderland?.state && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 }).catch(async () => {
    // A running game is the authoritative readiness signal if its loading animation changes.
    await page.waitForFunction(() => window.wanderland?.state, null, { timeout: 30000 });
  });
}
async function travel(page, normal) {
  await page.evaluate(normal => window.wanderland.travel(normal), normal);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
}
async function closeModal(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.wanderland.state.modal);
}
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktop = await desktopContext.newPage();
observe(desktop, 'desktop');
try {
  await ready(desktop);
  await check('fresh welcome and local assets', async () => {
    const initial = await state(desktop);
    assert.equal(initial.running, false);
    assert.equal(initial.found.length, 0);
    assert.equal(initial.total, 26);
    assert.equal(await desktop.locator('#begin').isVisible(), true);
    await desktop.evaluate(() => document.fonts.ready);
    assert.equal(await desktop.evaluate(() => document.fonts.check('400 16px "DM Sans"') && document.fonts.check('400 32px "Instrument Serif"')), true);
    await desktop.waitForTimeout(1200);
    await desktop.screenshot({ animations: 'disabled', path: '/tmp/wander-desktop.png' });
  });
  await check('Space activates focused begin button', async () => {
    await desktop.locator('#begin').focus();
    await desktop.keyboard.press('Space');
    await desktop.waitForFunction(() => window.wanderland.state.running);
    assert.equal(await desktop.locator('#welcome').evaluate(element => element.classList.contains('hidden')), true);
  });
  await check('native focused tool buttons respond to Space', async () => {
    await desktop.locator('#map-open').focus();
    await desktop.keyboard.press('Space');
    await desktop.waitForFunction(() => window.wanderland.state.modal === 'map');
    await closeModal(desktop);
    await desktop.locator('#settings-open').focus();
    await desktop.keyboard.press('Space');
    await desktop.waitForFunction(() => window.wanderland.state.modal === 'settings');
    await desktop.locator('#setting-shadows').uncheck();
    await closeModal(desktop);
    await desktop.locator('#game').focus();
  });
  await check('WASD changes player position', async () => {
    for (const key of ['w', 'a', 's', 'd']) {
      await travel(desktop, [0, 1, 0]);
      const before = (await state(desktop)).normal;
      await desktop.keyboard.down(key);
      try { await desktop.waitForFunction(before => {
        const current = window.wanderland.state.normal;
        return current.some((value, index) => Math.abs(value - before[index]) > 0.007);
      }, before, { timeout: 15000 }); }
      catch (error) { throw new Error(`${key} movement failed: ${JSON.stringify(await state(desktop))}: ${error.message}`); }
      finally { await desktop.keyboard.up(key); }
      assert.ok(distance(before, (await state(desktop)).normal) > 0.5, `${key} should move the traveler`);
    }
  });
  await check('Shift sprint is faster than walking', async () => {
    await travel(desktop, [0, 1, 0]);
    await desktop.keyboard.down('w');
    await desktop.waitForFunction(() => window.wanderland.state.speed > 7, null, { timeout: 15000 });
    const walking = (await state(desktop)).speed;
    await desktop.keyboard.down('Shift');
    await desktop.waitForFunction(() => window.wanderland.state.speed > 12, null, { timeout: 15000 });
    assert.ok((await state(desktop)).speed > walking * 1.5);
    await desktop.keyboard.up('Shift');
    await desktop.keyboard.up('w');
  });
  await check('Space jumps and returns to the ground', async () => {
    await travel(desktop, [0, 1, 0]);
    await desktop.locator('#game').focus();
    await desktop.keyboard.down('Space');
    try { await desktop.waitForFunction(() => window.wanderland.state.height > 0.5, null, { timeout: 15000 }); }
    finally { await desktop.keyboard.up('Space'); }
    await desktop.waitForFunction(() => window.wanderland.state.height === 0, null, { timeout: 15000 });
  });
  await check('nearby fountain discovery and journal', async () => {
    await travel(desktop, [0, 1, 0]);
    await desktop.waitForFunction(() => window.wanderland.state.nearest === 'village-fountain');
    await desktop.keyboard.press('e');
    await desktop.waitForFunction(() => window.wanderland.state.modal === 'dialogue');
    assert.match(await desktop.locator('#modal-content').innerText(), /The Wishing Fountain/);
    assert.ok((await state(desktop)).found.includes('village-fountain'));
    await closeModal(desktop);
    await desktop.keyboard.press('j');
    assert.equal(await desktop.locator('.journal-entry.discovered').count(), 1);
    await closeModal(desktop);
  });
  await check('settings, focus trap, Escape, and persistence', async () => {
    await desktop.locator('#settings-open').click();
    await desktop.locator('#setting-time').selectOption('night');
    assert.equal((await state(desktop)).settings.time, 'night');
    await desktop.locator('#setting-time').selectOption('day');
    await desktop.locator('#setting-sound').check();
    assert.equal((await state(desktop)).settings.sound, true);
    await desktop.locator('#setting-shadows').uncheck();
    assert.equal((await state(desktop)).settings.shadows, false);
    await desktop.locator('#setting-shadows').focus();
    await desktop.keyboard.press('Tab');
    assert.equal(await desktop.evaluate(() => document.activeElement.id), 'modal-close');
    await desktop.keyboard.press('Shift+Tab');
    assert.equal(await desktop.evaluate(() => document.activeElement.id), 'setting-shadows');
    await closeModal(desktop);
    assert.equal(await desktop.evaluate(() => document.activeElement.id), 'settings-open');
    await ready(desktop);
    const persisted = await state(desktop);
    assert.ok(persisted.found.includes('village-fountain'));
    assert.equal(persisted.running, true);
    assert.deepEqual(persisted.settings, { sound: true, zoom: 1, time: 'day', shadows: false });
    await desktop.locator('#sound-toggle').click();
    await desktop.locator('#settings-open').click();
    await desktop.locator('#setting-shadows').check();
    await closeModal(desktop);
  });
  await check('map locks unvisited regions, then permits return to all six', async () => {
    const regions = await desktop.evaluate(() => window.wanderland.regions);
    await desktop.keyboard.press('m');
    assert.equal(await desktop.locator('.region-travel:disabled').count(), regions.length - 1);
    await closeModal(desktop);
    for (const region of regions) {
      await travel(desktop, region.normal);
      await desktop.waitForFunction(id => window.wanderland.state.visited.includes(id), region.id);
      assert.equal((await state(desktop)).region, region.name);
    }
    await desktop.keyboard.press('m');
    assert.equal(await desktop.locator('.region-travel:disabled').count(), 0);
    await desktop.locator('.region-travel').first().click();
    await desktop.waitForFunction(() => !window.wanderland.state.modal);
    await desktop.waitForFunction(name => window.wanderland.state.region === name, regions[0].name);
  });
  await check('all 26 landmarks are approachable and interactable', async () => {
    const sites = await desktop.evaluate(() => window.wanderland.sites);
    for (const site of sites) {
      let reached = false;
      const n = site.normal;
      const f = [-n[0] * n[2], -n[1] * n[2], 1 - n[2] * n[2]];
      const length = Math.hypot(...f);
      f.forEach((value, index) => f[index] = value / length);
      const r = [f[1] * n[2] - f[2] * n[1], f[2] * n[0] - f[0] * n[2], f[0] * n[1] - f[1] * n[0]];
      // Stage outside interaction range, then use ordinary keyboard movement.
      // Alternate approaches avoid a tree or house directly south of a landmark.
      for (let approach = 0; approach < 8 && !reached; approach++) {
        const angle = approach * Math.PI / 4;
        const start = n.map((value, index) => value + (f[index] * Math.cos(angle) + r[index] * Math.sin(angle)) * 9.5 / 80);
        await travel(desktop, start);
        await desktop.locator('#game').focus();
        const keys = await desktop.evaluate(target => {
          const normal = window.wanderland.state.normal;
          const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
          let forward = normal.map((value, index) => (index === 2 ? -1 : 0) + value * normal[2]);
          if (Math.hypot(...forward) ** 2 < 0.1) forward = [1 - normal[0] ** 2, -normal[0] * normal[1], -normal[0] * normal[2]];
          const length = Math.hypot(...forward); forward.forEach((value, index) => forward[index] = value / length);
          const right = [forward[1] * normal[2] - forward[2] * normal[1], forward[2] * normal[0] - forward[0] * normal[2], forward[0] * normal[1] - forward[1] * normal[0]];
          const direction = target.map((value, index) => value - normal[index] * dot(target, normal));
          const x = dot(direction, right), y = dot(direction, forward);
          const keys = [];
          if (Math.abs(x) > Math.abs(y) * 0.4) keys.push(x > 0 ? 'd' : 'a');
          if (Math.abs(y) > Math.abs(x) * 0.4) keys.push(y > 0 ? 'w' : 's');
          return keys;
        }, site.normal);
        for (const key of keys) await desktop.keyboard.down(key);
        try {
          await desktop.waitForFunction(id => window.wanderland.state.nearest === id, site.id, { timeout: 9000 });
          reached = true;
        } catch { /* A blocked path is expected; try the next direction. */ }
        finally { for (const key of keys) await desktop.keyboard.up(key); }
      }
      assert.ok(reached, `${site.id} should be approachable; ${JSON.stringify(await state(desktop))}`);
      await desktop.keyboard.press('e');
      await desktop.waitForFunction(id => window.wanderland.state.found.includes(id), site.id, { timeout: 15000 });
      if (site.kind === 'mushroom') {
        await desktop.waitForFunction(() => window.wanderland.state.height > 0.5, null, { timeout: 15000 });
        await desktop.waitForFunction(() => window.wanderland.state.height === 0, null, { timeout: 15000 });
      } else {
        await desktop.waitForFunction(() => window.wanderland.state.modal === 'dialogue', null, { timeout: 15000 });
        assert.equal(await desktop.locator('#modal-content h2').innerText(), site.title);
        await closeModal(desktop);
      }
      console.log(`  reached ${site.id}`);
    }
    assert.equal((await state(desktop)).found.length, sites.length);
    await desktop.keyboard.press('j');
    assert.equal(await desktop.locator('.journal-entry.discovered').count(), sites.length);
    await desktop.waitForTimeout(500);
    await desktop.screenshot({ animations: 'disabled', path: '/tmp/wander-journal-final.png' });
    await closeModal(desktop);
    await desktop.keyboard.press('m');
    await desktop.waitForTimeout(500);
    await desktop.screenshot({ animations: 'disabled', path: '/tmp/wander-map-final.png' });
    await closeModal(desktop);
    await travel(desktop, [0, 1, 0]);
    await desktop.waitForTimeout(4000);
    await desktop.screenshot({ animations: 'disabled', path: '/tmp/wander-desktop-playing.png' });
  });
  await check('click-to-walk moves toward the visible ground', async () => {
    await desktop.locator('#game').focus();
    const before = (await state(desktop)).normal;
    await desktop.locator('#game').click({ position: { x: 790, y: 500 } });
    await desktop.waitForFunction(before => window.wanderland.state.normal.some((value, index) => Math.abs(value - before[index]) > 0.01), before, { timeout: 15000 });
    assert.ok(distance(before, (await state(desktop)).normal) > 0.7);
  });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mobile = await mobileContext.newPage();
  observe(mobile, 'mobile');
  await ready(mobile);
  await check('mobile welcome layout and touch controls', async () => {
    await mobile.waitForTimeout(4000);
    await mobile.screenshot({ animations: 'disabled', path: '/tmp/wander-mobile.png' });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.locator('#begin').tap();
    await mobile.waitForFunction(() => window.wanderland.state.running);
    for (const selector of ['#joystick', '#jump-touch', '#interact-touch']) assert.equal(await mobile.locator(selector).isVisible(), true);
    const bounds = await mobile.locator('#joystick').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y + bounds.height <= 844);
  });
  await check('mobile real touch joystick movement', async () => {
    const before = (await state(mobile)).normal;
    const joystick = await mobile.locator('#joystick').boundingBox();
    const session = await mobileContext.newCDPSession(mobile);
    const touch = { x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touch, y: touch.y - 32 }] });
    await mobile.waitForFunction(before => window.wanderland.state.normal.some((value, index) => Math.abs(value - before[index]) > 0.01), before, { timeout: 15000 });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(distance(before, (await state(mobile)).normal) > 0.7);
    assert.equal(await mobile.locator('#joystick-knob').evaluate(element => element.style.transform), '');
  });
  await check('mobile jump and fountain interaction', async () => {
    await travel(mobile, [0, 1, 0]);
    await mobile.locator('#jump-touch').tap();
    await mobile.waitForFunction(() => window.wanderland.state.height > 0.2, null, { timeout: 15000 });
    await mobile.waitForFunction(() => window.wanderland.state.height === 0, null, { timeout: 15000 });
    await mobile.locator('#interact-touch').tap();
    await mobile.waitForFunction(() => window.wanderland.state.modal === 'dialogue');
    assert.ok((await state(mobile)).found.includes('village-fountain'));
    await mobile.locator('#keep-wandering').tap();
    await mobile.waitForTimeout(4000);
    await mobile.screenshot({ animations: 'disabled', path: '/tmp/wander-mobile-playing.png' });
  });
  await mobileContext.close();
  await check('no browser runtime errors or failed requests', async () => {
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(failedRequests, []);
  });
} finally {
  await browser.close();
}
if (failedRequests.length) console.error('Failed requests:', failedRequests);
if (failures.length) { console.error(`\n${failures.length} failed check(s):\n${failures.join('\n')}`); process.exitCode = 1; }
else console.log('\nAll browser smoke checks passed. Screenshots written to /tmp/wander-{desktop,mobile}*.png.');
