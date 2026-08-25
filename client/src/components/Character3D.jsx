import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { snapUnits } from '@shared/character.js';
import {
  SCENE_BG, DEFAULT_VIEW, addLights, makeGround, populateCharacterGroup,
  populateGridGroup, computeFit, positionCamera, disposeChildren,
} from '../lib/scene3d.js';

/**
 * FR3 — 3D view.
 * A real-time rasterised render of the SAME parametric model the 2D view
 * uses: each primitive becomes a mesh, each part keeps its colour, and an
 * orbit camera is the only camera control exposed (persona research showed
 * full camera systems are where non-3D users give up).
 *
 * Raycasting on click selects a part (FR11), so selection is shared between
 * the two views. Placed elements can also be MOVED and RESIZED here:
 * dragging one slides it along the plane facing the camera, and alt-dragging
 * scales it — the 3D view is an editor, not a preview.
 */
export default function Character3D({
  character, selected, onSelect, onFps, resetSignal = 0,
  showGrid = false, snapCm = 0, lockRatio = false,
  onElementDragStart, onElementDrag, onElementResize, onElementDragEnd, onElementDrop,
  onPlaceStart, onPlace, onPlaceEnd, onApi,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({});

  // ---- one-time scene setup -------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_BG);

    const camera = new THREE.PerspectiveCamera(38, 1, 1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('data-testid', 'canvas-3d');

    const lights = addLights(scene);
    const key = lights.key;
    const ground = makeGround();
    scene.add(ground);

    const gridGroup = new THREE.Group();
    scene.add(gridGroup);

    const group = new THREE.Group();
    scene.add(group);

    // outline that follows the selected object
    const selBox = new THREE.BoxHelper(undefined, new THREE.Color('#B4530A'));
    selBox.visible = false;
    selBox.material.depthTest = false;
    selBox.material.linewidth = 2;
    scene.add(selBox);

    const st = stateRef.current;
    Object.assign(st, {
      scene, camera, renderer, group, gridGroup, key, lights, ground, selBox,
      yaw: DEFAULT_VIEW.yaw, pitch: DEFAULT_VIEW.pitch, dist: 720, target: new THREE.Vector3(0, 0, 0),
      dragging: false, panning: false, lastX: 0, lastY: 0, placeDrag: null,
      raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(),
      plane: new THREE.Plane(), hitPoint: new THREE.Vector3(), grabOffset: new THREE.Vector3(),
      elDrag: null,
      frames: 0, fpsAt: performance.now(), disposed: false,
    });

    const applyCamera = () => positionCamera(camera, st);
    st.applyCamera = applyCamera;

    // ---- gizmo setup -----------------------------------------------------
    const transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.setSpace('local');
    transformControl.size = 0.8;
    scene.add(transformControl.getHelper());

    transformControl.addEventListener('dragging-changed', (event) => {
      st.gizmoDragging = event.value;
      if (event.value) {
        if (st.selectedElementId) st.onElementDragStart?.(st.selectedElementId);
      } else {
        if (st.selectedElementId) st.onElementDragEnd?.(st.selectedElementId, true, 'move');
      }
    });

    transformControl.addEventListener('change', () => {
      if (st.gizmoDragging && st.selectedElementId && transformControl.object) {
        const obj = transformControl.object;
        const snap = (v) => (st.snapCm > 0 ? snapUnits(v, st.snapCm) : Math.round(v));
        
        st.onElementDrag?.(st.selectedElementId, {
          x: snap(obj.position.x),
          y: snap(-obj.position.y), // design space is y-down
          z: snap(obj.position.z),
        });
      }
    });

    st.transformControl = transformControl;

    /* Frame the whole character regardless of shape or viewport aspect. */
    st.fit = () => {
      const f = computeFit(camera, [group, gridGroup]);
      if (!f) return;
      st.baseDist = f.dist;
      st.target.copy(f.center);
      ground.position.y = f.minY - 6;
      key.target.position.copy(f.center);
      key.target.updateMatrixWorld();
      if (!st.userZoomed) st.dist = st.baseDist;
      applyCamera();
    };

    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      st.fit?.();
    };
    st.resize = resize;
    resize();
    applyCamera();

    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ---- pointer helpers -------------------------------------------------
    const el = renderer.domElement;
    const setPointer = (e) => {
      const r = el.getBoundingClientRect();
      st.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      st.raycaster.setFromCamera(st.pointer, camera);
    };
    const pickAny = (e) => {
      setPointer(e);
      const hits = st.raycaster.intersectObjects(group.children, false);
      return hits.find(h => h.object.userData.element || !h.object.userData.detail) ?? null;
    };
    /** Plane through `point` facing the camera — the natural drag surface. */
    const facingPlane = (point) => {
      const n = new THREE.Vector3();
      camera.getWorldDirection(n);
      st.plane.setFromNormalAndCoplanarPoint(n.negate(), point);
    };

    // ---- orbit / zoom / pan / element drag -------------------------------
    const down = (e) => {
      // If the user is interacting with the TransformControls arrows, let it handle the event
      if (st.transformControl && st.transformControl.axis !== null) {
        return;
      }

      el.setPointerCapture?.(e.pointerId);
      st.lastX = e.clientX; st.lastY = e.clientY;
      st.moved = 0;

      // an object under the pointer takes priority over the camera
      const hit = (st.canEditElements || st.canPlace) ? pickAny(e) : null;
      if (hit && e.button === 0 && !e.shiftKey) {
        const id = hit.object.userData.element;
        const scale = st.character?.scale ?? 1;

        // a placed element moves on its own
        const src = id ? (st.character?.elements ?? []).find(x => x.id === id) : null;
        if (src && st.canEditElements) {
          st.elDrag = {
            id,
            mode: e.altKey ? 'resize' : 'move',
            startX: e.clientX, startY: e.clientY,
            w0: src.w, h0: src.h,
            scale,
          };
          if (st.elDrag.mode === 'move') {
            const world = hit.object.position.clone().multiplyScalar(scale).add(group.position);
            facingPlane(world);
            st.raycaster.ray.intersectPlane(st.plane, st.hitPoint);
            st.grabOffset.copy(world).sub(st.hitPoint);
          }
          st.onSelect?.(hit.object.userData.part);
          st.onElementDragStart?.(id);
          return;
        }

        // anything else is the character itself — drag it around the board
        if (!id && st.canPlace && !hit.object.userData.detail) {
          facingPlane(hit.point);
          st.raycaster.ray.intersectPlane(st.plane, st.hitPoint);
          st.placeDrag = { start: st.hitPoint.clone(), base: group.position.clone() };
          st.onSelect?.(hit.object.userData.part);
          st.onPlaceStart?.();
          return;
        }
      }

      st.dragging = true;
      st.panning = e.button === 2 || e.shiftKey;
    };

    const move = (e) => {
      // ---- moving or resizing a placed element
      if (st.elDrag) {
        const d = st.elDrag;
        st.moved += Math.abs(e.clientX - st.lastX) + Math.abs(e.clientY - st.lastY);
        st.lastX = e.clientX; st.lastY = e.clientY;

        if (d.mode === 'resize') {
          // Width follows the horizontal drag and height the vertical one, so the
          // two axes are independent. Locking the ratio makes it a uniform scale.
          const fx = Math.max(0.08, 1 + ((e.clientX - d.startX) * 1.4) / 160);
          const fy = Math.max(0.08, 1 + ((d.startY - e.clientY) * 1.4) / 160);
          const side = (n) => Math.max(6, Math.min(460, Math.round(n)));
          if (st.lockRatio) {
            const f = Math.max(0.08, (fx + fy) / 2);
            st.onElementResize?.(d.id, { w: side(d.w0 * f), h: side(d.h0 * f) });
          } else {
            st.onElementResize?.(d.id, { w: side(d.w0 * fx), h: side(d.h0 * fy) });
          }
        } else {
          setPointer(e);
          if (st.raycaster.ray.intersectPlane(st.plane, st.hitPoint)) {
            const world = st.hitPoint.clone().add(st.grabOffset)
              .sub(group.position).divideScalar(d.scale || 1);
            const snap = (v) => (st.snapCm > 0 ? snapUnits(v, st.snapCm) : Math.round(v));
            st.onElementDrag?.(d.id, {
              x: snap(world.x),
              y: snap(-world.y),      // design space is y-down
              z: snap(world.z),
            });
          }
        }
        return;
      }

      // ---- placing the whole character on the board
      if (st.placeDrag) {
        const d = st.placeDrag;
        st.moved += Math.abs(e.clientX - st.lastX) + Math.abs(e.clientY - st.lastY);
        st.lastX = e.clientX; st.lastY = e.clientY;
        setPointer(e);
        if (st.raycaster.ray.intersectPlane(st.plane, st.hitPoint)) {
          const pos = d.base.clone().add(st.hitPoint.clone().sub(d.start));
          const snap = (v) => (st.snapCm > 0 ? snapUnits(v, st.snapCm) : Math.round(v));
          st.onPlace?.({ x: snap(pos.x), y: snap(-pos.y), z: snap(pos.z) });
        }
        return;
      }

      // ---- camera
      if (!st.dragging) return;
      const dx = e.clientX - st.lastX, dy = e.clientY - st.lastY;
      st.lastX = e.clientX; st.lastY = e.clientY;
      st.moved += Math.abs(dx) + Math.abs(dy);
      if (st.panning) {
        st.target.x -= dx * 0.8 * Math.cos(st.yaw);
        st.target.z += dx * 0.8 * Math.sin(st.yaw);
        st.target.y += dy * 0.8;
      } else {
        st.yaw -= dx * 0.008;
        st.pitch = Math.max(-1.15, Math.min(1.15, st.pitch + dy * 0.006));
      }
      applyCamera();
    };

    const up = (e) => {
      if (st.placeDrag) {
        st.placeDrag = null;
        el.releasePointerCapture?.(e.pointerId);
        st.onPlaceEnd?.(st.moved > 2);
        return;
      }
      if (st.elDrag) {
        const d = st.elDrag;
        st.elDrag = null;
        el.releasePointerCapture?.(e.pointerId);
        st.onElementDragEnd?.(d.id, st.moved > 2, d.mode);
        return;
      }
      st.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
    };

    const wheel = (e) => {
      e.preventDefault();
      st.userZoomed = true;
      const base = st.baseDist || 700;
      st.dist = Math.max(base * 0.35, Math.min(base * 3, st.dist + e.deltaY * 0.9));
      applyCamera();
    };
    const ctx = (e) => e.preventDefault();

    // click-to-select via raycast (only when the pointer barely moved)
    const click = (e) => {
      if (st.moved > 6) return;
      setPointer(e);
      const hits = st.raycaster.intersectObjects(group.children, false);
      const hit = hits.find(h => h.object.userData.part && !h.object.userData.detail);
      if (hit) st.onSelect?.(hit.object.userData.part);
      else st.onSelect?.(null);
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', ctx);
    el.addEventListener('click', click);

    // ---- render loop ---------------------------------------------------
    const loop = () => {
      if (st.disposed) return;
      st.raf = requestAnimationFrame(loop);
      renderer.render(scene, camera);
      st.frames++;
      const now = performance.now();
      if (now - st.fpsAt >= 1000) {
        st.onFps?.(Math.round((st.frames * 1000) / (now - st.fpsAt)));
        st.frames = 0; st.fpsAt = now;
      }
    };
    loop();

    // let the Editor read the live camera for a matching export
    st.api = {
      getCamera: () => ({ yaw: st.yaw, pitch: st.pitch, dist: st.dist, target: st.target.clone() }),
    };
    st.onApi?.(st.api);

    return () => {
      st.disposed = true;
      cancelAnimationFrame(st.raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', ctx);
      el.removeEventListener('click', click);
      transformControl.dispose();
      disposeChildren(group);
      disposeChildren(gridGroup);
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
  }, []);

  // "Reset camera" — return to the front view (user control and freedom)
  useEffect(() => {
    const st = stateRef.current;
    if (!st.applyCamera) return;
    st.yaw = 0.55; st.pitch = 0.18; st.userZoomed = false;
    st.fit?.();
    st.applyCamera();
  }, [resetSignal]);

  // keep callbacks and live values fresh without rebuilding the scene
  useEffect(() => {
    const st = stateRef.current;
    st.onSelect = onSelect;
    st.onFps = onFps;
    st.onElementDragStart = onElementDragStart;
    st.onElementDrag = onElementDrag;
    st.onElementResize = onElementResize;
    st.onElementDragEnd = onElementDragEnd;
    st.onApi = onApi;
    if (st.api) onApi?.(st.api);
    st.onPlaceStart = onPlaceStart;
    st.onPlace = onPlace;
    st.onPlaceEnd = onPlaceEnd;
    st.canEditElements = !!onElementDrag;
    st.canPlace = !!onPlace;
    st.snapCm = snapCm;
    st.lockRatio = lockRatio;
  }, [onSelect, onFps, onElementDragStart, onElementDrag, onElementResize, onElementDragEnd,
      onPlaceStart, onPlace, onPlaceEnd, snapCm, lockRatio, onApi]);

  // ---- the artboard grid ----------------------------------------------
  useEffect(() => {
    const st = stateRef.current;
    if (!st.gridGroup) return;
    if (showGrid) populateGridGroup(st.gridGroup, character);
    else { disposeChildren(st.gridGroup); st.gridGroup.clear(); }
    st.fit?.();
  }, [showGrid, character?.canvas?.width, character?.canvas?.height]);

  // ---- apply lighting updates -----------------------------------------
  useEffect(() => {
    const st = stateRef.current;
    if (st.disposed) return;
    
    const lighting = character?.lighting ?? {};
    if (st.lights) {
      if (lighting.keyLight !== undefined) st.lights.key.intensity = lighting.keyLight;
      if (lighting.rimLight !== undefined) st.lights.rim.intensity = lighting.rimLight;
      if (lighting.bounceLight !== undefined) st.lights.bounce.intensity = lighting.bounceLight;
    }
    if (lighting.bgColor !== undefined) {
      st.scene.background = new THREE.Color(lighting.bgColor);
    } else {
      st.scene.background = new THREE.Color(SCENE_BG);
    }
  }, [character?.lighting]);

  // ---- rebuild meshes when the character changes -----------------------
  useEffect(() => {
    const st = stateRef.current;
    if (!st.group || st.gizmoDragging) return;
    st.character = character;
    const selectedMesh = populateCharacterGroup(st.group, character, selected);

    if (st.selBox) {
      if (selectedMesh) { st.selBox.setFromObject(selectedMesh); st.selBox.visible = true; }
      else st.selBox.visible = false;
    }

    if (st.transformControl) {
      if (selectedMesh && selectedMesh.userData.element && st.canEditElements) {
        st.selectedElementId = selectedMesh.userData.element;
        st.transformControl.attach(selectedMesh);
      } else {
        st.selectedElementId = null;
        st.transformControl.detach();
      }
    }

    // refitting mid-drag would fight the pointer
    if (!st.elDrag && !st.placeDrag && !st.gizmoDragging) st.fit?.();
  }, [character, selected]);

  const onDragOver = onElementDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } : undefined;
  
  const onDrop = onElementDrop ? (e) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('application/x-cd-element') || e.dataTransfer.getData('text/plain');
    if (!key) return;

    const st = stateRef.current;
    if (!st || !st.camera) return;

    const rect = mountRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    st.raycaster.setFromCamera(new THREE.Vector2(nx, ny), st.camera);
    // Intersect with the Z=0 plane of the character (which is at group.position.z)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -st.group.position.z);
    const hit = new THREE.Vector3();
    const res = st.raycaster.ray.intersectPlane(plane, hit);

    if (res) {
      const scale = st.character?.scale ?? 1;
      const localX = (hit.x - st.group.position.x) / scale;
      const localY = -(hit.y - st.group.position.y) / scale; // design space is y-down
      
      const snap = (v) => (st.snapCm > 0 ? snapUnits(v, st.snapCm) : Math.round(v));
      onElementDrop(key, snap(localX), snap(localY));
    } else {
      onElementDrop(key, 0, 0);
    }
  } : undefined;

  return (
    <div ref={mountRef} style={{ position: 'absolute', inset: 0 }}
         onDragOver={onDragOver} onDrop={onDrop} />
  );
}
