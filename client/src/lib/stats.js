/**
 * Dimensions and statistics for a character, plus the small download
 * helpers. Deliberately free of three.js and jsPDF so the editor can show
 * these numbers without pulling the export machinery into the main bundle.
 */
import {
  SHAPES, primsFor, partsOf, colorOf, colorTokenOf, colorLabel, hexOf,
  canvasOf, offsetOf, boundsOf, unitsToCm, ELEMENT_KINDS,
  activePartsOf, variantsOf, hiddenOf, variantAxesOf,
} from '@shared/character.js';

const round1 = (n) => Math.round(n * 10) / 10;
const cm = (units) => round1(unitsToCm(units));

export function characterStats(character) {
  const shape = SHAPES[character.shape];
  const board = canvasOf(character);
  const off = offsetOf(character);
  const b = boundsOf(character);
  const prims2d = primsFor(character, '2d');
  const prims3d = primsFor(character, '3d');
  // a mirrored primitive becomes two meshes, so the mesh count is not the prim count
  const meshes = prims3d.reduce((n, p) => n + (p.mirrorZ ? 2 : 1), 0);
  const parts = activePartsOf(character);
  const allParts = partsOf(character.shape);
  const hidden = hiddenOf(character);
  const elements = character.elements ?? [];

  // The variant choices, as the labels a person would say out loud — the spec
  // sheet has to be readable by someone who never opened the editor.
  const axes = variantAxesOf(character.shape);
  const chosen = variantsOf(character);
  const variantRows = Object.entries(axes).map(([key, axis]) => ({
    axis: axis.label,
    option: axis.options.find(o => o.key === chosen[key])?.label ?? chosen[key],
  }));

  const byKind = {};
  for (const e of elements) {
    const label = ELEMENT_KINDS[e.el]?.label ?? e.el;
    byKind[label] = (byKind[label] || 0) + 1;
  }

  const partRows = parts.map(p => ({
    part: p,
    colour: colorLabel(colorTokenOf(character, p)),
    hex: colorOf(character, p),
  }));

  const usedColours = [...new Set([
    ...partRows.map(r => r.colour),
    ...elements.map(e => colorLabel(e.color)),
  ])].filter(Boolean).sort();

  return {
    name: character.name,
    shapeLabel: shape?.label ?? character.shape,
    type: shape?.type ?? character.type,
    scalePercent: Math.round((character.scale ?? 1) * 100),
    board,
    artwork: { w: cm(b.w), h: cm(b.h), empty: b.empty },
    placement: { x: cm(off.x), y: cm(off.y), z: cm(off.z) },
    counts: {
      prims2d: prims2d.length,
      prims3d: prims3d.length,
      meshes,
      parts: parts.length,
      partsOff: hidden.length,
      partsTotal: allParts.length,
      elements: elements.length,
      colours: usedColours.length,
    },
    partRows,
    hiddenParts: hidden,
    variantRows,
    elementRows: elements.map(e => ({
      kind: ELEMENT_KINDS[e.el]?.label ?? e.el,
      x: cm(e.x), y: cm(e.y), w: cm(e.w), h: cm(e.h),
      rot: e.rot ?? 0, z: e.z ?? 0,
      colour: colorLabel(e.color), hex: hexOf(e.color, '#888888'),
    })),
    byKind,
    usedColours: usedColours.map(n => ({ name: n, hex: hexOf(n, '#888888') })),
  };
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('The image could not be read.'));
    r.readAsDataURL(blob);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (t) => String(t).replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') || 'character';
