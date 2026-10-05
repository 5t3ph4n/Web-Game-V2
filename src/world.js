import * as THREE from 'three';

export const RADIUS = 80;
export const surface = (u, v) => new THREE.Vector3(Math.sin(u) * Math.cos(v), Math.cos(u) * Math.cos(v), Math.sin(v));

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const palette = {
  ink: '#48483d', cream: '#e8d8b7', ivory: '#f6e8c6', wood: '#8a6e50', darkWood: '#685844',
  roof: '#ba7763', moss: '#738d65', leaf: '#769764', leafLight: '#98af7b', pine: '#648577',
  stone: '#b4b6a3', water: '#83b5b3', waterLight: '#b4d0bf', orange: '#e5a065', pink: '#d99e95',
};

function seeded(seed = 8293) {
  let state = seed;
  return () => { state = Math.imul(1664525, state) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
}

export function createWorld() {
  const group = new THREE.Group();
  group.name = 'The wandering world';
  const random = seeded();
  const colliders = [];
  const sites = [];
  const paths = [];
  const animated = [];
  const regions = [
    { id: 'bramble', name: 'Bramble Village', description: 'A little village with a very big backyard.', u: 0, v: 0, color: '#aab294', terrain: '#acb393' },
    { id: 'whisper', name: 'Whispering Woods', description: 'Tall pines, secret clearings, and things that glow.', u: 0.91, v: 0.2, color: '#74978a', terrain: '#829d89' },
    { id: 'tide', name: 'Tideglass Coast', description: 'Follow the sea breeze to painted boats and quiet coves.', u: -0.96, v: 0.17, color: '#9bbbc0', terrain: '#c3ba98' },
    { id: 'sun', name: 'Sunstone Valley', description: 'Warm terracotta hills and forgotten archways.', u: 2.05, v: -0.2, color: '#cc9e80', terrain: '#bfa481' },
    { id: 'cloud', name: 'Cloudcap Highlands', description: 'Windmills, wildflowers, and the best view of nowhere.', u: -2.03, v: 0.62, color: '#a8b6a6', terrain: '#a6b3a2' },
    { id: 'moon', name: 'Moonpetal Garden', description: 'A secret garden where curiosity grows wild.', u: 0.25, v: 1.18, color: '#aea9bc', terrain: '#a5aba4' },
  ].map(region => ({ ...region, normal: surface(region.u, region.v) }));

  const ramp = new THREE.DataTexture(new Uint8Array([110, 166, 214, 255]), 4, 1, THREE.RedFormat);
  ramp.needsUpdate = true;
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  const materials = new Map();
  const material = (color, options = {}) => {
    const key = color + JSON.stringify(options);
    if (!materials.has(key)) materials.set(key, new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...options }));
    return materials.get(key);
  };
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.IcosahedronGeometry(1, 1),
    roughBall: new THREE.IcosahedronGeometry(1, 0),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 7),
    crystal: new THREE.OctahedronGeometry(1, 0),
    leaf: new THREE.SphereGeometry(1, 7, 4),
  };
  for (const name of ['ball', 'roughBall', 'crystal']) geometries[name].computeVertexNormals();
  const outlineMaterial = new THREE.LineBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.58 });
  const edgeCache = new Map();
  const mesh = (parent, geometry, color, position = [0, 0, 0], scale = [1, 1, 1], outline = false, options = {}) => {
    const object = new THREE.Mesh(geometry, material(color, options));
    object.position.set(...position);
    object.scale.set(...scale);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    if (outline) {
      if (!edgeCache.has(geometry.uuid)) edgeCache.set(geometry.uuid, new THREE.EdgesGeometry(geometry, 24));
      const edges = new THREE.LineSegments(edgeCache.get(geometry.uuid), outlineMaterial);
      object.add(edges);
    }
    return object;
  };
  const box = (parent, color, position, scale, outline = false) => mesh(parent, geometries.box, color, position, scale, outline);
  const ball = (parent, color, position, scale, rough = false) => mesh(parent, rough ? geometries.roughBall : geometries.ball, color, position, scale);
  const cylinder = (parent, color, position, scale, outline = false) => mesh(parent, geometries.cylinder, color, position, scale, outline);
  const cone = (parent, color, position, scale) => mesh(parent, geometries.cone, color, position, scale);

  const orientation = (normal) => {
    const tangent = new THREE.Vector3(normal.y, -normal.x, 0).normalize();
    if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
    const z = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, normal, z));
  };
  const place = (u, v, height = 0) => {
    const root = new THREE.Group();
    const normal = surface(u, v);
    root.position.copy(normal).multiplyScalar(RADIUS + height);
    root.quaternion.copy(orientation(normal));
    root.userData.normal = normal.clone();
    root.userData.surfaceRadius = RADIUS + height;
    group.add(root);
    return root;
  };
  const collision = (u, v, radius) => colliders.push({ normal: surface(u, v), radius });
  const site = (id, title, kind, description, u, v, builder) => {
    const root = place(u, v, 0.08);
    root.name = title;
    builder(root);
    sites.push({ id, title, kind, description, normal: surface(u, v), group: root });
    return root;
  };

  // The ground is a true sphere: every path and decoration follows the same curvature.
  const terrainGeometry = new THREE.SphereGeometry(RADIUS, 112, 72);
  const terrainPositions = terrainGeometry.attributes.position;
  const terrainColors = new Float32Array(terrainPositions.count * 3);
  const baseColor = new THREE.Color('#a2ae91');
  const temp = new THREE.Vector3();
  for (let i = 0; i < terrainPositions.count; i++) {
    temp.fromBufferAttribute(terrainPositions, i).normalize();
    let color = baseColor.clone();
    let total = 0.22;
    color.multiplyScalar(total);
    for (const region of regions) {
      const angle = Math.acos(THREE.MathUtils.clamp(temp.dot(region.normal), -1, 1));
      const weight = Math.exp(-angle * angle / 0.3);
      color.add(new THREE.Color(region.terrain).multiplyScalar(weight));
      total += weight;
    }
    color.multiplyScalar(1 / total);
    const variation = Math.sin(temp.x * 23 + temp.z * 11) * Math.cos(temp.y * 18 - temp.x * 8) * 0.045;
    color.offsetHSL(0, 0, variation);
    color.toArray(terrainColors, i * 3);
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  const ground = new THREE.Mesh(terrainGeometry, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }));
  ground.receiveShadow = true;
  group.add(ground);

  const patch = (parent, radiusX, radiusZ, color, lift = 0.04, segments = 40) => {
    const positions = [0, lift, 0];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * TAU;
      const x = Math.cos(a) * radiusX, z = Math.sin(a) * radiusZ;
      positions.push(x, Math.sqrt(Math.max(1, RADIUS * RADIUS - x * x - z * z)) - RADIUS + lift, z);
      if (i < segments) indices.push(0, i + 2, i + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return mesh(parent, geometry, color, [0, 0, 0], [1, 1, 1], false, { side: THREE.DoubleSide });
  };

  const path = (points, width = 1.45, color = '#c6ba98') => {
    const positions = [], indices = [];
    let samples = [];
    for (let s = 0; s < points.length - 1; s++) {
      const a = surface(...points[s]), b = surface(...points[s + 1]);
      const count = Math.max(6, Math.ceil(a.angleTo(b) * 80 / 1.7));
      for (let i = 0; i < count; i++) samples.push(a.clone().lerp(b, i / count).normalize());
    }
    samples.push(surface(...points[points.length - 1]));
    paths.push({ points: samples.map(normal => normal.clone()), width, color });
    for (let i = 0; i < samples.length; i++) {
      const current = samples[i];
      const dir = samples[Math.min(i + 1, samples.length - 1)].clone().sub(samples[Math.max(i - 1, 0)]).normalize();
      const side = new THREE.Vector3().crossVectors(dir, current).normalize();
      const left = current.clone().multiplyScalar(RADIUS).addScaledVector(side, width / 2).normalize().multiplyScalar(RADIUS + 0.045);
      const right = current.clone().multiplyScalar(RADIUS).addScaledVector(side, -width / 2).normalize().multiplyScalar(RADIUS + 0.045);
      positions.push(...left.toArray(), ...right.toArray());
      if (i < samples.length - 1) indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(group, geometry, color, [0, 0, 0], [1, 1, 1], false, { side: THREE.DoubleSide });
  };

  function tree(u, v, type = 'round', size = 1) {
    const root = place(u, v);
    root.rotateY(random() * TAU);
    const foliage = [];
    cylinder(root, palette.wood, [0, 1.25 * size, 0], [0.22 * size, 2.5 * size, 0.22 * size]);
    if (type === 'pine') {
      for (let i = 0; i < 3; i++) foliage.push(cone(root, i === 2 ? '#8aa18a' : palette.pine, [0, (2.5 + i * 1.15) * size, 0], [(2.2 - i * 0.4) * size, 2.8 * size, (2.2 - i * 0.4) * size]));
    } else {
      const tint = type === 'pink' ? '#d3a5a3' : type === 'gold' ? '#c7b481' : palette.leaf;
      foliage.push(ball(root, tint, [0, 3.7 * size, 0], [2.05 * size, 1.8 * size, 1.9 * size]));
      foliage.push(ball(root, type === 'pink' ? '#e3b6ad' : palette.leafLight, [-1.1 * size, 3.15 * size, 0.55 * size], [1.35 * size, 1.2 * size, 1.35 * size]));
      foliage.push(ball(root, tint, [1.05 * size, 3.4 * size, -0.45 * size], [1.2 * size, 1.4 * size, 1.25 * size]));
    }
    animated.push({ type:'tree', object:root, foliage, phase:random()*TAU, normal:surface(u,v) });
    collision(u, v, 0.7 * size);
    return root;
  }

  function bush(u, v, color = palette.moss, size = 1) {
    const root = place(u, v);
    ball(root, color, [0, 0.58 * size, 0], [1.1 * size, 0.8 * size, 0.8 * size]);
    ball(root, color, [0.67 * size, 0.4 * size, 0.25 * size], [0.7 * size, 0.6 * size, 0.65 * size]);
  }

  function flowers(u, v, color = '#e6c28b', size = 1) {
    const root = place(u, v, 0.02);
    for (let i = 0; i < 4; i++) {
      const x = (random() - 0.5) * 1.3 * size, z = (random() - 0.5) * 1.3 * size;
      const h = (0.35 + random() * 0.35) * size;
      cylinder(root, '#819271', [x, h / 2, z], [0.035, h, 0.035]);
      ball(root, color, [x, h, z], [0.18 * size, 0.11 * size, 0.18 * size], true);
    }
  }

  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.08,0,0, .02,.52,0, .08,0,0,
    0,0,-.09, 0,.37,.02, 0,0,.09,
    -.065,0,-.05, -.08,.32,.09, .07,0,.04,
  ], 3));
  grassGeometry.computeVertexNormals();
  const grassMaterials = [material('#849d68',{side:THREE.DoubleSide}),material('#9eb37c',{side:THREE.DoubleSide})];
  function grassBed(u,v,rx=2.5,rz=1.6) {
    const root=place(u,v);
    patch(root,rx,rz,'#91a774',.055,24);
    const blades=new THREE.InstancedMesh(grassGeometry,grassMaterials[random()>.5?0:1],55);
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();
    for(let i=0;i<55;i++) {
      const a=random()*TAU,r=Math.sqrt(random());
      const x=Math.cos(a)*r*rx,z=Math.sin(a)*r*rz;
      const h=.5+random()*.8;
      rotation.setFromAxisAngle(UP,random()*TAU);
      matrix.compose(new THREE.Vector3(x,Math.sqrt(RADIUS*RADIUS-x*x-z*z)-RADIUS+.065,z),rotation,new THREE.Vector3(h,h,h));
      blades.setMatrixAt(i,matrix);
    }
    blades.receiveShadow=true;
    root.add(blades);
  }

  function flowerBed(u,v,w=2.7,turn=0) {
    const root=place(u,v);
    root.rotateY(turn);
    box(root,'#aea783',[0,.14,0],[w,.28,.85],true);
    box(root,'#778567',[0,.29,0],[w-.16,.1,.68]);
    for(let i=0;i<6;i++) {
      const x=-w*.4+i*w*.16;
      const z=(random()-.5)*.42;
      const h=.45+random()*.32;
      cylinder(root,'#779066',[x,h*.5+.3,z],[.025,h,.025]);
      ball(root,i%3===0?'#dba99a':i%3===1?'#e9cd93':'#efe2ba',[x,h+.3,z],[.22,.12,.22],true);
    }
  }

  function rock(u, v, size = 1, color = palette.stone) {
    const root = place(u, v, -0.1);
    const object = ball(root, color, [0, 0.6 * size, 0], [1.3 * size, 0.9 * size, 0.9 * size], true);
    object.rotation.set(random() * 0.2, random() * TAU, random() * 0.2);
    collision(u, v, 0.85 * size);
  }

  function window(parent, x, y, z, w = 0.8) {
    box(parent, palette.darkWood, [x, y, z], [w + 0.18, 1.04, 0.12], true);
    box(parent, '#c8d9c1', [x, y, z + 0.08], [w, 0.84, 0.05]);
    box(parent, palette.ivory, [x, y, z + 0.12], [0.07, 0.89, 0.03]);
    box(parent, palette.ivory, [x, y, z + 0.12], [w, 0.07, 0.03]);
    box(parent, palette.darkWood, [x, y - 0.6, z + 0.17], [w + 0.35, 0.18, 0.35]);
  }

  function house(u, v, options = {}) {
    const { wall = palette.cream, roof = palette.roof, w = 4.6, h = 3.4, d = 4.2, turn = 0 } = options;
    const root = place(u, v);
    root.rotateY(turn);
    box(root, '#999a83', [0, 0.2, 0], [w + 0.4, 0.4, d + 0.4], true);
    box(root, wall, [0, h / 2 + 0.35, 0], [w, h, d], true);
    const rw = w / 2 + 0.45, rd = d / 2 + 0.4, bottom = h + 0.3, peak = h + 2.25;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -rw,bottom,-rd, rw,bottom,-rd, 0,peak,-rd,
      -rw,bottom,rd, 0,peak,rd, rw,bottom,rd,
      -rw,bottom,-rd, 0,peak,-rd, 0,peak,rd, -rw,bottom,-rd, 0,peak,rd, -rw,bottom,rd,
      rw,bottom,-rd, rw,bottom,rd, 0,peak,rd, rw,bottom,-rd, 0,peak,rd, 0,peak,-rd,
    ], 3));
    g.computeVertexNormals();
    mesh(root, g, roof, [0,0,0], [1,1,1], true, { side: THREE.DoubleSide });
    box(root, palette.darkWood, [0, 1.25, d / 2 + 0.06], [1.05, 1.85, 0.14], true);
    box(root, '#a5865d', [0, 1.25, d / 2 + 0.15], [0.87, 1.65, 0.04]);
    ball(root, '#e4cf99', [0.27, 1.3, d / 2 + 0.22], [0.075,0.075,0.075]);
    window(root, -w * 0.3, 2.22, d / 2 + 0.04);
    window(root, w * 0.3, 2.22, d / 2 + 0.04);
    box(root, palette.cream, [w * 0.23, h + 1.75, -d * 0.18], [0.78, 2.25, 0.8], true);
    box(root, '#a87e67', [w * 0.23, h + 2.88, -d * 0.18], [0.93,0.18,0.95], true);
    box(root, '#acac93', [0, 0.15, d / 2 + 0.65], [1.7,0.3,1.25], true);
    // A tiny awning makes the village readable from the follow camera.
    const awning = box(root, roof, [0, 2.6, d / 2 + 0.55], [1.8,0.12,1.25], true);
    awning.rotation.x = 0.16;
    collision(u, v, Math.max(w, d) / 2 + 0.55);
    return root;
  }

  function fence(u, v, length = 6, turn = 0) {
    const root = place(u, v);
    root.rotateY(turn);
    for (let i = 0; i <= length / 1.2; i++) box(root, '#d4cfb0', [-length / 2 + i * 1.2, 0.64, 0], [0.15, 1.35, 0.15], true);
    box(root, '#c2ba98', [0,0.58,0], [length,0.14,0.12]);
    box(root, '#c2ba98', [0,1.06,0], [length,0.14,0.12]);
  }

  function lamp(u, v) {
    const root = place(u, v);
    cylinder(root, palette.darkWood, [0, 1.4, 0], [0.08,2.8,0.08]);
    box(root, palette.darkWood, [0.24,2.78,0], [0.55,0.1,0.12]);
    box(root, '#f1d9a4', [0.46,2.42,0], [0.4,0.56,0.4], true);
    cone(root, palette.darkWood, [0.46,2.83,0], [0.36,0.26,0.36]);
  }

  function bench(root) {
    box(root, '#a1835d', [0,0.7,0], [2.4,0.18,0.8], true);
    box(root, '#b2956d', [0,1.2,-0.37], [2.4,0.62,0.14], true);
    for (const x of [-0.85,0.85]) {
      box(root, palette.darkWood, [x,0.32,0], [0.16,0.65,0.65]);
      box(root, palette.darkWood, [x,1,-0.36], [0.12,1.3,0.12]);
    }
  }

  function resident(root, coat = '#cf976c') {
    cylinder(root, coat, [0,0.65,0], [0.31,0.8,0.27]);
    ball(root, '#e1c5a0', [0,1.25,0], [0.3,0.33,0.3]);
    cone(root, '#8c775d', [0,1.62,0], [0.43,0.42,0.43]);
    for (const x of [-0.13,0.13]) {
      box(root, '#60695a', [x,0.14,0], [0.14,0.35,0.17]);
      ball(root, '#3e443c', [x * 0.6,1.3,0.27], [0.035,0.04,0.035]);
    }
    animated.push({ type: 'resident', object: root, base: root.position.clone(), normal: root.position.clone().normalize(), phase: random()*TAU });
  }

  function fountain(root) {
    cylinder(root, '#abb19d', [0,0.16,0], [1.65,0.32,1.65], true);
    cylinder(root, '#c5c7b0', [0,0.45,0], [1.45,0.32,1.45], true);
    cylinder(root, palette.water, [0,0.64,0], [1.22,0.06,1.22]);
    cylinder(root, '#babca5', [0,1.0,0], [0.25,1.2,0.25]);
    cylinder(root, '#d2d0b4', [0,1.65,0], [0.64,0.16,0.64], true);
    ball(root, palette.waterLight, [0,2.04,0], [0.12,0.48,0.12]);
    const drops = new THREE.Group();
    root.add(drops);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      ball(drops, '#c0d7c6', [Math.cos(a)*0.7,1.2+random()*0.6,Math.sin(a)*0.7], [0.07,0.16,0.07]);
    }
    animated.push({ type: 'fountain', object: drops });
  }

  function bell(root) {
    for (const x of [-0.95,0.95]) box(root, palette.darkWood, [x,1.7,0], [0.2,3.4,0.25], true);
    box(root, palette.wood, [0,3.4,0], [2.3,0.25,0.32], true);
    const swinging = new THREE.Group();
    swinging.position.y = 3.1;
    root.add(swinging);
    cone(swinging, '#d1ac64', [0,-0.42,0], [0.6,0.85,0.6]);
    cylinder(swinging, '#d6b875', [0,-0.8,0], [0.63,0.1,0.63]);
    ball(swinging, palette.darkWood, [0,-0.97,0], [0.09,0.14,0.09]);
    animated.push({ type: 'bell', object: swinging });
    box(root, palette.cream, [0,0.54,0.28], [1.05,0.66,0.11], true);
  }

  function campfire(root) {
    for (let i = 0; i < 8; i++) {
      const a = i/8*TAU;
      ball(root, palette.stone, [Math.cos(a)*0.9,0.2,Math.sin(a)*0.9], [0.3,0.25,0.27], true);
    }
    for (let i = 0; i < 3; i++) {
      const log = cylinder(root, palette.wood, [0,0.24+i*0.08,0], [0.16,1.35,0.16]);
      log.rotation.z = Math.PI/2;
      log.rotation.y = i*Math.PI/3;
    }
    const flame = new THREE.Group();
    root.add(flame);
    cone(flame, '#e9a061', [0,0.85,0], [0.46,1.5,0.46]);
    cone(flame, '#f5d296', [0,0.62,0.12], [0.22,1,0.22]);
    const glow=new THREE.PointLight('#edb272',.65,6,2);
    glow.position.y=1.1;
    root.add(glow);
    animated.push({ type: 'flame', object: flame, glow, phase: random()*TAU });
  }

  function windmill(root) {
    const tower = new THREE.CylinderGeometry(1.65,2.4,6.6,8);
    mesh(root,tower,palette.cream,[0,3.3,0],[1,1,1],true);
    cone(root,'#9c8170',[0,7.5,0],[2.1,2.3,2.1]);
    box(root,palette.darkWood,[0,1.1,2.18],[0.95,1.85,0.12],true);
    window(root,0,4.1,1.89,0.65);
    const sails = new THREE.Group();
    sails.position.set(0,6.15,2.1);
    root.add(sails);
    for (let i=0;i<4;i++) {
      const blade = new THREE.Group();
      blade.rotation.z = i*Math.PI/2;
      sails.add(blade);
      box(blade,palette.darkWood,[0,2,0],[0.12,4.3,0.12]);
      box(blade,'#d8d4b3',[0.36,2.68,0],[0.85,2.25,0.12],true);
      for(let j=0;j<4;j++) box(blade,'#aa9e7c',[0.36,1.8+j*0.55,0.08],[0.88,0.06,0.06]);
    }
    ball(root,palette.darkWood,[0,6.15,2.24],[0.28,0.28,0.28]);
    animated.push({ type:'windmill',object:sails });
  }

  function telescope(root) {
    const scope = cylinder(root,'#a8b9ad',[0,1.8,0],[0.25,1.75,0.25],true);
    scope.rotation.x = Math.PI/2-0.33;
    for(let i=0;i<3;i++) {
      const leg = cylinder(root,palette.darkWood,[Math.cos(i*TAU/3)*0.35,0.75,Math.sin(i*TAU/3)*0.35],[0.055,1.6,0.055]);
      leg.rotation.z = Math.sin(i*TAU/3)*0.5;
      leg.rotation.x = Math.cos(i*TAU/3)*0.5;
    }
    cylinder(root,palette.wood,[0,1.3,0],[0.1,0.5,0.1]);
  }

  function mushroom(root) {
    cylinder(root,'#ded5b4',[0,1.2,0],[0.42,2.4,0.42]);
    const capGeometry = new THREE.SphereGeometry(1,14,6,0,TAU,0,Math.PI/2);
    mesh(root,capGeometry,'#bd8e94',[0,2.35,0],[2,1.25,2],true);
    cylinder(root,'#d1aaa4',[0,2.34,0],[2,0.1,2]);
    for(let i=0;i<7;i++) {
      const a=i/7*TAU;
      ball(root,'#eddbc1',[Math.cos(a)*1.3,2.97,Math.sin(a)*1.3],[0.18,0.07,0.18]);
    }
  }

  function crystal(root) {
    cylinder(root,'#999d99',[0,0.13,0],[1.2,0.26,1.2]);
    for(let i=0;i<5;i++) {
      const a=i/5*TAU, h= i===0 ? 3.3 : 1.4+random()*1.2;
      const object = mesh(root,geometries.crystal,i%2?'#a8c9bd':'#bac6d4',[Math.cos(a)*0.7,h*0.45,Math.sin(a)*0.7],[0.4,h*0.6,0.4],true);
      object.rotation.z=(random()-0.5)*0.45;
    }
  }

  function ruins(root) {
    for(const x of [-2,2]) {
      box(root,'#b6b49c',[x,1.6,0],[0.9,3.2,1],true);
      box(root,'#c3c0a5',[x,3.25,0],[1.15,0.3,1.15],true);
    }
    const arch = new THREE.TorusGeometry(2,0.42,5,12,Math.PI);
    mesh(root,arch,'#b8b59c',[0,3.2,0],[1,1,1],true);
    for(let i=0;i<4;i++) box(root,'#a7a991',[(i-1.5)*1.25,0.14,0.65],[1.12,0.28,1.5],true);
    ball(root,palette.moss,[-2.15,0.56,0.65],[0.9,0.7,0.55]);
  }

  function pond(u,v,rx=5,rz=3) {
    const root=place(u,v);
    patch(root,rx+0.6,rz+0.5,'#c5bd9b',0.055);
    patch(root,rx,rz,palette.water,0.075);
    const ripple=patch(root,rx*0.62,rz*0.54,'#a2c6bc',0.087);
    animated.push({type:'water',object:ripple,phase:random()*TAU});
    for(let i=0;i<5;i++) {
      const a=i/5*TAU;
      const x=Math.cos(a)*rx*.76,z=Math.sin(a)*rz*.76;
      const lily=cylinder(root,'#8ca57e',[x,Math.sqrt(RADIUS*RADIUS-x*x-z*z)-RADIUS+0.13,z],[0.33,0.03,0.3]);
      lily.rotation.y=random()*TAU;
      ball(root,'#dfc3b0',[x,0.25-x*x/160-z*z/160,z],[0.12,0.1,0.12]);
    }
    return root;
  }

  function sign(u,v) {
    const root=place(u,v);
    cylinder(root,palette.wood,[0,0.85,0],[0.075,1.7,0.075]);
    box(root,palette.cream,[0.3,1.5,0],[1.35,0.36,0.14],true);
    box(root,palette.cream,[-0.22,1.08,0],[1.25,0.32,0.14],true);
    box(root,'#a6a583',[0.4,1.5,0.081],[0.6,0.045,0.02]);
    box(root,'#a6a583',[-0.4,1.08,0.081],[0.4,0.045,0.02]);
  }

  // The village is deliberately hand placed. Wide clear lanes converge at the starting meadow.
  const village=place(0,0);
  patch(village,16,17,'#a4b18b',0.022);
  path([[-0.39,0.09],[-0.22,0.04],[0,0],[0.17,0.05],[0.41,0.14]],2.6);
  path([[0,-0.34],[0.02,-0.16],[0,0],[0.01,0.2],[0.11,0.36]],2.15);
  path([[-0.2,-0.2],[-0.12,-0.1],[0,0],[0.15,-0.1],[0.25,-0.22]],1.65);
  house(-0.155,0.085,{wall:'#e5d5ad',roof:'#b97b68',turn:Math.PI*0.67});
  house(0.17,0.105,{wall:'#d6d2b0',roof:'#879b8e',turn:-Math.PI*0.66});
  house(-0.175,-0.13,{wall:'#d6c5a7',roof:'#a78974',turn:0.35});
  house(0.18,-0.17,{wall:'#e1d0aa',roof:'#bb836c',w:5.4,turn:-0.35});
  house(-0.3,0.19,{wall:'#e7d9b9',roof:'#8a9e91',w:4,turn:1.6});
  house(0.3,0.23,{wall:'#d6d2ad',roof:'#a98d73',w:4.2,turn:-1.4});
  fence(-0.21,0.005,6,0.2);
  fence(0.22,-0.065,7,-0.2);
  fence(-0.11,-0.22,5,Math.PI/2);
  fence(0.31,0.115,5,Math.PI/2);
  for(const [u,v] of [[-.09,.13],[.1,.16],[-.11,-.055],[.095,-.11],[-.26,.09],[.29,.04]]) lamp(u,v);
  sign(-0.047,-0.041);
  sign(0.37,0.14);
  pond(-0.26,-0.22,4.8,3.1);
  for(const [u,v] of [[-.1,.2],[-.27,-.04],[.29,-.13],[.32,.32],[-.33,.3],[-.38,.02],[.08,.3],[-.1,-.32],[.32,-.29]]) tree(u,v,'round',0.85+random()*0.25);
  for(const [u,v] of [[-.09,.08],[-.11,-.17],[.095,.11],[.26,-.11],[-.3,.24],[.32,.19],[-.25,-.19]]) bush(u,v);
  for(const [u,v,rx,rz] of [
    [-.16,.15,3.5,1.8],[.17,.17,3.6,1.9],[-.22,-.13,2.5,3],
    [.24,-.17,2.9,2.8],[-.24,.24,3.5,2.3],[.32,.3,3.4,2.8],
    [-.27,-.28,4,2.5],[-.37,.15,3.7,2.2],[.35,-.1,3.3,2.2],
    [.29,-.32,4,2.8],[-.12,.28,3.3,2.1],[.2,.28,3.2,2.2],
    [-.17,-.29,3,2.5],[.12,-.27,3.4,2.2],[-.07,.22,2.4,2.1],
  ]) grassBed(u,v,rx,rz);
  for(const [u,v,w,turn] of [
    [-.151,.125,3.1,.4],[.173,.143,3.1,-.4],[-.175,-.085,2.9,.35],
    [.185,-.12,3.4,-.35],[-.28,.217,2.7,1.6],[.275,.21,2.8,-1.4],
  ]) flowerBed(u,v,w,turn);
  for(const [u,v] of [[-.33,-.07],[-.28,-.33],[-.4,.2],[-.23,.33],[-.06,.4],[.25,.37],[.41,.25],[.43,.01],[.36,-.2],[.15,-.4],[-.05,-.4],[-.38,-.25]]) {
    tree(u,v,random()>.7?'pine':'round',1.1+random()*.3);
    bush(u+.019,v-.014,'#6d8860',1.3);
  }
  for(let i=0;i<25;i++) {
    const a=random()*TAU,r=0.12+random()*0.2;
    flowers(Math.cos(a)*r,Math.sin(a)*r,i%3===0?'#d5a39b':i%3===1?'#e0c385':'#eee1b5',0.85);
  }

  site('village-fountain','The Wishing Fountain','fountain','Make a wish. The world has a habit of listening.',0.061,0.035,fountain);
  site('village-bell','The Little Bell','bell','Ring the bell and say hello to the whole village.',-0.089,0.028,bell);
  site('village-bench','A Moment in the Meadow','bench','A comfortable place to do absolutely nothing.',0.01,-0.09,bench);
  site('village-mira','Mira the Wanderer','resident','Mira has been everywhere. Her favorite place is still here.',-0.095,-0.075,root=>resident(root,'#a7aaa2'));
  site('village-fire','The Gathering Place','campfire','Every good adventure begins with a warm place to return to.',0.23,0.04,campfire);
  const villageMill=site('village-mill','Bramble Windmill','windmill','Turning slowly, making nothing in particular.',0.075,0.31,windmill);
  collision(0.075,0.31,2.65);
  flowers(.045,.28,'#e6c28c'); flowers(.12,.3,'#d5a3a3');
  const horizonMill=place(-.055,-.39);
  horizonMill.scale.setScalar(1.12);
  windmill(horizonMill);
  collision(-.055,-.39,2.9);
  path([[0,-.34],[-.055,-.39]],1.4);
  grassBed(-.09,-.4,4,3);

  // Long trails make the planet one continuous place rather than isolated scenes.
  path([[.41,.14],[.63,.08],[.8,.15],[.91,.2]],1.55);
  path([[-.39,.09],[-.58,.18],[-.77,.12],[-.96,.17]],1.55);
  path([[.91,.2],[1.2,.08],[1.53,-.12],[1.82,-.2],[2.05,-.2]],1.45,'#c4b190');
  path([[-.96,.17],[-1.22,.28],[-1.56,.4],[-1.8,.57],[-2.03,.62]],1.45);
  path([[.11,.36],[.18,.6],[.32,.8],[.25,1.18]],1.5);
  path([[2.05,-.2],[2.38,.06],[2.7,.32],[-2.75,.49],[-2.03,.62]],1.4);
  path([[.91,.2],[.82,.52],[.64,.82],[.25,1.18]],1.3);

  // Whispering Woods: clearings, giant mushrooms, and an old stone gate.
  const woods=place(.91,.2);
  patch(woods,20,17,'#8ba58c',0.022);
  pond(.78,.3,5,3.5);
  site('woods-mushroom','The Umbrella Grove','mushroom','Someone has left a very large umbrella in the woods.',.93,.14,mushroom);
  site('woods-fire','The Forest Hearth','campfire','A quiet camp tucked between the whispering trees.',.83,.21,campfire);
  site('woods-arch','The Mossy Gate','ruins','A doorway with no wall. Perhaps the wall was the unnecessary part.',1.06,.27,ruins);
  site('woods-keeper','Fern the Forest Keeper','resident','Fern knows the name of every tree, and most of the stones.',.96,.29,root=>resident(root,'#869b80'));
  for(let i=0;i<32;i++) {
    const a=random()*TAU,r=.11+random()*.22;
    tree(.91+Math.cos(a)*r,.2+Math.sin(a)*r,'pine',.75+random()*.5);
  }
  for(let i=0;i<10;i++) {
    bush(.7+random()*.4,.02+random()*.35,'#78957f');
    flowers(.7+random()*.4,.03+random()*.35,'#c4b5bc',.8);
  }

  // Tideglass: a turquoise cove, weathered cottages, and a tiny working harbor.
  const coast=place(-.96,.17);
  patch(coast,21,19,'#c9c2a0',.03);
  const sea=place(-1.08,.33);
  patch(sea,17,12,'#78aaa9',.058);
  patch(sea,14,9,'#8abcb4',.071);
  patch(sea,8,5,'#9ac7bc',.081);
  house(-.88,.11,{wall:'#e0d9b9',roof:'#8baba3',w:4.2,turn:1.4});
  house(-1.08,.1,{wall:'#d4c6a5',roof:'#a48e77',w:3.8,turn:2.2});
  const dock=place(-1.055,.23);
  for(let i=0;i<12;i++) box(dock,'#ad9979',[0,.26,i*.62],[2.2,.16,.51],true);
  for(const x of [-1.0,1.0]) for(const z of [0,3,6]) cylinder(dock,palette.wood,[x,.37,z],[.1,1.4,.1]);
  function boat(root) {
    const hull=ball(root,'#b68970',[0,.3,0],[1.1,.48,2.0],true);
    hull.rotation.z=.05;
    box(root,'#d0b48b',[0,.5,0],[1.6,.1,2.7],true);
    cylinder(root,palette.darkWood,[0,1.75,0],[.055,3,.055]);
    const sailGeometry=new THREE.BufferGeometry();
    sailGeometry.setAttribute('position',new THREE.Float32BufferAttribute([.1,.85,0,.1,3.15,0,1.35,1.05,0],3));
    sailGeometry.computeVertexNormals();
    mesh(root,sailGeometry,'#e5dbc0',[0,0,0],[1,1,1],false,{side:THREE.DoubleSide});
    animated.push({type:'boat',object:root,base:root.position.clone(),normal:root.position.clone().normalize(),phase:random()*TAU});
  }
  site('coast-boat','The Paper Sail','boat','A little boat dreaming of very big seas.',-1.12,.3,boat);
  site('coast-bench','The Seaside Seat','bench','Watch the water. It never repeats itself.',-.99,.25,bench);
  site('coast-bell','The Harbor Bell','bell','A friendly sound for anyone coming home.',-.89,.25,bell);
  site('coast-sailor','Captain Pip','resident','Pip insists that getting lost is a perfectly good destination.',-1.01,.13,root=>resident(root,'#94aaa7'));
  for(let i=0;i<13;i++) {
    const a=random()*TAU;
    rock(-.96+Math.cos(a)*(.2+random()*.09),.17+Math.sin(a)*(.2+random()*.08),.5+random()*.7,'#bbbca8');
  }
  for(const [u,v] of [[-.72,.1],[-.78,.26],[-1.2,.08],[-1.16,-.05],[-.96,-.07]]) tree(u,v,'round',.8);
  flowers(-.91,.05,'#ebe0b4'); flowers(-1.04,.04,'#d5a69e');

  // Sunstone: broken architecture among amber trees and rounded desert stones.
  const valley=place(2.05,-.2);
  patch(valley,22,18,'#c6ae89',.035);
  site('valley-arch','The Sunstone Arch','ruins','An old stone remembers every sunrise.',2.09,-.17,ruins);
  site('valley-crystal','Amberlight Stones','crystal','Little pieces of sky, caught in the earth.',1.91,-.14,crystal);
  site('valley-fire','The Ember Circle','campfire','The warmth of the day lingers here.',2.07,-.32,campfire);
  site('valley-observer','The Stargazer','telescope','Somewhere above this little world, there may be another.',2.24,-.2,telescope);
  for(let i=0;i<20;i++) {
    const a=random()*TAU,r=.14+random()*.2;
    rock(2.05+Math.cos(a)*r,-.2+Math.sin(a)*r,.7+random()*1.6,'#b49e83');
  }
  for(let i=0;i<10;i++) tree(1.8+random()*.5,-.45+random()*.5,'gold',.7+random()*.3);
  for(let i=0;i<8;i++) flowers(1.85+random()*.38,-.36+random()*.3,'#e0bd7b');

  // Cloudcap: a high meadow of windmills, stone cairns, and a mountain stream.
  const highland=place(-2.03,.62);
  patch(highland,23,18,'#abb79d',.025);
  site('highland-mill','The Cloudcap Windmill','windmill','A good place to watch the world go round.',-2.07,.64,windmill);
  collision(-2.07,.64,2.6);
  site('highland-scope','The Faraway Telescope','telescope','There is always something just beyond the horizon.',-1.88,.7,telescope);
  site('highland-bench','The Highest Picnic','bench','A little rest, a big view.',-2.18,.72,bench);
  site('highland-resident','Ollie of the Hills','resident','Ollie collects clouds. His collection is always changing.',-2.01,.53,root=>resident(root,'#b7a481'));
  house(-2.24,.57,{wall:'#e0d9ba',roof:'#8d9e8c',w:3.7,turn:1.6});
  pond(-1.93,.49,6,3.5);
  path([[-1.93,.49],[-2.03,.42],[-2.11,.31]],.72,'#91bbb4');
  for(let i=0;i<18;i++) {
    rock(-2.3+random()*.6,.4+random()*.42,.6+random()*1.2);
    flowers(-2.3+random()*.6,.42+random()*.42,i%2?'#e6ddbc':'#d1a2a1',1.1);
  }
  for(let i=0;i<11;i++) tree(-2.4+random()*.7,.4+random()*.4,'pine',.7+random()*.35);

  // Moonpetal: pink trees, reflecting pools, and a secret circular garden.
  const garden=place(.25,1.18);
  patch(garden,21,17,'#b7b2a8',.03);
  pond(.26,1.19,5,4);
  site('garden-crystal','The Moonpetal Heart','crystal','A tiny piece of moonlight with a very patient glow.',.11,1.12,crystal);
  site('garden-mushroom','The Dreaming Mushroom','mushroom','The garden seems a little bigger from beneath its cap.',.43,1.19,mushroom);
  site('garden-bell','The Gentle Chime','bell','A soft sound for a quiet corner of the world.',.23,1.32,bell);
  site('garden-bench','The Reflection Seat','bench','Sit beside the pond and let your thoughts wander.',.38,1.09,bench);
  for(let i=0;i<22;i++) {
    const a=random()*TAU,r=.15+random()*.12;
    tree(.25+Math.cos(a)*r,1.18+Math.sin(a)*r*.55,'pink',.75+random()*.35);
  }
  for(let i=0;i<14;i++) flowers(.0+random()*.5,1.02+random()*.29,i%2?'#d9b0b7':'#ece0bf',1);

  // Details on the trails reward the walk between the larger places.
  const trailTrees = [
    [.48,.24],[.55,-.01],[.67,.22],[.62,.3],[.39,.44],[.26,.57],[.44,.67],
    [-.45,-.05],[-.56,.32],[-.63,.08],[-.76,-.03],[-1.29,.16],[-1.39,.41],[-1.55,.26],[-1.74,.48],
    [1.25,.17],[1.39,-.03],[1.56,-.24],[1.67,.01],[1.84,-.35],
    [2.4,.19],[2.59,.26],[-2.76,.58],[-2.52,.35],[.76,.64],[.6,.82],
  ];
  for(let i=0;i<trailTrees.length;i++) tree(...trailTrees[i],i%3===0?'pine':i%5===0?'gold':'round',.8+random()*.25);
  for(let i=0;i<25;i++) {
    const [u,v]=trailTrees[i];
    flowers(u+.027,v-.027,i%2?'#d2a39f':'#e4cf97',.85);
    if(i%3===0) rock(u-.035,v+.018,.7);
  }
  for(const [u,v] of [[.55,.08],[-.64,.18],[1.43,-.08],[-1.53,.39],[.28,.73]]) sign(u,v);

  // Small wild groves fill the far side of the globe. Their shared instanced meshes
  // keep the complete planet inexpensive when seen from the welcome camera.
  const forestBatches = { trunk:[], crown:[], pine:[], shrub:[] };
  const lakeSpecs=[[.66,-.64,12,8.5],[-.56,-.56,11,7],[2.68,-.62,13,9]];
  const roadNormals=paths.flatMap(trail=>trail.points);
  const awayFromRoad=(normal,margin=3.8)=>!roadNormals.some(road=>normal.dot(road)>Math.cos(margin/RADIUS));
  const forestCenters=[];
  for(let attempt=0;attempt<350&&forestCenters.length<24;attempt++) {
    const u=random()*TAU-Math.PI,v=Math.asin(random()*2-1);
    const normal=surface(u,v);
    if(regions.some(region=>normal.dot(region.normal)>Math.cos(.38))) continue;
    if(lakeSpecs.some(([lu,lv])=>normal.dot(surface(lu,lv))>Math.cos(.27))) continue;
    if(!awayFromRoad(normal,8)) continue;
    if(forestCenters.some(center=>normal.dot(center.normal)>Math.cos(.21))) continue;
    forestCenters.push({u,v,normal});
  }
  const instanceAt=(batch,normal,localPosition,scale,color)=>{
    const rotation=orientation(normal);
    const position=new THREE.Vector3(...localPosition).applyQuaternion(rotation).addScaledVector(normal,RADIUS);
    batch.push({matrix:new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(...scale)),color});
  };
  for(const center of forestCenters) {
    const grove=place(center.u,center.v);
    patch(grove,7.5,5.4,'#859a79',.03,20);
    for(let i=0;i<3;i++) {
      const a=i/3*TAU+random(),spread=.02+random()*.045;
      const u=center.u+Math.cos(a)*spread/Math.max(.35,Math.cos(center.v));
      const v=THREE.MathUtils.clamp(center.v+Math.sin(a)*spread,-1.49,1.49);
      const normal=surface(u,v);
      if(!awayFromRoad(normal)) continue;
      const size=.85+random()*.65;
      instanceAt(forestBatches.trunk,normal,[0,1.4*size,0],[.2*size,2.8*size,.2*size],palette.wood);
      if(i===0) {
        for(let layer=0;layer<3;layer++) instanceAt(forestBatches.pine,normal,[0,(2.5+layer*1.1)*size,0],[(2.1-layer*.4)*size,2.6*size,(2.1-layer*.4)*size],layer===2?'#88a082':'#638270');
      } else {
        instanceAt(forestBatches.crown,normal,[0,3.9*size,0],[2.05*size,1.8*size,1.9*size],i===1?'#7f9e6c':'#719463');
        instanceAt(forestBatches.crown,normal,[-1.1*size,3.1*size,.5*size],[1.25*size,1.3*size,1.3*size],'#98b17b');
      }
      collision(u,v,.7*size);
    }
    instanceAt(forestBatches.shrub,center.normal,[3.1,.65,1.8],[1.35,.9,1.05],'#7c966b');
    instanceAt(forestBatches.shrub,center.normal,[-2.7,.55,-1.5],[1.1,.8,.9],'#8fa676');
  }
  for(const [key,entries] of Object.entries(forestBatches)) {
    if(!entries.length) continue;
    const geometry=key==='trunk'?geometries.cylinder:key==='pine'?geometries.cone:geometries.ball;
    const instances=new THREE.InstancedMesh(geometry,material('#ffffff'),entries.length);
    for(let i=0;i<entries.length;i++) {
      instances.setMatrixAt(i,entries[i].matrix);
      instances.setColorAt(i,new THREE.Color(entries[i].color));
    }
    instances.castShadow=instances.receiveShadow=true;
    instances.name=`Distant ${key} groves`;
    group.add(instances);
  }

  // Three broad, asymmetrical lakes and their rocky shores are visible from orbit.
  for(const [u,v,rx,rz] of lakeSpecs) {
    const lake=place(u,v);
    patch(lake,rx+1.3,rz+1.1,'#bbb598',.055);
    patch(lake,rx,rz,'#7dada9',.07);
    const lobe=place(u+.065,v+.035);
    patch(lobe,rx*.62,rz*.75,'#7dada9',.075);
    const inset=place(u-.025,v+.005);
    patch(inset,rx*.72,rz*.7,'#91bcb0',.085);
    for(let i=0;i<9;i++) {
      const a=i/9*TAU;
      rock(u+Math.cos(a)*(rx+.6)/RADIUS/Math.cos(v),v+Math.sin(a)*(rz+.6)/RADIUS,.7+random()*1.1,'#b0b29e');
    }
    tree(u-.19,v-.08,'round',1.1);
    tree(u-.16,v+.12,'round',.95);
  }
  const lookout=place(-.53,-.39);
  telescope(lookout);
  const lookoutBench=new THREE.Group();
  lookoutBench.position.z=-2.2;
  lookout.add(lookoutBench);
  bench(lookoutBench);
  grassBed(-.55,-.39,3.6,2.6);

  // Hand-made pennants animate gently in the village square.
  const bunting=place(0,.145);
  for(const x of [-4.2,4.2]) cylinder(bunting,palette.wood,[x,2.1,0],[.065,4.2,.065]);
  const rope=box(bunting,palette.darkWood,[0,3.72,0],[8.5,.035,.035]);
  for(let i=0;i<10;i++) {
    const flag=cone(bunting,i%3===0?'#d4a28b':i%3===1?'#a6bba6':'#ddcd9e',[-3.7+i*.82,3.45-Math.sin(i/9*Math.PI)*.3,0],[.23,.45,.025]);
    flag.rotation.z=Math.PI;
    animated.push({type:'flag',object:flag,phase:i*.7});
  }

  // Tiny birds circle above the village and the coast, casting moving shadows.
  for(let i=0;i<7;i++) {
    const bird=new THREE.Group();
    const wingGeometry=new THREE.BufferGeometry();
    wingGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.7,.15,-.1,-.35,0,.25,0,0,0,.7,.15,-.1,.35,0,.25],3));
    wingGeometry.computeVertexNormals();
    mesh(bird,wingGeometry,'#777f72',[0,0,0],[1,1,1],false,{side:THREE.DoubleSide});
    group.add(bird);
    animated.push({type:'bird',object:bird,phase:i*TAU/7,center:i<4?surface(0,.05):surface(-.97,.18),radius:8+random()*7,height:9+random()*6});
  }

  return {
    group, regions, sites, paths, colliders, spawn: surface(0,0),
    update(time,dt,playerNormal) {
      for(const item of animated) {
        const {object,type,phase=0}=item;
        if(type==='windmill') {
          const since=time-(object.parent.userData.activatedAt ?? -100);
          object.rotation.z -= dt*(.26+(since>=0&&since<8?1.5*(1-since/8):0));
        }
        else if(type==='fountain') {
          object.rotation.y=time*.25;
          object.children.forEach((drop,i)=>{drop.position.y=.9+((time*.55+i*.17)%1)*.9;});
        }
        else if(type==='flame') {
          object.scale.set(1+Math.sin(time*5+phase)*.1,1+Math.sin(time*7+phase)*.13,1+Math.cos(time*6+phase)*.08);
          item.glow.intensity=.7+Math.sin(time*6+phase)*.12;
        }
        else if(type==='water') object.material.color.set(palette.waterLight).offsetHSL(0,0,Math.sin(time*.8+phase)*.015);
        else if(type==='bell') {
          const ringing=time-(object.parent.userData.activatedAt ?? -100);
          object.rotation.z=ringing<5?Math.sin(ringing*8)*.34*Math.exp(-ringing*.65):Math.sin(time*.6)*.025;
        }
        else if(type==='resident') object.position.copy(item.base).addScaledVector(item.normal,Math.sin(time*1.5+phase)*.035);
        else if(type==='boat') object.position.copy(item.base).addScaledVector(item.normal,Math.sin(time*1.1+phase)*.1);
        else if(type==='flag') object.rotation.x=Math.sin(time*2+phase)*.13;
        else if(type==='tree'&&object.visible) {
          const close=playerNormal&&item.normal.dot(playerNormal)>.9985;
          for(let i=0;i<item.foliage.length;i++) {
            item.foliage[i].rotation.z=Math.sin(time*(close?2.7:.85)+phase+i*.6)*(close?.035:.012);
            item.foliage[i].rotation.x=Math.cos(time*.65+phase+i*.7)*.009;
          }
        }
        else if(type==='bird') {
          const a=time*.17+phase;
          const basis=new THREE.Vector3(1,0,0).applyQuaternion(orientation(item.center));
          const side=new THREE.Vector3(0,0,1).applyQuaternion(orientation(item.center));
          const normal=item.center.clone().multiplyScalar(RADIUS).addScaledVector(basis,Math.cos(a)*item.radius).addScaledVector(side,Math.sin(a)*item.radius).normalize();
          object.position.copy(normal).multiplyScalar(RADIUS+item.height+Math.sin(time*.8+phase)*.6);
          object.quaternion.copy(orientation(normal));
          object.rotateY(-a);
          object.children[0].scale.y=1+Math.sin(time*5+phase)*.35;
        }
      }
    },
  };
}
