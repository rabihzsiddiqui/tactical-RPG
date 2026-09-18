/* SECTION 7: mesh builders */

import * as THREE from "three";
import { MW, MH, CX, CZ, cell, inB } from "../core/map.js";
import { WEAPONS, PALS, SILHOUETTES, SILHOUETTE_DEFAULT } from "../core/data.js";

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

/* the face is drawn on a canvas in a 32 unit grid and scaled up by FACE_S,
   so the proportions are unchanged from the original 32px texture while
   the finer strokes (eye highlight, brow, mouth) get real pixels of their
   own. Nearest filtering keeps the pixel look; the extra resolution is
   for the cut-in camera, which sits close enough that a 32px face was
   about one texel per screen pixel at the 3DS render size. */
const FACE_S = 2;
function faceTexture(P) {
  const c = document.createElement("canvas");
  c.width = 32 * FACE_S; c.height = 32 * FACE_S;
  const x = c.getContext("2d");
  const R = (px, py, w, h) => x.fillRect(px * FACE_S, py * FACE_S, w * FACE_S, h * FACE_S);
  x.fillStyle = P.skin; R(0, 0, 32, 32);
  x.fillStyle = P.hair; R(0, 0, 32, 7); R(0, 7, 3, 4); R(29, 7, 3, 4); R(5, 10, 7, 2); R(20, 10, 7, 2);
  x.fillStyle = "rgba(0,0,0,0.14)"; R(0, 7, 32, 1);           // fringe shadow
  x.fillStyle = P.eye; R(6, 14, 5, 7); R(21, 14, 5, 7);
  x.fillStyle = "#ffffff"; R(7, 15, 2, 2); R(22, 15, 2, 2);
  x.fillStyle = "rgba(255,255,255,0.35)"; R(6.5, 19.5, 1.5, 1); R(21.5, 19.5, 1.5, 1); // lower catchlight
  x.fillStyle = "rgba(0,0,0,0.28)"; R(14, 26, 4, 1);
  x.fillStyle = "rgba(0,0,0,0.10)"; R(12, 22, 8, 0.5); R(2, 28, 28, 4); // nose line, jaw shade
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

const METAL = { metalness: 0.7, roughness: 0.4 }; // 0.35 made the highlight a hard-edged facet on these flat boxes

/* bulk scales the torso, shoulder spread and limb thickness. Width grows
   with it in full, depth at about a third of the rate: a 1.3 Knight is
   noticeably wider than a Lord from the cut-in camera without turning into
   a cube from the orbit. Limbs thicken by the square root so they stay
   limbs. Every part name in `parts` is read by animUnit and attacks.js,
   and the pivots (arms at the shoulder, legs at the hip, weapon in the
   right hand) are unchanged, so the pose keyframes work on every body. */
export function buildUnitMesh(palKey, weaponKey, clsKey) {
  const P = PALS[palKey];
  const S = { ...SILHOUETTE_DEFAULT, ...(SILHOUETTES[clsKey] || {}) };
  const B = S.bulk, limb = Math.sqrt(B);
  const bw = 0.3 * B;                  // torso width
  const bd = 0.19 * (0.7 + 0.3 * B);   // torso depth
  const mats = [];
  const M = (hex) => {
    const m = new THREE.MeshLambertMaterial({ color: hex });
    mats.push(m);
    return m;
  };
  /* metal parts: blade, helm, trim, plume. Standard gives them a specular
     lobe so a swinging blade catches the sun and the cut-in key light;
     Lambert has none and reads as grey card up close. Cloth stays on
     Lambert, which is both cheaper and the right look for it. */
  const MM = (hex) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, ...METAL });
    mats.push(m);
    return m;
  };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = box(bw, 0.26, bd, S.plate ? MM(P.helm) : M(P.tunic));
  torso.position.y = 0.4;
  body.add(torso);
  const belt = box(bw + 0.02, 0.05, bd + 0.02, MM(P.trim));
  belt.position.y = 0.3;
  body.add(belt);
  if (S.cape) {
    const cape = box(bw, 0.34, 0.04, M(P.cape));
    cape.position.set(0, 0.36, -(bd / 2 + 0.015));
    body.add(cape);
  }
  /* the robe hangs from the belt to just above the boots. The legs stay
     underneath and still swing on a walk; the boots show below the hem */
  if (S.robe) {
    const skirt = box(bw + 0.04, 0.27, bd + 0.05, M(P.tunic));
    skirt.position.y = 0.165;
    const hem = box(bw + 0.05, 0.03, bd + 0.06, M(P.trim));
    hem.position.y = 0.045;
    body.add(skirt, hem);
  }
  if (S.pauldrons) {
    for (const sx of [-1, 1]) {
      const pad = box(0.13 * limb, 0.07, 0.15 * limb, MM(P.helm));
      pad.position.set(sx * (bw / 2 + 0.035 * limb), 0.535, 0);
      body.add(pad);
    }
  }
  if (S.quiver) {
    const q = new THREE.Group();
    q.position.set(0.09, 0.46, -(bd / 2 + 0.05));
    q.rotation.z = -0.4;
    q.add(box(0.075, 0.3, 0.075, M(P.grip)));
    const fletch = box(0.09, 0.05, 0.09, M(0xe8e2cf));
    fletch.position.y = 0.17;
    q.add(fletch);
    body.add(q);
  }

  const legGeo = new THREE.BoxGeometry(0.1 * limb, 0.24, 0.11 * limb); legGeo.translate(0, -0.12, 0);
  const bootGeo = new THREE.BoxGeometry(0.12 * limb, 0.07, 0.15); bootGeo.translate(0, -0.255, 0.02);
  const mkLeg = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.08 * B, 0.28, 0);
    g.add(new THREE.Mesh(legGeo, M(P.pants)));
    g.add(new THREE.Mesh(bootGeo, M(P.boot)));
    body.add(g);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const armW = 0.085 * limb;
  const armGeo = new THREE.BoxGeometry(armW, 0.22, 0.095 * limb); armGeo.translate(0, -0.11, 0);
  const handGeo = new THREE.BoxGeometry(0.095, 0.07, 0.1); handGeo.translate(0, -0.245, 0);
  const skinHex = new THREE.Color(P.skin).getHex();
  const mkArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * (bw / 2 + 0.04 * limb), 0.5, 0);
    g.add(new THREE.Mesh(armGeo, M(S.sleeves ? P.tunic : skinHex)));
    g.add(new THREE.Mesh(handGeo, M(skinHex)));
    body.add(g);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  if (S.shield) {
    const shield = box(0.05, 0.24, 0.2, MM(P.helm));
    shield.position.set(-(armW / 2 + 0.03), -0.13, 0.03);
    const boss = box(0.02, 0.1, 0.08, MM(P.trim));
    boss.position.set(-(armW / 2 + 0.06), -0.13, 0.03);
    armL.add(shield, boss);
  }

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
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), MM(P.plume));
    orb.position.y = 0.52;
    weapon.add(rod, orb);
  } else if (w.magic) {
    const tome = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.06), M(P.tunic));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.02), MM(P.trim));
    edge.position.z = -0.03;
    weapon.add(tome, edge);
  } else if (w.type === "axe") {
    const haft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.46, 0.035), M(P.grip));
    haft.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.19), MM(P.blade));
    head.position.set(0.06, 0.38, 0);
    weapon.add(haft, head);
  } else if (w.type === "lance") {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), M(P.grip));
    shaft.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), MM(P.blade));
    tip.position.y = 0.68;
    weapon.add(shaft, tip);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.015), MM(P.blade));
    blade.position.y = 0.26;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), MM(P.plume));
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
  buildHelm(S.helm, headG, P, M, MM, box);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, parts: { body, headG, armL, armR, legL, legR, weapon }, mats };
}

/* headwear, in the head group's frame: the head box spans y 0 to 0.32 and
   the eyes sit between 0.11 and 0.18, so anything that covers the face
   stops at 0.19. Four-sided cones are pyramids, turned 45 degrees so a
   flat face points forward like the head does. */
function buildHelm(style, headG, P, M, MM, box) {
  const plume = () => {
    const p = box(0.06, 0.13, 0.2, MM(P.plume));
    p.position.set(0, 0.4, -0.03);
    headG.add(p);
  };
  const band = () => {
    const h = box(0.37, 0.11, 0.33, MM(P.helm));
    h.position.y = 0.29;
    headG.add(h);
  };
  /* a cloth cap, two side panels framing the face, and a panel down the
     back of the neck. Without the sides it read as a flat beret. */
  const hood = (hex, drop) => {
    const mat = M(hex);
    const cap = box(0.38, 0.15, 0.36, mat);
    cap.position.set(0, 0.275, -0.02);
    for (const sx of [-1, 1]) {
      const side = box(0.03, 0.24, 0.26, mat);
      side.position.set(sx * 0.185, 0.12, -0.05);
      headG.add(side);
    }
    const drape = box(0.32, drop, 0.05, mat);
    drape.position.set(0, 0.19 - drop / 2, -0.19);
    headG.add(cap, drape);
  };
  const pyramid = (r, h, mat) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), mat);
    c.rotation.y = Math.PI / 4;
    return c;
  };
  switch (style) {
    case "band": band(); plume(); break;
    case "horned": {
      band(); plume();
      for (const sx of [-1, 1]) {
        const horn = pyramid(0.035, 0.2, MM(P.plume));
        horn.position.set(sx * 0.2, 0.37, 0);
        horn.rotation.z = -sx * 0.7;
        headG.add(horn);
      }
      break;
    }
    case "full": {
      const cap = box(0.38, 0.17, 0.34, MM(P.helm));
      cap.position.y = 0.275;
      headG.add(cap);
      for (const sx of [-1, 1]) {
        const cheek = box(0.03, 0.2, 0.22, MM(P.helm));
        cheek.position.set(sx * 0.185, 0.13, -0.02);
        headG.add(cheek);
      }
      plume();
      break;
    }
    case "circlet": {
      const ring = box(0.36, 0.035, 0.32, MM(P.trim));
      ring.position.y = 0.28;
      const gem = box(0.05, 0.05, 0.02, MM(P.plume));
      gem.position.set(0, 0.28, 0.165);
      headG.add(ring, gem);
      break;
    }
    case "hood": hood(P.cape, 0.2); break;
    case "veil": hood(P.trim, 0.32); break;
    case "hat": {
      const brim = box(0.5, 0.03, 0.5, M(P.cape));
      brim.position.y = 0.335;
      const cone = pyramid(0.19, 0.36, M(P.cape));
      cone.position.y = 0.52;
      const trim = box(0.3, 0.04, 0.3, MM(P.trim));
      trim.position.y = 0.36;
      headG.add(brim, cone, trim);
      break;
    }
    case "cap": {
      const dome = pyramid(0.24, 0.16, MM(P.helm));
      dome.position.y = 0.39;
      const rim = box(0.4, 0.03, 0.38, MM(P.helm));
      rim.position.y = 0.31;
      headG.add(dome, rim);
      break;
    }
    default: break;
  }
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
   side players approach from). A raised, walkable square with a "rook"
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
   edges, the sides that actually face the river. The short north/south
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

/* a small health bar: a dark backing plate plus a team-colored fill that
   scales from the left edge. Unlit (MeshBasicMaterial) so it reads
   consistently regardless of scene lighting. The planes stand upright in
   local space and animUnit turns the group to face the camera every frame,
   so the bar keeps its shape at any orbit angle instead of foreshortening
   into a line at low pitch. Smaller than the old floor decal was: seen
   square-on, the same width reads about a third larger. */
export const HP_BAR_W = 0.48;
const HP_BAR_H = 0.085;

export function buildHealthBar(fillHex) {
  const group = new THREE.Group();

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(HP_BAR_W, HP_BAR_H),
    new THREE.MeshBasicMaterial({ color: 0x1c1c1c, transparent: true, depthWrite: false, depthTest: false })
  );
  back.renderOrder = 10;
  group.add(back);

  const fillGeo = new THREE.PlaneGeometry(1, HP_BAR_H * 0.72);
  fillGeo.translate(0.5, 0, 0.001); // pivot at the left edge, nudged up to avoid z-fighting with `back`
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: fillHex, transparent: true, depthWrite: false, depthTest: false }));
  fill.renderOrder = 11;
  fill.position.x = -HP_BAR_W / 2;
  group.add(fill);

  return { group, fill };
}

/* projectiles for the ranged beats in attacks.js. Each is built once and
   reused, so neither takes a palette: the arrow is plain wood whoever
   fires it, and the bolt is fire. Both start hidden. The arrow points
   along its local +z so Object3D.lookAt aims it at the target. */
export function buildArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.42), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), new THREE.MeshStandardMaterial({ color: 0xdfe7f2, ...METAL }));
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.25;
  const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.09), new THREE.MeshLambertMaterial({ color: 0xe8e2cf }));
  fletch.position.z = -0.17;
  g.add(shaft, head, fletch);
  g.visible = false;
  return g;
}

/* the fire bolt. Lambert with a strong emissive so it reads lit from any
   angle; transparent so the burst on impact can fade it out. */
export function buildBolt() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffa040, emissive: 0xff5a1a, transparent: true });
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), mat);
  m.visible = false;
  return m;
}
