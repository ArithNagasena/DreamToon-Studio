/**
 * Export pipelines — PNG for either view, and a PDF spec sheet.
 *
 * The 3D image is rendered offscreen through the SAME scene module the live
 * view uses (lib/scene3d.js), so an export is never a second, drifting
 * implementation of the character. It is rendered at export resolution
 * rather than screen-grabbed, so the image does not inherit the viewport's
 * size or device pixel ratio.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { jsPDF } from 'jspdf';
import { characterStats } from './stats.js';
import {
  SCENE_BG, DEFAULT_VIEW, addLights, makeGround, populateCharacterGroup,
  populateGridGroup, computeFit, positionCamera, disposeChildren,
} from './scene3d.js';

/* ---------------------------------------------------------------------
 * 2D — rasterise the live SVG
 * ------------------------------------------------------------------- */
export async function svgToPngBlob(svgEl, { width = 1600, background = '#FFFFFF' } = {}) {
  if (!svgEl) throw new Error('The 2D canvas is not on screen.');
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const vb = (clone.getAttribute('viewBox') || '0 0 520 520').trim().split(/[\s,]+/).map(Number);
  const aspect = vb[3] ? vb[2] / vb[3] : 1;
  const height = Math.max(1, Math.round(width / aspect));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const src = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('The 2D artwork could not be rasterised.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(img, 0, 0, width, height);
    return await toBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------------------------------------------------------------
 * 3D — render offscreen at export resolution
 * ------------------------------------------------------------------- */
export async function render3DToPngBlob(character, {
  width = 1600, height = 1200, showGrid = true, camera: liveCamera = null,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch {
    throw new Error('This browser could not open a WebGL context for the 3D export.');
  }
  if (!renderer) throw new Error('This browser could not open a WebGL context for the 3D export.');

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const gridGroup = new THREE.Group();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene.background = new THREE.Color(SCENE_BG);
    const key = addLights(scene);
    const ground = makeGround();
    scene.add(ground, gridGroup, group);

    populateCharacterGroup(group, character, null);
    if (showGrid) populateGridGroup(gridGroup, character);

    const cam = new THREE.PerspectiveCamera(38, width / height, 1, 5000);
    const fit = computeFit(cam, [group, gridGroup]);
    if (fit) {
      ground.position.y = fit.minY - 6;
      key.target.position.copy(fit.center);
      key.target.updateMatrixWorld();
    }
    // the designer's viewing ANGLE is preserved; the distance is refitted so
    // the export always frames the whole character at the export aspect
    positionCamera(cam, {
      yaw: liveCamera?.yaw ?? DEFAULT_VIEW.yaw,
      pitch: liveCamera?.pitch ?? DEFAULT_VIEW.pitch,
      dist: fit ? fit.dist : (liveCamera?.dist ?? 720),
      target: fit ? fit.center : new THREE.Vector3(),
    });

    renderer.render(scene, cam);
    return await toBlob(canvas);
  } finally {
    disposeChildren(group);
    disposeChildren(gridGroup);
    renderer?.dispose();
  }
}

/* ---------------------------------------------------------------------
 * 3D geometry — glTF / GLB
 *
 * The PNG export ships an image of the character; this ships the character.
 * It is built from the same populateCharacterGroup the live view uses, so the
 * mesh a game engine loads is the mesh the designer approved. The scene is
 * flipped once on import into engine space (glTF is y-up and metres-ish,
 * design space is y-down and unit-per-pixel) — done here rather than asking
 * every consumer to remember it.
 * ------------------------------------------------------------------- */
export async function characterToGltfBlob(character, { binary = true } = {}) {
  const root = new THREE.Group();
  root.name = (character?.name || 'character').slice(0, 60);
  const group = new THREE.Group();
  group.name = 'artwork';
  root.add(group);

  populateCharacterGroup(group, character, null);
  if (!group.children.length) throw new Error('There is nothing to export yet.');

  // glTF is y-up; design space is y-down, and 20 units is a centimetre
  root.scale.setScalar(1 / 20);
  root.updateMatrixWorld(true);

  try {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(root, {
      binary,
      onlyVisible: true,
      truncateDrawRange: true,
    });
    return binary
      ? new Blob([result], { type: 'model/gltf-binary' })
      : new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
  } finally {
    disposeChildren(root);
  }
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), 'image/png');
  });
}

/* ---------------------------------------------------------------------
 * PDF spec sheet
 * ------------------------------------------------------------------- */
const INK = [30, 34, 39];
const MUTED = [106, 112, 120];
const RULE = [205, 210, 216];
const ACCENT = [180, 83, 10];

export async function buildPdfBlob(character, { png2d, png2dSide, png3d, stats }) {
  const s = stats ?? characterStats(character);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 14;
  const W = PW - M * 2;
  let y = M;

  const ensure = (h) => {
    if (y + h <= PH - M - 8) return;
    footer(doc, s);
    doc.addPage();
    y = M;
  };
  const heading = (text) => {
    ensure(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(...ACCENT);
    doc.text(text.toUpperCase(), M, y);
    y += 2;
    doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
    doc.line(M, y, M + W, y);
    y += 5;
    doc.setTextColor(...INK);
  };

  /* ---- title block ---- */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text(s.name || 'Untitled', M, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(`${s.shapeLabel} · ${s.type} · ${s.board.width} × ${s.board.height} cm artboard`, M, y + 12);
  doc.text(new Date().toLocaleString(), PW - M, y + 12, { align: 'right' });
  y += 16;
  doc.setDrawColor(...INK); doc.setLineWidth(0.5);
  doc.line(M, y, M + W, y);
  y += 7;

  /* ---- the views: front elevation, side elevation, 3D render ---- */
  const panels = [
    { label: '2D front', src: png2d },
    ...(png2dSide ? [{ label: '2D side', src: png2dSide }] : []),
    { label: '3D view', src: png3d },
  ];
  const gap = 6;
  const boxW = (W - gap * (panels.length - 1)) / panels.length;
  const boxH = boxW * 0.82;
  ensure(boxH + 14);

  const drawView = (x, label, dataUrl) => {
    doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, boxW, boxH, 'FD');
    if (dataUrl) {
      // preserve the image's own aspect inside the box
      const img = doc.getImageProperties(dataUrl);
      const sc = Math.min((boxW - 4) / img.width, (boxH - 4) / img.height);
      const iw = img.width * sc, ih = img.height * sc;
      doc.addImage(dataUrl, 'PNG', x + (boxW - iw) / 2, y + (boxH - ih) / 2, iw, ih);
    } else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text('not included', x + boxW / 2, y + boxH / 2, { align: 'center' });
      doc.setTextColor(...INK);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y + boxH + 4);
    doc.setTextColor(...INK);
  };
  panels.forEach((p, i) => drawView(M + i * (boxW + gap), p.label, p.src));
  y += boxH + 10;

  /* ---- dimensions ---- */
  heading('Dimensions');
  const dims = [
    ['Artboard', `${s.board.width} × ${s.board.height} cm`],
    ['Artwork', s.artwork.empty ? 'empty' : `${s.artwork.w} × ${s.artwork.h} cm`],
    ['Scale', `${s.scalePercent}%`],
    ['Placement', `X ${s.placement.x} cm · Y ${s.placement.y} cm · depth ${s.placement.z} cm`],
  ];
  y = twoColumn(doc, dims, M, y, W);
  y += 4;

  /* ---- statistics ---- */
  heading('Statistics');
  const kinds = Object.entries(s.byKind).map(([k, n]) => `${n}× ${k}`).join(', ');
  const statRows = [
    ['Primitives (2D)', String(s.counts.prims2d)],
    ['Primitives (3D)', `${s.counts.prims3d} (${s.counts.meshes} meshes)`],
    ['Editable parts', `${s.counts.parts} of ${s.counts.partsTotal}`],
    ['Parts removed', s.hiddenParts?.length ? s.hiddenParts.join(', ') : 'none'],
    ['Placed elements', s.counts.elements ? `${s.counts.elements} — ${kinds}` : 'none'],
    ['Colours used', String(s.counts.colours)],
  ];
  y = twoColumn(doc, statRows, M, y, W);
  y += 2;

  // the palette actually used, as swatches
  if (s.usedColours.length) {
    ensure(12);
    let x = M;
    for (const c of s.usedColours) {
      const label = c.name;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      const tw = doc.getTextWidth(label);
      const chipW = tw + 8;
      if (x + chipW > M + W) { x = M; y += 7; ensure(10); }
      doc.setFillColor(c.hex);
      doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
      doc.rect(x, y - 3, 4.5, 4.5, 'FD');
      doc.setTextColor(...MUTED);
      doc.text(label, x + 6, y + 0.4);
      x += chipW + 2;
    }
    y += 8;
    doc.setTextColor(...INK);
  }

  /* ---- shape choices ---- */
  if (s.variantRows?.length) {
    heading('Shape');
    y = twoColumn(doc, s.variantRows.map(v => [v.axis, v.option]), M, y, W);
    y += 4;
  }

  /* ---- parts ---- */
  if (s.partRows.length) {
    heading('Parts and colours');
    for (const r of s.partRows) {
      ensure(6);
      doc.setFillColor(r.hex);
      doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
      doc.rect(M, y - 3.2, 4.5, 4.5, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
      doc.text(cap(r.part), M + 7, y);
      doc.setTextColor(...MUTED);
      doc.text(r.colour, M + 55, y);
      doc.setTextColor(...INK);
      y += 5.6;
    }
    y += 3;
  }

  /* ---- elements ---- */
  if (s.elementRows.length) {
    heading('Placed elements');
    const cols = [M + 7, M + 42, M + 78, M + 112, M + 140];
    ensure(8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text('SHAPE', cols[0], y);
    doc.text('POSITION', cols[1], y);
    doc.text('SIZE', cols[2], y);
    doc.text('ROTATION', cols[3], y);
    doc.text('COLOUR', cols[4], y);
    y += 4;
    doc.setTextColor(...INK);

    for (const e of s.elementRows) {
      ensure(6);
      doc.setFillColor(e.hex);
      doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
      doc.rect(M, y - 3.2, 4.5, 4.5, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK);
      doc.text(e.kind, cols[0], y);
      doc.setTextColor(...MUTED);
      doc.text(`${e.x}, ${e.y} cm`, cols[1], y);
      doc.text(`${e.w} × ${e.h} cm`, cols[2], y);
      doc.text(`${e.rot}°`, cols[3], y);
      doc.text(e.colour, cols[4], y);
      doc.setTextColor(...INK);
      y += 5.4;
    }
  }

  footer(doc, s);
  return doc.output('blob');
}

function twoColumn(doc, rows, M, y, W) {
  const colW = W / 2;
  doc.setFontSize(9);
  rows.forEach((r, i) => {
    const col = i % 2;
    if (col === 0 && i > 0) y += 5.6;
    const x = M + col * colW;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text(r[0], x, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
    doc.text(String(r[1]), x + 32, y);
  });
  doc.setFont('helvetica', 'normal');
  return y + 6;
}

function footer(doc, s) {
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text('Character Designer · character-designer/v1', 14, PH - 8);
  doc.text(`${s.name} — page ${doc.getNumberOfPages()}`, PW - 14, PH - 8, { align: 'right' });
  doc.setTextColor(...INK);
}

const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
