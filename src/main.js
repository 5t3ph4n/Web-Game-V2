import * as THREE from 'three';
import { createWorld, RADIUS } from './world.js';
import { createTraveler, createWildlife } from './characters.js';

const $ = (id) => document.getElementById(id);
const STORAGE = 'wanderland-save-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { /* A fresh world is always available. */ }
const found = new Set(Array.isArray(saved.found) ? saved.found : []);
const visited = new Set(Array.isArray(saved.visited) ? saved.visited : []);
const settings = { sound: false, zoom: 1, time: 'living', shadows: true, ...saved.settings };
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
} catch {
  $('loading').innerHTML = '<div class="loading-copy"><h2>A little more graphics power, please.</h2><p>Wanderland needs WebGL. Enable hardware acceleration in your browser, then reload.</p></div>';
  throw new Error('WebGL is unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = settings.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#d3e2d6');
scene.fog = new THREE.Fog('#d3e2d6', 140, 330);
const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.5, 650);
const hemi = new THREE.HemisphereLight('#fff4df', '#66784f', 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3d2', 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -70;
sun.shadow.camera.right = sun.shadow.camera.top = 70;
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 230;
sun.shadow.normalBias = 0.06;
sun.shadow.bias = -0.0002;
scene.add(sun, sun.target);

$('loading-progress').textContent = 'Planting the trees';
const world = createWorld();
scene.add(world.group);
const traveler = createTraveler();
scene.add(traveler.group);
const wildlife = createWildlife();
scene.add(wildlife.group);
const player = {
  normal: world.spawn.clone().normalize(), forward: new THREE.Vector3(0, 0, -1),
  height: 0, vertical: 0, speed: 0, velocity: new THREE.Vector3(),
};
const viewForward = new THREE.Vector3(0, 0, -1);
const right = new THREE.Vector3();
let elapsed = 42, running = false, nearest = null, currentRegion = null, modalType = null;
let joystickX = 0, joystickY = 0, drag = null, clickTarget = null, toastTimer, lastFootstep = 0;
let lastSave = 0, audioContext, audioMaster, soundTimer = 0;
const keys = new Set();
const particles = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const targetCamera = new THREE.Vector3();
const targetLook = new THREE.Vector3();
const look = new THREE.Vector3();
const clock = new THREE.Clock();
const playerShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#354935', transparent: true, opacity: 0.2, depthWrite: false }));
playerShadow.rotation.x = -Math.PI / 2;
const shadowAnchor = new THREE.Group();
shadowAnchor.add(playerShadow);
scene.add(shadowAnchor);
const curiosityRing = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.53, 40), new THREE.MeshBasicMaterial({ color: '#f8f0c8', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
curiosityRing.rotation.x = -Math.PI / 2;
const curiosityAnchor = new THREE.Group();
curiosityAnchor.add(curiosityRing); curiosityAnchor.visible = false; scene.add(curiosityAnchor);

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ found: [...found], visited: [...visited], settings, begun: running || saved.begun })); } catch { /* Play remains available without storage. */ }
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 4200);
}
function refreshCounts() {
  $('discovery-count').textContent = `${found.size} / ${world.sites.length} little wonders`;
  $('sound-toggle').setAttribute('aria-pressed', String(settings.sound));
  $('sound-toggle').setAttribute('aria-label', settings.sound ? 'Mute sound' : 'Enable sound');
  $('sound-toggle').title = settings.sound ? 'Mute sounds' : 'Turn on sounds';
  $('sound-toggle').classList.toggle('is-active', settings.sound);
  $('sound-icon').innerHTML = `<path d="m11 5-6 4H2v6h3l6 4V5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>${settings.sound ? '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' : '<path d="m17 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'}`;
}
function begin() {
  running = true;
  $('welcome').classList.add('hidden');
  save();
  if (settings.sound) startAudio();
  $('game').focus({ preventScroll: true });
}

function startAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioMaster = audioContext.createGain();
    audioMaster.gain.value = 0.18;
    audioMaster.connect(audioContext.destination);
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.035;
    const wind = audioContext.createBufferSource();
    wind.buffer = buffer; wind.loop = true;
    const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 380;
    wind.connect(filter); filter.connect(audioMaster); wind.start();
  }
  audioContext.resume().catch(() => {});
  audioMaster.gain.setTargetAtTime(settings.sound ? 0.18 : 0, audioContext.currentTime, 0.2);
}
function note(freq, length = 0.7, volume = 0.25, delay = 0) {
  if (!settings.sound || !audioContext) return;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  const t = audioContext.currentTime + delay;
  osc.type = 'sine'; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(gain); gain.connect(audioMaster); osc.start(t); osc.stop(t + length + 0.05);
}
function jump(boost = 1) {
  if (!running || modalType || player.height > 0.04) return;
  player.vertical = 9 * boost;
  note(330, 0.18, 0.12);
}
function burst(normal, color = '#edcd73', amount = 20) {
  const tangent = new THREE.Vector3(1, 0, 0).projectOnPlane(normal).normalize();
  if (tangent.lengthSq() < 0.1) tangent.set(0, 0, 1).projectOnPlane(normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
  const geo = new THREE.IcosahedronGeometry(0.11, 0);
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < amount; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(normal).multiplyScalar(RADIUS + 2);
    const angle = Math.random() * Math.PI * 2;
    const velocity = tangent.clone().multiplyScalar(Math.cos(angle) * (2 + Math.random() * 3)).addScaledVector(bitangent, Math.sin(angle) * (2 + Math.random() * 3)).addScaledVector(normal, 3 + Math.random() * 5);
    scene.add(mesh); particles.push({ mesh, velocity, age: 0, normal, geo, mat });
  }
}
function interact() {
  if (!running) { begin(); return; }
  if (modalType === 'dialogue') { closeModal(); return; }
  if (modalType || !nearest) return;
  const site = nearest;
  const first = !found.has(site.id);
  found.add(site.id); refreshCounts(); save();
  burst(site.normal, first ? '#f4ce70' : '#dfe9cf');
  [523.25, 659.25, 783.99].forEach((freq, i) => note(freq, 0.85, 0.25, i * 0.13));
  if (site.kind === 'mushroom') { player.vertical = 15; toast('A little bounce. A whole new perspective.'); }
  if (site.kind === 'campfire') { settings.time = 'sunset'; save(); }
  if (site.kind === 'bell') [392, 587, 784].forEach((freq, i) => note(freq, 2.5, 0.3, i * 0.09));
  if (site.group) {
    site.group.userData.activated = true;
    site.group.userData.activatedAt = elapsed;
  }
  if (site.kind === 'mushroom') return;
  openModal('dialogue', `<div class="dialogue-eyebrow">${first ? 'A LITTLE WONDER DISCOVERED' : 'A FAMILIAR LITTLE WONDER'}</div><div class="dialogue-symbol">${iconFor(site.kind)}</div><h2>${escapeHTML(site.title)}</h2><p class="dialogue-text">${escapeHTML(site.description)}</p><div class="dialogue-footer"><span>${found.size} of ${world.sites.length} wonders found</span><button class="primary-button" id="keep-wandering">Keep wandering <span aria-hidden="true">↗</span></button></div>`);
  $('keep-wandering').addEventListener('click', closeModal);
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function iconFor(kind) {
  const shapes = {
    bell: '<path d="M8 16h16l-2-4v-4a6 6 0 0 0-12 0v4zM13 20a3 3 0 0 0 6 0"/>',
    fountain: '<path d="M6 22h20M8 17a8 8 0 0 0 16 0zM16 5v12M16 7c-7-7-10 2-10 4M16 7c7-7 10 2 10 4"/>',
    windmill: '<path d="m12 14-3 13h14l-3-13M16 13 9 3 4 9zM16 13l10-7 3 6zM16 13l7 10-6 4zM16 13 6 20l-3-6z"/>',
    resident: '<circle cx="16" cy="10" r="5"/><path d="M6 28v-5a10 10 0 0 1 20 0v5M13 10h.1M19 10h.1"/>',
    telescope: '<path d="m6 15 18-8 3 7-18 8zM16 19v10M16 23l-7 6M16 23l7 6"/>',
    campfire: '<path d="m6 28 20-4M6 24l20 4M12 20c-7-7 1-11 3-17 8 7 13 12 5 17z"/>',
  };
  return `<svg viewBox="0 0 32 32" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind] || '<path d="m16 3 3.5 9.5L29 16l-9.5 3.5L16 29l-3.5-9.5L3 16l9.5-3.5z"/>'}</svg>`;
}
let focusBeforeModal;
function openModal(type, html) {
  if (!modalType) focusBeforeModal = document.activeElement;
  modalType = type; keys.clear(); clickTarget = null; joystickX = joystickY = 0;
  $('modal-content').innerHTML = html;
  $('modal').classList.remove('hidden');
  $('modal-card').classList.toggle('wide', type === 'map');
  $('modal-close').focus({ preventScroll: true });
}
function closeModal() {
  modalType = null; $('modal').classList.add('hidden');
  (focusBeforeModal || $('game')).focus({ preventScroll: true });
}
function openJournal() {
  const entries = world.sites.map(site => `<article class="journal-entry ${found.has(site.id) ? 'discovered' : 'undiscovered'}"><div class="entry-icon">${iconFor(site.kind)}</div><div><h3>${found.has(site.id) ? escapeHTML(site.title) : 'A wonder waiting'}</h3><p>${found.has(site.id) ? escapeHTML(site.description) : 'Take the path you haven’t taken yet.'}</p></div>${found.has(site.id) ? '<span class="entry-check">✓</span>' : '<span class="entry-check">·</span>'}</article>`).join('');
  openModal('journal', `<div class="panel-eyebrow">YOUR FIELD NOTES</div><h2>A collection of moments.</h2><p class="panel-description">${found.size} of ${world.sites.length} little wonders. There’s no right order to find them.</p><div class="journal-list">${entries}</div>`);
}
function openMap() {
  openModal('map', `<div class="panel-eyebrow">THE WORLD IS YOURS</div><h2>A little farther from here.</h2><p class="panel-description">Follow the paths, or make your own. Return to any place you’ve visited.</p><canvas id="world-map" width="900" height="400" aria-label="Map of six regions with your location"></canvas><div class="region-list">${world.regions.map(r => `<button class="region-travel ${visited.has(r.id) ? 'visited' : ''}" data-region="${r.id}" ${visited.has(r.id) ? '' : 'disabled'}><span class="region-dot" style="background:${r.color}"></span><span>${escapeHTML(r.name)}</span><small>${visited.has(r.id) ? 'Return ↗' : 'Unexplored'}</small></button>`).join('')}</div>`);
  drawWorldMap();
  document.querySelectorAll('[data-region]').forEach(button => button.addEventListener('click', () => {
    const region = world.regions.find(r => r.id === button.dataset.region);
    if (region && visited.has(region.id)) { travel(region.normal); closeModal(); toast(`Back to ${region.name}.`); }
  }));
  $('world-map').addEventListener('click', e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 900, y = (e.clientY - rect.top) / rect.height * 400;
    for (const region of world.regions) {
      const point = mapPoint(region.normal, 900, 400);
      if (Math.hypot(x - point.x, y - point.y) < 27 && visited.has(region.id)) { travel(region.normal); closeModal(); toast(`Back to ${region.name}.`); break; }
    }
  });
}
function travel(normal) {
  player.normal.copy(normal).normalize(); player.height = player.vertical = 0;
  player.velocity.set(0, 0, 0); clickTarget = null;
  viewForward.set(0, 0, -1).projectOnPlane(player.normal);
  if (viewForward.lengthSq() < 0.1) viewForward.set(1, 0, 0).projectOnPlane(player.normal);
  viewForward.normalize(); player.forward.copy(viewForward);
  placeCamera(true); burst(player.normal, '#ecdfa8', 16);
}
function openSettings() {
  openModal('settings', `<div class="panel-eyebrow">MAKE YOURSELF AT HOME</div><h2>Your kind of wandering.</h2><p class="panel-description">A few small things to make the world feel just right.</p><div class="settings-list"><label class="setting-row"><span>Nature & little melodies<small>A softly synthesized soundtrack</small></span><input id="setting-sound" type="checkbox" ${settings.sound ? 'checked' : ''}></label><label class="setting-row"><span>Time of day<small>Let the sun wander, or stay a while</small></span><select id="setting-time"><option value="living">Changing daylight</option><option value="day">Sunny afternoon</option><option value="sunset">Golden hour</option><option value="night">Moonlit night</option></select></label><label class="setting-row"><span>Camera distance<small>A closer look or a bigger picture</small></span><input id="setting-zoom" type="range" min="0.65" max="1.4" step="0.05" value="${settings.zoom}"></label><label class="setting-row"><span>Soft shadows<small>Turn off for lighter performance</small></span><input id="setting-shadows" type="checkbox" ${settings.shadows ? 'checked' : ''}></label></div><div class="controls-guide"><h3>A few ways to wander</h3><p><kbd>W A S D</kbd> or arrows to move · <kbd>Shift</kbd> to run<br><kbd>Space</kbd> to jump · <kbd>E</kbd> to interact<br><kbd>M</kbd> map · <kbd>J</kbd> journal · <kbd>Esc</kbd> close<br>Drag to look around. Click the ground to walk there.<br>On touch screens, use the thumbstick and action buttons.</p></div>`);
  $('setting-time').value = settings.time;
  $('setting-sound').addEventListener('change', e => { settings.sound = e.target.checked; startAudio(); refreshCounts(); save(); });
  $('setting-time').addEventListener('change', e => { settings.time = e.target.value; save(); });
  $('setting-zoom').addEventListener('input', e => { settings.zoom = Number(e.target.value); save(); });
  $('setting-shadows').addEventListener('change', e => { settings.shadows = e.target.checked; renderer.shadowMap.enabled = settings.shadows; save(); });
}

function mapPoint(normal, width, height) {
  return { x: (Math.atan2(normal.x, normal.y) / (Math.PI * 2) + 0.5) * width, y: (0.5 - Math.asin(THREE.MathUtils.clamp(normal.z, -1, 1)) / Math.PI) * height };
}
function drawWorldMap() {
  const canvas = $('world-map'); if (!canvas) return;
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#dce5d7'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c4d0bd'; ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(w * i / 12, 0); ctx.lineTo(w * i / 12, h); ctx.stroke(); }
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 6); ctx.lineTo(w, h * i / 6); ctx.stroke(); }
  for (const region of world.regions) {
    const p = mapPoint(region.normal, w, h);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.x * 0.03) % 2);
    ctx.fillStyle = region.color; ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.ellipse(0, 0, 68, 45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.setLineDash([4, 6]); ctx.strokeStyle = '#8a9b7b'; ctx.lineWidth = 1.5;
  for (const path of world.paths || []) {
    let previous = null; ctx.beginPath();
    for (const normal of path.points) {
      const point = mapPoint(normal, w, h);
      if (!previous || Math.abs(point.x - previous.x) > w / 2) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
      previous = point;
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  world.regions.forEach(region => {
    const p = mapPoint(region.normal, w, h);
    ctx.fillStyle = visited.has(region.id) ? '#526742' : '#faf7eb'; ctx.strokeStyle = '#5d7350'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#384b34'; ctx.font = '500 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(region.name, p.x, p.y + 30);
  });
  const p = mapPoint(player.normal, w, h);
  ctx.fillStyle = '#c67e59'; ctx.strokeStyle = '#fff7e8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#64795a'; ctx.fillText('A WORLD WITHOUT EDGES', 18, 26);
}
function drawMinimap() {
  const canvas = $('minimap'), ctx = canvas.getContext('2d'), size = canvas.width;
  ctx.clearRect(0, 0, size, size); ctx.save(); ctx.translate(size / 2, size / 2);
  ctx.beginPath(); ctx.arc(0, 0, size / 2 - 3, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#d6dfc9'; ctx.fillRect(-size / 2, -size / 2, size, size);
  right.crossVectors(viewForward, player.normal).normalize();
  const scale = size / 2 / 42;
  world.regions.forEach(region => {
    const delta = region.normal.clone().sub(player.normal).multiplyScalar(RADIUS);
    const x = delta.dot(right) * scale, y = -delta.dot(viewForward) * scale;
    ctx.fillStyle = region.color; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.ellipse(x, y, 40, 32, 0.3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#f1ecd7';
  for (const path of world.paths || []) {
    ctx.lineWidth = Math.max(2, path.width * scale);
    let active = false; ctx.beginPath();
    for (const normal of path.points) {
      if (normal.dot(player.normal) < 0.65) { active = false; continue; }
      const delta = normal.clone().sub(player.normal).multiplyScalar(RADIUS);
      const x = delta.dot(right) * scale, y = -delta.dot(viewForward) * scale;
      if (active) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      active = true;
    }
    ctx.stroke();
  }
  for (const site of world.sites) {
    if (site.normal.dot(player.normal) < 0.7) continue;
    const delta = site.normal.clone().sub(player.normal).multiplyScalar(RADIUS);
    const x = delta.dot(right) * scale, y = -delta.dot(viewForward) * scale;
    if (Math.hypot(x, y) > size / 2 - 10) continue;
    ctx.fillStyle = found.has(site.id) ? '#587048' : '#f8f4e4'; ctx.strokeStyle = '#799065'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, found.has(site.id) ? 3 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#b86f4e'; ctx.strokeStyle = '#fff8e8'; ctx.lineWidth = 2;
  const facing = Math.atan2(player.forward.dot(right), player.forward.dot(viewForward));
  ctx.rotate(facing); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 5); ctx.lineTo(0, 3); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function findRegion() {
  let region = world.regions[0], best = -2;
  for (const candidate of world.regions) { const dot = candidate.normal.dot(player.normal); if (dot > best) { best = dot; region = candidate; } }
  if (currentRegion?.id !== region.id) {
    const previously = currentRegion;
    currentRegion = region;
    $('region-name').textContent = region.name;
    $('area-name').textContent = region.name;
    $('area-caption').textContent = 'CURRENTLY WANDERING';
    if (!visited.has(region.id)) {
      visited.add(region.id); save();
      if (previously && running) toast(`You found ${region.name}. Take a look around.`);
    }
  }
}
function updateNearest() {
  nearest = null; let distance = 7;
  for (const site of world.sites) {
    const d = player.normal.angleTo(site.normal) * RADIUS;
    if (d < distance) { distance = d; nearest = site; }
  }
  $('interact-prompt').classList.toggle('hidden', !nearest || !running || !!modalType);
  curiosityAnchor.visible = !!nearest && running && !modalType;
  if (nearest) {
    curiosityAnchor.position.copy(nearest.normal).multiplyScalar(RADIUS + 0.12);
    curiosityAnchor.quaternion.setFromUnitVectors(Y, nearest.normal);
  }
  if (nearest) $('interact-label').textContent = nearest.kind === 'resident' ? `Meet ${nearest.title}` : nearest.title;
}
function placeCamera(snap = false, dt = 0.016) {
  const distance = 1 / settings.zoom;
  if (!running) {
    right.crossVectors(viewForward, player.normal).normalize();
    const overviewDistance = Math.max(240, RADIUS / (Math.tan(THREE.MathUtils.degToRad(43 / 2)) * Math.min(1, camera.aspect)) * 1.06);
    targetCamera.copy(player.normal).multiplyScalar(0.885).addScaledVector(viewForward, -0.465).normalize().multiplyScalar(overviewDistance);
    targetLook.copy(player.normal).multiplyScalar(3).addScaledVector(right, innerWidth > 800 ? -27 : -10);
    if (innerWidth < 600) targetLook.addScaledVector(player.normal, 55);
  } else {
    targetCamera.copy(player.normal).multiplyScalar(RADIUS + 53 * distance).addScaledVector(viewForward, -48 * distance);
    targetLook.copy(player.normal).multiplyScalar(RADIUS + 1).addScaledVector(viewForward, 7);
  }
  camera.up.copy(player.normal);
  if (snap) { camera.position.copy(targetCamera); look.copy(targetLook); }
  else { camera.position.lerp(targetCamera, 1 - Math.exp(-dt * 5)); look.lerp(targetLook, 1 - Math.exp(-dt * 7)); }
  camera.lookAt(look);
}
function movePlayer(dt) {
  right.crossVectors(viewForward, player.normal).normalize();
  let x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + joystickX;
  let y = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - joystickY;
  const direction = new THREE.Vector3().addScaledVector(right, x).addScaledVector(viewForward, y);
  if (direction.lengthSq() > 0.01) clickTarget = null;
  else if (clickTarget) {
    if (player.normal.angleTo(clickTarget) * RADIUS < 1.1) clickTarget = null;
    else direction.copy(clickTarget).projectOnPlane(player.normal);
  }
  if (direction.lengthSq() > 1e-8) direction.normalize();
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 14 : 8;
  player.velocity.lerp(direction.multiplyScalar(speed), 1 - Math.exp(-dt * (direction.lengthSq() ? 9 : 12)));
  const next = player.normal.clone().addScaledVector(player.velocity, dt / RADIUS).normalize();
  let blocked = false;
  if (player.height < 1.8) {
    for (const collider of world.colliders) {
      const d = next.angleTo(collider.normal) * RADIUS;
      const old = player.normal.angleTo(collider.normal) * RADIUS;
      if (d < collider.radius + 0.6 && d < old - 0.0001) { blocked = true; break; }
    }
  }
  if (!blocked) player.normal.copy(next);
  else { player.velocity.multiplyScalar(0.15); clickTarget = null; }
  viewForward.projectOnPlane(player.normal).normalize();
  if (player.velocity.lengthSq() > 0.2) player.forward.lerp(player.velocity.clone().normalize(), 1 - Math.exp(-dt * 12)).projectOnPlane(player.normal).normalize();
  player.speed = blocked ? 0 : player.velocity.length();
  if (keys.has('Space')) jump();
  player.vertical -= 23 * dt;
  player.height += player.vertical * dt;
  if (player.height < 0) { player.height = 0; player.vertical = 0; }
  if (player.speed > 1 && player.height === 0 && elapsed - lastFootstep > (speed === 14 ? 0.22 : 0.32)) { note(85 + Math.random() * 20, 0.06, 0.05); lastFootstep = elapsed; }
}
function placePlayer() {
  traveler.group.position.copy(player.normal).multiplyScalar(RADIUS + 0.04 + player.height);
  const forward = player.forward.clone().projectOnPlane(player.normal).normalize();
  const localRight = new THREE.Vector3().crossVectors(player.normal, forward).normalize();
  const basis = new THREE.Matrix4().makeBasis(localRight, player.normal, forward);
  traveler.group.quaternion.setFromRotationMatrix(basis);
  traveler.animate(elapsed, player.speed, player.height > 0.05);
  shadowAnchor.position.copy(player.normal).multiplyScalar(RADIUS + 0.08);
  shadowAnchor.quaternion.setFromUnitVectors(Y, player.normal);
  playerShadow.scale.setScalar(Math.max(0.35, 1 - player.height * 0.07));
  playerShadow.material.opacity = Math.max(0.05, 0.2 - player.height * 0.015);
}
function updateDaylight() {
  const t = settings.time === 'day' ? 0.15 : settings.time === 'sunset' ? 0.43 : settings.time === 'night' ? 0.7 : (elapsed / 420) % 1;
  const night = Math.max(0, Math.sin((t - 0.45) * Math.PI * 2));
  const sunset = Math.max(0, 1 - Math.abs(t - 0.43) * 12);
  const color = new THREE.Color('#d3e2d6').lerp(new THREE.Color('#ecd1b0'), sunset * 0.6).lerp(new THREE.Color('#283b50'), night * 0.85);
  scene.background.copy(color); scene.fog.color.copy(color);
  hemi.intensity = 1.25 - night * 0.65;
  sun.intensity = 1.7 - night * 1.4;
  sun.color.set('#fff3d2').lerp(new THREE.Color('#e6ac72'), sunset * 0.5).lerp(new THREE.Color('#b0c9e2'), night);
  sun.target.position.copy(player.normal).multiplyScalar(RADIUS);
  right.crossVectors(viewForward, player.normal).normalize();
  sun.position.copy(player.normal).multiplyScalar(RADIUS + 70).addScaledVector(right, -45).addScaledVector(viewForward, 30);
}

$('begin').addEventListener('click', begin);
$('map-open').addEventListener('click', openMap);
$('map-shortcut').addEventListener('click', openMap);
$('journal-open').addEventListener('click', openJournal);
$('settings-open').addEventListener('click', openSettings);
$('sound-toggle').addEventListener('click', () => { settings.sound = !settings.sound; startAudio(); refreshCounts(); save(); toast(settings.sound ? 'A little birdsong, a little melody.' : 'Just you and the world. Sound muted.'); });
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
$('interact-prompt').addEventListener('click', interact);
$('interact-touch').addEventListener('click', e => { e.preventDefault(); interact(); });
$('jump-touch').addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
window.addEventListener('keydown', e => {
  if (settings.sound && running && !audioContext) startAudio();
  if (e.code === 'Escape') { closeModal(); return; }
  if (e.code === 'Tab' && modalType) {
    const focusable = [...$('modal-card').querySelectorAll('button, input, select, [tabindex]')].filter(el => !el.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && (e.code !== 'Tab' || !modalType)) { if (e.code !== 'Tab') e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyM') { modalType === 'map' ? closeModal() : openMap(); return; }
  if (e.code === 'KeyJ') { modalType === 'journal' ? closeModal() : openJournal(); return; }
  if (e.code === 'KeyE' || (e.code === 'Space' && modalType === 'dialogue')) { e.preventDefault(); interact(); return; }
  if (!modalType) { if (!running && /^(Key[WASD]|Arrow|Space)/.test(e.code)) begin(); keys.add(e.code); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); joystickX = joystickY = 0; drag = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); joystickX = joystickY = 0; save(); } });
window.addEventListener('beforeunload', save);
window.addEventListener('pointerdown', () => { if (settings.sound && running) startAudio(); }, { once: true });
const canvas = $('game');
canvas.addEventListener('pointerdown', e => {
  if (modalType) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x;
  if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) drag.moved = true;
  if (drag.moved) viewForward.applyAxisAngle(player.normal, -dx * 0.005);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && e.pointerType !== 'touch') {
    if (!running) begin();
    pointer.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), RADIUS), new THREE.Vector3());
    if (hit) clickTarget = hit.normalize();
  }
  drag = null;
});
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); settings.zoom = THREE.MathUtils.clamp(settings.zoom - e.deltaY * 0.001, 0.65, 1.4); }, { passive: false });
const joystick = $('joystick'); let joystickPointer = null;
function moveJoystick(e) {
  const rect = joystick.getBoundingClientRect();
  const dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(dx, dy), limit = rect.width * 0.31;
  const factor = distance > limit ? limit / distance : 1;
  joystickX = dx * factor / limit; joystickY = dy * factor / limit;
  $('joystick-knob').style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
}
joystick.addEventListener('pointerdown', e => { e.preventDefault(); if (!running) begin(); joystickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveJoystick(e); });
joystick.addEventListener('pointermove', e => { if (e.pointerId === joystickPointer) moveJoystick(e); });
function resetJoystick() { joystickPointer = null; joystickX = joystickY = 0; $('joystick-knob').style.transform = ''; }
joystick.addEventListener('pointerup', resetJoystick); joystick.addEventListener('pointercancel', resetJoystick);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.12);
  elapsed += dt;
  if (running && !modalType && !document.hidden) {
    const steps = Math.ceil(dt / 0.025);
    for (let step = 0; step < steps; step++) movePlayer(dt / steps);
  }
  else { player.velocity.multiplyScalar(0.8); player.speed = 0; }
  placePlayer(); placeCamera(false, dt);
  scene.fog.near = camera.position.length() + 25;
  scene.fog.far = scene.fog.near + 190;
  world.update?.(elapsed, dt, player.normal); wildlife.update?.(elapsed, dt);
  updateDaylight();
  curiosityRing.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.07);
  const cameraNormal = camera.position.clone().normalize();
  const horizon = RADIUS / camera.position.length() - 0.22;
  for (const child of world.group.children) {
    if (child.isGroup && child.position.lengthSq() > RADIUS * RADIUS * 0.8) {
      child.visible = child.position.clone().normalize().dot(cameraNormal) > horizon;
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.age += dt;
    p.velocity.addScaledVector(p.normal, -6 * dt); p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.scale.setScalar(Math.max(0, 1 - p.age / 1.8));
    if (p.age > 1.8) { scene.remove(p.mesh); particles.splice(i, 1); if (!particles.some(other => other.geo === p.geo)) { p.geo.dispose(); p.mat.dispose(); } }
  }
  if (elapsed - lastSave > 0.1) { findRegion(); updateNearest(); drawMinimap(); lastSave = elapsed; }
  if (settings.sound && running && elapsed - soundTimer > 8) { const notes = [196, 261.63, 293.66, 329.63, 392]; const n = notes[Math.floor(Math.random() * notes.length)]; note(n, 3, 0.11); note(n * 1.5, 3, 0.055, 0.4); soundTimer = elapsed; }
  renderer.render(scene, camera);
}
refreshCounts(); findRegion(); placePlayer(); placeCamera(true);
$('loading').classList.add('hidden');
if (saved.begun) { running = true; $('welcome').classList.add('hidden'); }
window.wanderland = {
  get state() { return { running, region: currentRegion?.name, found: [...found], visited: [...visited], total: world.sites.length, normal: player.normal.toArray(), height: player.height, speed: player.speed, modal: modalType, nearest: nearest?.id, settings: { ...settings } }; },
  sites: world.sites.map(s => ({ id: s.id, kind: s.kind, title: s.title, normal: s.normal.toArray() })),
  regions: world.regions.map(r => ({ id: r.id, name: r.name, normal: r.normal.toArray() })),
  travel: (normal) => travel(new THREE.Vector3(...normal)),
};
animate();
