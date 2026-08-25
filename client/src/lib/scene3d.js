/**
 * The 3D scene, built in one place.
 *
 * Both the live view (Character3D) and the PNG/PDF exporter render through
 * these functions, so an exported image is the same scene the designer was
 * looking at — geometry, lighting and grid included — rather than a second
 * implementation that quietly drifts.
 */
import * as THREE from 'three';
import {
  SHAPES, fillOf, primsFor, canvasOf, offsetOf, cmToUnits,
} from '@shared/character.js';

/* ---------- geometry per primitive kind ------------------------------
 * The 2D renderer draws the same kinds as SVG — keeping the two switches
 * in step is what keeps the views honest.
 * ------------------------------------------------------------------- */
export function buildGeometry(p) {
  switch (p.kind) {
    case 'cylinder':
      return new THREE.CylinderGeometry(p.w / 2, p.w / 2, p.h, 28);

    case 'cone':
      return new THREE.ConeGeometry(p.w / 2, p.h, 28);

    case 'rect': {
      const r = Math.min(p.round ?? Math.min(p.w, p.h) * 0.3, Math.min(p.w, p.h, p.d) / 2 - 0.01);
      return r > 0.5 ? roundedBox(p.w, p.h, p.d, r) : new THREE.BoxGeometry(p.w, p.h, p.d);
    }

    case 'capsule': {
      // a capsule runs along its longer axis
      const vertical = p.h >= p.w;
      const radius = Math.max(1, (vertical ? p.w : p.h) / 2);
      const length = Math.max(0.1, (vertical ? p.h : p.w) - radius * 2);
      const geo = new THREE.CapsuleGeometry(radius, length, 8, 20);
      if (!vertical) geo.rotateZ(Math.PI / 2);
      if (p.d && radius > 0) geo.scale(1, 1, Math.max(0.05, p.d / (radius * 2)));
      return geo;
    }

    case 'torus': {
      const R = p.w / 4 + p.h / 4;
      const geo = new THREE.TorusGeometry(R * 0.76, R * 0.24, 14, 36);
      geo.scale(p.w / (2 * R) || 1, p.h / (2 * R) || 1, 1);
      return geo;
    }

    case 'leaf':
      return extrude(leafShape(), p);

    case 'star':
      return extrude(starShape(), p);

    default: {
      const geo = new THREE.SphereGeometry(0.5, 32, 24);
      geo.scale(p.w, p.h, p.d);
      return geo;
    }
  }
}

function extrude(shape, p) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1, bevelEnabled: true, bevelThickness: 0.08,
    bevelSize: 0.06, bevelSegments: 2, curveSegments: 18,
  });
  geo.translate(0, 0, -0.5);
  geo.scale(p.w, p.h, Math.max(2, p.d));
  return geo;
}

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.bezierCurveTo(-0.25, 0.5, 0.25, 0.5, 0.5, 0);
  s.bezierCurveTo(0.25, -0.5, -0.25, -0.5, -0.5, 0);
  return s;
}

function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const f = (i % 2 ? 0.44 : 1) * 0.5;
    const x = Math.cos(a) * f, y = Math.sin(a) * f;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const hw = w / 2 - r, hh = h / 2 - r;
  shape.moveTo(-hw - r, -hh);
  shape.lineTo(-hw - r, hh);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw, hh + r);
  shape.lineTo(hw, hh + r);
  shape.quadraticCurveTo(hw + r, hh + r, hw + r, hh);
  shape.lineTo(hw + r, -hh);
  shape.quadraticCurveTo(hw + r, -hh - r, hw, -hh - r);
  shape.lineTo(-hw, -hh - r);
  shape.quadraticCurveTo(-hw - r, -hh - r, -hw - r, -hh);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -d / 2);
  return geo;
}

/* ---------- scene furniture ------------------------------------------ */

export const SCENE_BG = '#EDEAE5';

/** Three-point lighting plus a bounce — enough to read form without a UI. */
export function addLights(scene) {
  const hemi = new THREE.HemisphereLight('#FFFFFF', '#C9C2B8', 1.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#FFF6E9', 2.0);
  key.position.set(260, 420, 320);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -500, right: 500, top: 500, bottom: -500, near: 1, far: 2000 });
  scene.add(key);
  const rim = new THREE.DirectionalLight('#DCE6F1', 0.7);
  rim.position.set(-300, 180, -260);
  scene.add(rim);
  const bounce = new THREE.DirectionalLight('#F3E7D4', 0.35);
  bounce.position.set(80, -320, 180);
  scene.add(bounce);
  return { key, rim, bounce, hemi };
}

/** Ground plane that catches the shadow, so the character does not float. */
export function makeGround() {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(420, 64),
    new THREE.ShadowMaterial({ opacity: 0.16 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -190;
  ground.receiveShadow = true;
  return ground;
}

/** Fill `group` with one mesh per primitive. Returns the selected mesh, if any. */
export function populateCharacterGroup(group, character, selected = null) {
  disposeChildren(group);
  group.clear();
  if (!SHAPES[character.shape]) return null;

  let selectedMesh = null;
  for (const p of primsFor(character, '3d')) {
    const places = p.mirrorZ ? [p.z, -p.z] : [p.z];
    for (const z of places) {
      const geo = buildGeometry(p);
      const hex = fillOf(character, p);
      const matProps = character.materials?.[p.element ?? p.part] ?? {};
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex),
        roughness: matProps.roughness ?? (p.detail ? 0.34 : 0.66),
        metalness: matProps.metalness ?? 0.02,
        emissive: new THREE.Color(hex),
        emissiveIntensity: selected === p.part && !p.detail ? 0.28 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, -p.y, z);      // design space is y-down
      if (p.rot) mesh.rotation.z = (-p.rot * Math.PI) / 180;
      mesh.castShadow = !p.detail;
      mesh.receiveShadow = true;
      mesh.userData = { part: p.part, detail: p.detail, element: p.element ?? null };
      group.add(mesh);
      if (selected === p.part && !selectedMesh) selectedMesh = mesh;
    }
  }
  group.scale.setScalar(character.scale ?? 1);
  const off = offsetOf(character);
  group.position.set(off.x, -off.y, off.z);   // design space is y-down
  return selectedMesh;
}

/** Fill `g` with the artboard grid: a floor rule and the board plane at z = 0. */
export function populateGridGroup(g, character) {
  disposeChildren(g);
  g.clear();

  const board = canvasOf(character);
  const w = cmToUnits(board.width), h = cmToUnits(board.height);

  // floor grid, one line per centimetre, sitting under the artboard
  const divisions = Math.max(2, Math.round(Math.max(board.width, board.height)));
  const floor = new THREE.GridHelper(Math.max(w, h), divisions,
    new THREE.Color('#9AA8B6'), new THREE.Color('#C6D0DA'));
  floor.position.y = -h / 2;
  floor.material.opacity = 0.55;
  floor.material.transparent = true;
  g.add(floor);

  // the artboard plane itself, drawn where the 2D canvas sits (z = 0)
  const pts = [];
  for (let cx = -board.width / 2; cx <= board.width / 2 + 1e-6; cx += 1) {
    const x = cmToUnits(cx);
    pts.push(x, -h / 2, 0, x, h / 2, 0);
  }
  for (let cy = -board.height / 2; cy <= board.height / 2 + 1e-6; cy += 1) {
    const y = cmToUnits(cy);
    pts.push(-w / 2, y, 0, w / 2, y, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: new THREE.Color('#B9C4CF'), transparent: true, opacity: 0.5,
  })));

  // a stronger frame so the board's edge is unmistakable
  g.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w / 2, -h / 2, 0), new THREE.Vector3(w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, h / 2, 0), new THREE.Vector3(-w / 2, h / 2, 0),
    ]),
    new THREE.LineBasicMaterial({ color: new THREE.Color('#7C8B9A') })
  ));

  // advanced axis lines
  const axes = new THREE.AxesHelper(Math.max(w, h) / 2);
  axes.position.y = -h / 2 + 1; // slightly above the floor to avoid z-fighting
  g.add(axes);
}

/**
 * Distance and target that frame `objects` for this camera and aspect.
 * Returns null when there is nothing with size to frame.
 */
export function computeFit(camera, objects) {
  const box = new THREE.Box3();
  let any = false;
  for (const o of objects) {
    if (!o) continue;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) continue;
    box.union(b); any = true;
  }
  if (!any || box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (!(sphere.radius > 0)) return null;
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const need = Math.max(sphere.radius / Math.sin(vFov / 2), sphere.radius / Math.sin(hFov / 2));
  return { dist: need * 1.25, center: sphere.center, minY: box.min.y };
}

/** Place an orbit camera from yaw / pitch / distance around a target. */
export function positionCamera(camera, { yaw, pitch, dist, target }) {
  camera.position.set(
    target.x + dist * Math.cos(pitch) * Math.sin(yaw),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(pitch) * Math.cos(yaw)
  );
  camera.lookAt(target);
}

export function disposeChildren(obj) {
  obj.traverse(o => {
    if (o === obj) return;
    o.geometry?.dispose?.();
    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
    else o.material?.dispose?.();
  });
}

export const DEFAULT_VIEW = { yaw: 0.55, pitch: 0.18 };
