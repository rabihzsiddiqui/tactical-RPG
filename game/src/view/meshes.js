/* SECTION 7: mesh builders */

import * as THREE from "three";
import { MW, MH, CX, CZ, cell, inB } from "../core/map.js";
import { WEAPONS, PALS } from "../core/data.js";

export function buildTerrain() {
  const pos = [], nrm = [], col = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  const c = new THREE.Color();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  function addQuad(p0, p1, p2, p3, want, hex) {
    A.subVectors(p1, p0);
    B.subVectors(p2, p0);
    N.crossVectors(A, B).normalize();
    let a = p0, b = p1, d = p2, e = p3;
    if (N.dot(want) < 0) { b = p3; e = p1; N.negate(); }
    c.setHex(hex);
    for (const tri of [[a, b, d], [a, d, e]]) {
      for (const p of tri) {
        pos.push(p.x, p.y, p.z);
        nrm.push(N.x, N.y, N.z);
        col.push(c.r, c.g, c.b);
      }
    }
  }

  for (let ty = 0; ty < MH; ty++) {
    for (let tx = 0; tx < MW; tx++) {
      const t = cell(tx, ty), h = t.h;
      const x0 = tx - CX - 0.5, x1 = tx - CX + 0.5;
      const z0 = ty - CZ - 0.5, z1 = ty - CZ + 0.5;
      addQuad(V(x0, h, z1), V(x1, h, z1), V(x1, h, z0), V(x0, h, z0), UP, t.top);
      const sides = [
        { dx: 1, dy: 0, want: V(1, 0, 0), a: V(x1, h, z1), b: V(x1, h, z0) },
        { dx: -1, dy: 0, want: V(-1, 0, 0), a: V(x0, h, z0), b: V(x0, h, z1) },
        { dx: 0, dy: 1, want: V(0, 0, 1), a: V(x0, h, z1), b: V(x1, h, z1) },
        { dx: 0, dy: -1, want: V(0, 0, -1), a: V(x1, h, z0), b: V(x0, h, z0) },
      ];
      for (const s of sides) {
        const nx = tx + s.dx, ny = ty + s.dy;
        const nh = inB(nx, ny) ? cell(nx, ny).h : h - 1.6;
        if (nh >= h - 0.001) continue;
        addQuad(V(s.a.x, h, s.a.z), V(s.b.x, h, s.b.z), V(s.b.x, nh, s.b.z), V(s.a.x, nh, s.a.z), s.want, t.side);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function faceTexture(P) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const x = c.getContext("2d");
  x.fillStyle = P.skin; x.fillRect(0, 0, 32, 32);
  x.fillStyle = P.hair; x.fillRect(0, 0, 32, 7); x.fillRect(5, 10, 7, 2); x.fillRect(20, 10, 7, 2);
  x.fillStyle = P.eye; x.fillRect(6, 14, 5, 7); x.fillRect(21, 14, 5, 7);
  x.fillStyle = "#ffffff"; x.fillRect(7, 15, 2, 2); x.fillRect(22, 15, 2, 2);
  x.fillStyle = "rgba(0,0,0,0.28)"; x.fillRect(14, 26, 4, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

export function buildUnitMesh(palKey, weaponKey) {
  const P = PALS[palKey];
  const mats = [];
  const M = (hex) => {
    const m = new THREE.MeshLambertMaterial({ color: hex });
    mats.push(m);
    return m;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.19), M(P.tunic));
  torso.position.y = 0.4;
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.21), M(P.trim));
  belt.position.y = 0.3;
  body.add(belt);
  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.04), M(P.cape));
  cape.position.set(0, 0.36, -0.11);
  body.add(cape);

  const legGeo = new THREE.BoxGeometry(0.1, 0.24, 0.11); legGeo.translate(0, -0.12, 0);
  const bootGeo = new THREE.BoxGeometry(0.12, 0.07, 0.15); bootGeo.translate(0, -0.255, 0.02);
  const mkLeg = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.08, 0.28, 0);
    g.add(new THREE.Mesh(legGeo, M(P.pants)));
    g.add(new THREE.Mesh(bootGeo, M(P.boot)));
    body.add(g);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const armGeo = new THREE.BoxGeometry(0.085, 0.22, 0.095); armGeo.translate(0, -0.11, 0);
  const handGeo = new THREE.BoxGeometry(0.095, 0.07, 0.1); handGeo.translate(0, -0.245, 0);
  const skinHex = new THREE.Color(P.skin).getHex();
  const mkArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.19, 0.5, 0);
    g.add(new THREE.Mesh(armGeo, M(P.tunic)));
    g.add(new THREE.Mesh(handGeo, M(skinHex)));
    body.add(g);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // weapon shape follows the equipped type
  const w = WEAPONS[weaponKey];
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.25, 0.02);
  if (w.type === "bow") {
    const limb = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 5, 10, Math.PI * 1.25), M(P.grip));
    limb.rotation.z = Math.PI / 2;
    weapon.add(limb);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.36, 0.008), M(0xe8e2cf));
    string.position.z = 0.1;
    weapon.add(string);
  } else if (w.staff) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), M(P.grip));
    rod.position.y = 0.24;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), M(P.plume));
    orb.position.y = 0.52;
    weapon.add(rod, orb);
  } else if (w.magic) {
    const tome = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.06), M(P.tunic));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.02), M(P.trim));
    edge.position.z = -0.03;
    weapon.add(tome, edge);
  } else if (w.type === "axe") {
    const haft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.46, 0.035), M(P.grip));
    haft.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.19), M(P.blade));
    head.position.set(0.06, 0.38, 0);
    weapon.add(haft, head);
  } else if (w.type === "lance") {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), M(P.grip));
    shaft.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), M(P.blade));
    tip.position.y = 0.68;
    weapon.add(shaft, tip);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.015), M(P.blade));
    blade.position.y = 0.26;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), M(P.plume));
    guard.position.y = 0.05;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), M(P.grip));
    weapon.add(blade, guard, grip);
  }
  weapon.rotation.x = 1.5;
  armR.add(weapon);

  const headG = new THREE.Group();
  headG.position.y = 0.55;
  body.add(headG);
  const skinMat = M(skinHex);
  const hairMat = M(new THREE.Color(P.hair).getHex());
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(P) });
  mats.push(faceMat);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.32, 0.3),
    [skinMat, skinMat, hairMat, skinMat, faceMat, hairMat]
  );
  head.position.y = 0.16;
  headG.add(head);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.11, 0.33), M(P.helm));
  helm.position.y = 0.29;
  headG.add(helm);
  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.2), M(P.plume));
  plume.position.set(0, 0.4, -0.03);
  headG.add(plume);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, parts: { body, headG, armL, armR, legL, legR, weapon }, mats };
}

export function buildTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2c }));
  trunk.position.y = 0.25;
  g.add(trunk);
  const a = new THREE.MeshLambertMaterial({ color: 0x39662f, flatShading: true });
  const b = new THREE.MeshLambertMaterial({ color: 0x477c39, flatShading: true });
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 7), a); c1.position.y = 0.66;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.48, 7), b); c2.position.y = 0.95; c2.rotation.y = 0.5;
  const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.38, 7), b); c3.position.y = 1.2;
  g.add(c1, c2, c3);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* a low rampart bordering three sides of the tile, open to the south (the
   side players approach from) — a raised, walkable square with a "rook"
   crenellated edge, not a solid tower that would hide whoever stands on it.
   The keep tile is the same height as the ridge tiles flanking it on three
   sides, so leaving the south face open (no wall, no implied stairs) reads
   as "walk straight in" rather than "climb up to this monument." */
export function buildKeep() {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a9484, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6e6a5e });

  const H = 0.16, R = 0.44, T = 0.07;
  const wallSeg = (len, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, T), stone);
    m.position.set(x, H / 2, z);
    m.rotation.y = rotY;
    g.add(m);
  };
  wallSeg(0.88, 0, -R, 0);           // north
  wallSeg(0.88, -R, 0, Math.PI / 2); // west
  wallSeg(0.88, R, 0, Math.PI / 2);  // east
  // south stays open

  const merlon = (x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), stone);
    m.position.set(x, H + 0.07, z);
    g.add(m);
  };
  merlon(-R, -R); merlon(R, -R); merlon(-R, R); merlon(R, R); merlon(0, -R);

  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.4, 0.025), dark);
  pole.position.set(0, H + 0.2, -R);
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.02), new THREE.MeshLambertMaterial({ color: 0xc8a04a }));
  flag.position.set(0.09, H + 0.32, -R);
  g.add(flag);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* one continuous deck spanning `tiles` map cells (all in a row, water on the
   near side of the outer two), with railings only on the two outer long
   edges — the sides that actually face the river. The short north/south
   ends are where a unit steps on and off onto the bank, so they stay open;
   a rail there would fence the direction of travel instead of guarding it. */
export function buildBridge(tiles = 1) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6b5133 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(tiles + 0.02, 0.09, 1.06), wood);
  deck.position.y = -0.045;
  g.add(deck);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.02), dark);
    rail.position.set(s * (tiles / 2), 0.2, 0);
    g.add(rail);
    for (const z of [-0.42, 0.42]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), dark);
      post.position.set(s * (tiles / 2), 0.08, z);
      g.add(post);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* a small ground-flat health bar: a dark backing plate plus a team-colored
   fill that scales from the left edge. Unlit (MeshBasicMaterial) so it
   reads consistently regardless of scene lighting. */
export const HP_BAR_W = 0.62;
const HP_BAR_H = 0.11;

export function buildHealthBar(fillHex) {
  const group = new THREE.Group();

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(HP_BAR_W, HP_BAR_H),
    new THREE.MeshBasicMaterial({ color: 0x1c1c1c, transparent: true, depthWrite: false, depthTest: false })
  );
  back.rotation.x = -Math.PI / 2;
  back.renderOrder = 10;
  group.add(back);

  const fillGeo = new THREE.PlaneGeometry(1, HP_BAR_H * 0.72);
  fillGeo.translate(0.5, 0, 0.001); // pivot at the left edge, nudged up to avoid z-fighting with `back`
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: fillHex, transparent: true, depthWrite: false, depthTest: false }));
  fill.renderOrder = 11;
  fill.rotation.x = -Math.PI / 2;
  fill.position.x = -HP_BAR_W / 2;
  group.add(fill);

  return { group, fill };
}
