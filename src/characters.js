import * as THREE from 'three';

// Every creature is made from simple, deliberately chunky shapes. No textures needed.
const C = {
  cream: 0xffedc7,
  dark: 0x333c36,
  olive: 0x658365,
  scarf: 0x426c59,
  orange: 0xc46e43,
  leather: 0x78493b,
  white: 0xfffaf0,
};
const materials = new Map();
function material(color, extra = {}) {
  const key = `${color}-${JSON.stringify(extra)}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra }));
  return materials.get(key);
}
function mesh(geometry, color, parent, position = [0, 0, 0], scale = [1, 1, 1], extra = {}) {
  const object = new THREE.Mesh(geometry, material(color, extra));
  object.position.set(...position);
  object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function ball(parent, color, position, scale, detail = 1) {
  return mesh(new THREE.IcosahedronGeometry(1, detail), color, parent, position, scale);
}
function cylinder(parent, color, position, top, bottom, height, segments = 8) {
  return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), color, parent, position);
}
function limb(parent, x) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.93, 0);
  parent.add(pivot);
  cylinder(pivot, C.leather, [0, -0.3, 0], 0.105, 0.09, 0.65, 7);
  // A broad toe makes the walking cycle readable even at a distance.
  ball(pivot, C.dark, [0, -0.76, 0.11], [0.17, 0.17, 0.26]);
  return pivot;
}

export function createTraveler() {
  const group = new THREE.Group();
  group.name = 'Wanderer';
  const body = new THREE.Group();
  group.add(body);
  const leftLeg = limb(body, -0.23);
  const rightLeg = limb(body, 0.23);

  // Soft, flared cream poncho with a green edge and a small opening at the neck.
  const poncho = cylinder(body, C.cream, [0, 1.31, 0], 0.3, 0.64, 0.91, 9);
  poncho.scale.z = 0.72;
  const hem = cylinder(body, C.olive, [0, 0.872, 0], 0.64, 0.65, 0.065, 9);
  hem.scale.z = 0.73;
  const chest = ball(body, C.cream, [0, 1.65, 0], [0.32, 0.25, 0.26]);
  cylinder(body, C.cream, [0, 1.92, 0], 0.15, 0.17, 0.32, 7);

  // Round orange pack with its own lid, leather straps and a little pale patch.
  ball(body, C.orange, [0, 1.34, -0.44], [0.46, 0.54, 0.27], 2);
  ball(body, C.leather, [0, 1.72, -0.51], [0.39, 0.1, 0.23]);
  for (const x of [-0.2, 0.2]) {
    const strap = mesh(new THREE.BoxGeometry(0.07, 0.67, 0.035), C.leather, body, [x, 1.47, 0.258]);
    strap.rotation.z = x < 0 ? -0.12 : 0.12;
    mesh(new THREE.BoxGeometry(0.07, 0.35, 0.04), C.leather, body, [x, 1.31, -0.695]);
  }
  mesh(new THREE.BoxGeometry(0.16, 0.12, 0.025), C.cream, body, [0, 1.33, -0.716]);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.42, 1.6, 0);
    arm.rotation.z = side * 0.18;
    body.add(arm);
    ball(arm, C.cream, [side * 0.03, -0.12, 0], [0.2, 0.28, 0.18]);
    cylinder(arm, C.olive, [side * 0.06, -0.36, 0.03], 0.1, 0.09, 0.26, 7);
    ball(arm, C.cream, [side * 0.08, -0.53, 0.07], [0.105, 0.12, 0.1]);
    arms.push(arm);
  }

  const head = new THREE.Group();
  head.position.set(0, 2.25, 0.04);
  body.add(head);
  ball(head, C.cream, [0, 0, 0], [0.41, 0.415, 0.385], 2);
  // Tiny dot eyes, warm ears, and a single little nose.
  for (const x of [-0.135, 0.135]) {
    ball(head, C.dark, [x, 0.025, 0.356], [0.031, 0.048, 0.025]);
    ball(head, 0xe5bb92, [Math.sign(x) * 0.397, -0.035, 0.02], [0.065, 0.09, 0.065]);
  }
  ball(head, 0xe8c7a2, [0, -0.055, 0.389], [0.048, 0.056, 0.044]);
  ball(head, C.olive, [0, 0.26, -0.025], [0.423, 0.235, 0.395], 2);
  const brim = cylinder(head, C.olive, [0, 0.205, 0.11], 0.435, 0.435, 0.055, 12);
  brim.scale.z = 1.11;
  ball(head, C.dark, [0, 0.473, -0.035], [0.065, 0.027, 0.065]);
  // A cream stitch band gives the cap a distinct handmade silhouette.
  const band = cylinder(head, 0x9cac79, [0, 0.23, 0], 0.418, 0.418, 0.045, 12);
  band.scale.z = 0.925;

  const collar = cylinder(body, C.scarf, [0, 1.91, 0], 0.24, 0.27, 0.18, 9);
  collar.scale.z = 0.86;
  const scarf = new THREE.Group();
  scarf.position.set(0.2, 1.89, 0.18);
  body.add(scarf);
  const tail = mesh(new THREE.BoxGeometry(0.16, 0.43, 0.045), C.scarf, scarf, [0, -0.19, 0.06]);
  tail.rotation.x = 0.12;
  mesh(new THREE.BoxGeometry(0.17, 0.04, 0.055), 0x9bba8c, scarf, [0, -0.386, 0.085]);

  const animate = (time, speed = 0, jumping = false) => {
    const walking = THREE.MathUtils.clamp(Math.abs(speed) / 3.5, 0, 1);
    const cycle = time * (8 + Math.min(Math.abs(speed), 10) * 0.5);
    const swing = Math.sin(cycle) * 0.62 * walking;
    leftLeg.rotation.x = jumping ? -0.55 : swing;
    rightLeg.rotation.x = jumping ? 0.4 : -swing;
    body.position.y = jumping ? 0.02 : Math.abs(Math.sin(cycle)) * 0.055 * walking;
    body.rotation.z = Math.sin(cycle) * 0.026 * walking;
    arms[0].rotation.x = jumping ? -1 : -swing * 0.65;
    arms[1].rotation.x = jumping ? -1 : swing * 0.65;
    head.rotation.y = Math.sin(time * 0.9) * 0.055 * (1 - walking);
    head.rotation.z = Math.sin(time * 1.6) * 0.02;
    scarf.rotation.x = 0.07 + Math.sin(time * 4) * (0.055 + walking * 0.14);
    scarf.rotation.z = Math.sin(time * 3.4) * 0.08;
    chest.scale.y = 0.25 + Math.sin(time * 2) * 0.008;
  };
  return { group, animate };
}

function createBird() {
  const group = new THREE.Group();
  ball(group, C.white, [0, 0, 0], [0.14, 0.13, 0.3]);
  ball(group, C.white, [0, 0.045, 0.25], [0.13, 0.135, 0.15]);
  const beak = mesh(new THREE.ConeGeometry(0.043, 0.13, 5), 0xd6a15c, group, [0, 0.035, 0.41]);
  beak.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) ball(group, C.dark, [side * 0.116, 0.084, 0.293], [0.014, 0.017, 0.018]);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.x = side * 0.09;
    group.add(wing);
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.13, side * 0.41, 0.05, 0.1, side * 0.79, 0.02, -0.22,
      0, 0, 0.13, side * 0.79, 0.02, -0.22, side * 0.23, 0, -0.22,
    ], 3));
    shape.computeVertexNormals();
    mesh(shape, C.white, wing, [0, 0, 0], [1, 1, 1], { side: THREE.DoubleSide });
    wings.push(wing);
  }
  const tail = mesh(new THREE.ConeGeometry(0.14, 0.3, 3), C.white, group, [0, 0, -0.35]);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.y = 0.65;
  return { group, wings };
}

function createRabbit(color) {
  const group = new THREE.Group();
  ball(group, color, [0, 0.3, -0.04], [0.23, 0.3, 0.35]);
  ball(group, color, [0, 0.5, 0.19], [0.19, 0.2, 0.19]);
  for (const side of [-1, 1]) {
    const ear = ball(group, color, [side * 0.095, 0.82, 0.16], [0.055, 0.28, 0.062]);
    ear.rotation.z = -side * 0.13;
    const inner = ball(group, 0xd6a48e, [side * 0.098, 0.82, 0.211], [0.022, 0.21, 0.012]);
    inner.rotation.z = -side * 0.13;
    ball(group, C.dark, [side * 0.105, 0.54, 0.34], [0.018, 0.024, 0.016]);
    ball(group, color, [side * 0.16, 0.09, 0.16], [0.12, 0.085, 0.19]);
  }
  ball(group, C.white, [0, 0.33, -0.36], [0.12, 0.12, 0.12]);
  ball(group, 0xa87062, [0, 0.45, 0.374], [0.032, 0.026, 0.022]);
  return group;
}

function createDeer() {
  const group = new THREE.Group();
  const coat = 0xb7875b;
  ball(group, coat, [0, 0.78, -0.06], [0.29, 0.34, 0.55]);
  ball(group, 0xe9d7b8, [0, 0.72, 0.26], [0.22, 0.27, 0.21]);
  const legs = [];
  for (const x of [-0.17, 0.17]) for (const z of [-0.37, 0.29]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.64, z);
    group.add(leg);
    cylinder(leg, coat, [0, -0.25, 0], 0.048, 0.039, 0.53, 5);
    ball(leg, C.dark, [0, -0.54, 0.028], [0.065, 0.065, 0.09]);
    legs.push(leg);
  }
  const neck = cylinder(group, coat, [0, 1.08, 0.38], 0.115, 0.2, 0.65, 7);
  neck.rotation.x = -0.3;
  ball(group, coat, [0, 1.45, 0.5], [0.19, 0.22, 0.26]);
  ball(group, 0xe9d7b8, [0, 1.35, 0.69], [0.15, 0.12, 0.16]);
  ball(group, C.dark, [0, 1.37, 0.808], [0.067, 0.043, 0.03]);
  for (const side of [-1, 1]) {
    const ear = ball(group, coat, [side * 0.25, 1.63, 0.48], [0.15, 0.08, 0.065]);
    ear.rotation.z = side * 0.5;
    ball(group, C.dark, [side * 0.148, 1.47, 0.656], [0.022, 0.029, 0.02]);
    const antler = cylinder(group, 0x795e45, [side * 0.14, 1.78, 0.45], 0.025, 0.04, 0.4, 5);
    antler.rotation.z = -side * 0.28;
    const tip = cylinder(group, 0x795e45, [side * 0.2, 1.94, 0.48], 0.017, 0.025, 0.17, 5);
    tip.rotation.x = -0.65;
  }
  ball(group, C.white, [0, 0.92, -0.61], [0.11, 0.12, 0.15]);
  // A few larger pale spots read better than a fine texture on a small animal.
  for (const side of [-1, 1]) for (let j = 0; j < 3; j++) {
    ball(group, 0xe9d7b8, [side * 0.273, 0.91, -0.31 + j * 0.19], [0.019, 0.045, 0.045]);
  }
  return { group, legs };
}

const normal = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const orientation = new THREE.Matrix4();
function orientOnSphere(object, position, direction) {
  object.position.copy(position);
  normal.copy(position).normalize();
  forward.copy(direction).addScaledVector(normal, -direction.dot(normal)).normalize();
  right.crossVectors(normal, forward).normalize();
  forward.crossVectors(right, normal).normalize();
  orientation.makeBasis(right, normal, forward);
  object.quaternion.setFromRotationMatrix(orientation);
}

export function createWildlife() {
  const group = new THREE.Group();
  group.name = 'Wandering wildlife';
  const birds = [];
  for (let i = 0; i < 10; i++) {
    const bird = createBird();
    const scale = 0.65 + (i % 3) * 0.18;
    bird.group.scale.setScalar(scale);
    group.add(bird.group);
    birds.push({ ...bird, phase: i * 2.399, orbit: 9 + (i % 5) * 6, height: 85 + (i % 4) * 2, rate: 0.045 + (i % 3) * 0.013 });
  }

  const rabbits = [];
  for (let i = 0; i < 7; i++) {
    const rabbit = createRabbit(i % 2 ? 0xe6d0aa : C.white);
    rabbit.scale.setScalar(0.75 + (i % 3) * 0.12);
    group.add(rabbit);
    rabbits.push({ group: rabbit, phase: i * 1.9, x: Math.sin(i * 2.41) * (14 + i * 4), z: Math.cos(i * 2.41) * (14 + i * 4) });
  }
  const deer = [];
  for (let i = 0; i < 4; i++) {
    const animal = createDeer();
    animal.group.scale.setScalar(0.9 + (i % 2) * 0.16);
    group.add(animal.group);
    deer.push({ ...animal, phase: i * 2.6, x: Math.sin(i * 1.8 + 0.5) * (30 + i * 3), z: Math.cos(i * 1.8 + 0.5) * (30 + i * 3) });
  }

  const butterflies = [];
  for (let i = 0; i < 18; i++) {
    const butterfly = new THREE.Group();
    const wings = [];
    const color = [0xe4bb57, 0xe09570, 0x9fa6d8, 0xd7ded2][i % 4];
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      butterfly.add(wing);
      const shape = ball(wing, color, [side * 0.11, 0, 0], [0.12, 0.015, 0.13]);
      shape.rotation.y = side * 0.24;
      wings.push(wing);
    }
    ball(butterfly, C.dark, [0, 0, 0], [0.02, 0.025, 0.09]);
    group.add(butterfly);
    butterflies.push({ group: butterfly, wings, phase: i * 2.4, x: Math.sin(i * 2.399) * (8 + i * 1.7), z: Math.cos(i * 2.399) * (8 + i * 1.7) });
  }
  const position = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const update = (time, dt = 0.016) => {
    for (const bird of birds) {
      const angle = bird.phase + time * bird.rate;
      const x = Math.sin(angle) * bird.orbit;
      const z = Math.cos(angle) * bird.orbit;
      const r = bird.height + Math.sin(time * 0.7 + bird.phase) * 0.6;
      position.set(x, Math.sqrt(r * r - x * x - z * z), z);
      heading.set(Math.cos(angle), 0, -Math.sin(angle));
      orientOnSphere(bird.group, position, heading);
      const flap = Math.sin(time * 5.5 + bird.phase) * 0.46 + 0.1;
      bird.wings[0].rotation.z = -flap;
      bird.wings[1].rotation.z = flap;
    }
    for (const rabbit of rabbits) {
      const slow = time * 0.13 + rabbit.phase;
      const x = rabbit.x + Math.sin(slow) * 1.2;
      const z = rabbit.z + Math.cos(slow) * 1.2;
      const hop = Math.max(0, Math.sin(time * 1.6 + rabbit.phase) - 0.55) * 0.55;
      const r = 80.14 + hop;
      position.set(x, Math.sqrt(r * r - x * x - z * z), z);
      heading.set(Math.cos(slow), 0, -Math.sin(slow));
      orientOnSphere(rabbit.group, position, heading);
    }
    for (const animal of deer) {
      const angle = time * 0.07 + animal.phase;
      const x = animal.x + Math.sin(angle) * 2;
      const z = animal.z + Math.cos(angle) * 2;
      position.set(x, Math.sqrt(80.12 * 80.12 - x * x - z * z), z);
      heading.set(Math.cos(angle), 0, -Math.sin(angle));
      orientOnSphere(animal.group, position, heading);
      animal.legs.forEach((leg, index) => { leg.rotation.x = Math.sin(time * 2.3 + animal.phase + (index % 2) * Math.PI) * 0.12; });
    }
    for (const butterfly of butterflies) {
      const x = butterfly.x + Math.sin(time * 0.5 + butterfly.phase) * 2.5;
      const z = butterfly.z + Math.cos(time * 0.4 + butterfly.phase) * 2.5;
      const r = 81.5 + Math.sin(time * 2 + butterfly.phase) * 0.4;
      position.set(x, Math.sqrt(r * r - x * x - z * z), z);
      heading.set(Math.cos(time * 0.5 + butterfly.phase), 0, -Math.sin(time * 0.4 + butterfly.phase));
      orientOnSphere(butterfly.group, position, heading);
      const flap = Math.sin(time * 16 + butterfly.phase) * 0.8;
      butterfly.wings[0].rotation.z = flap;
      butterfly.wings[1].rotation.z = -flap;
    }
  };
  update(0);
  return { group, update };
}
