import React, { useId, useRef } from 'react';
import {
  SHAPES, fillOf, primsForPose, isDrawnPose, drawnPoseOf, viewBoxOf, canvasOf, offsetOf,
  CM_UNITS, GRID, snapUnits,
} from '@shared/character.js';

/**
 * FR2 — 2D view.
 * Renders the shared primitive list as SVG. Clicking a primitive selects
 * its part (FR11) — direct manipulation: the visible object is the control.
 *
 * Dragged elements (character.elements) render through the same pipeline and
 * are additionally movable: press one and it follows the pointer, so the
 * canvas is the editor rather than a preview of one.
 *
 * The artboard is sized in centimetres, and the grid is drawn in the same
 * units, so "12 cm wide" on screen means 12 cm to the game team.
 *
 * `pose` picks the elevation. One of the two is the artwork as drawn — which
 * one depends on the shape, since a quadruped is drawn in profile and a child
 * facing the viewer. The other is an orthographic projection of the same model
 * the 3D view renders, so it is a true elevation rather than a second drawing
 * to maintain. Editing stays in the drawn view, where a pointer means what it
 * looks like.
 */
export default function Character2D({
  character, selected, onSelect, scale = true,
  size = 420, interactive = false, showSelection = true,
  showGrid = false, showRulers = true, rulerUnit = 'cm', snapCm = 0, pose = null,
  // element editing — supplied by the Editor, absent everywhere else
  onElementDragStart, onElementDrag, onElementDragEnd, onElementDrop,
  // moving the whole composition around the board
  onPlaceStart, onPlace, onPlaceEnd,
}) {
  const shape = SHAPES[character.shape];
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  if (!shape) return null;

  // No pose asked for means "however this shape was drawn" — a thumbnail wants
  // the artwork, not a projection of it.
  const shown = pose ?? drawnPoseOf(character);
  // Editing happens in the drawn view. The projected elevation flattens the
  // axis a drag would move along, so a pointer there would not mean what it
  // looks like — it is a reference view, and says so.
  const isSide = !isDrawnPose(character, shown);
  const prims = primsForPose(character, shown);
  const s = scale ? (character.scale ?? 1) : 1;
  const canDrag = interactive && !isSide && !!onElementDrag;
  const vb = viewBoxOf(character);
  const board = canvasOf(character);
  const off = offsetOf(character);
  const canPlace = interactive && !isSide && !!onPlace;

  const applySnap = (v) => (snapCm > 0 ? snapUnits(v, snapCm) : Math.round(v));

  /** Client pixel → board coordinate (the viewBox space the grid is drawn in). */
  const toBoard = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  /** Client pixel → design space, undoing the placement offset and the scale. */
  const toDesign = (clientX, clientY) => {
    const b = toBoard(clientX, clientY);
    return { x: (b.x - off.x) / s, y: (b.y - off.y) / s };
  };

  /* ---- ruler crosshairs ---- */
  const crosshairXRef = useRef(null);
  const crosshairYRef = useRef(null);
  
  const handlePointerMove = (e) => {
    if (showRulers && interactive) {
      const b = toBoard(e.clientX, e.clientY);
      if (crosshairXRef.current) {
        crosshairXRef.current.setAttribute('x1', b.x);
        crosshairXRef.current.setAttribute('x2', b.x);
      }
      if (crosshairYRef.current) {
        crosshairYRef.current.setAttribute('y1', b.y);
        crosshairYRef.current.setAttribute('y2', b.y);
      }
    }
  };
  
  const handlePointerLeave = () => {
    if (crosshairXRef.current) crosshairXRef.current.setAttribute('x1', -9999);
    if (crosshairYRef.current) crosshairYRef.current.setAttribute('y1', -9999);
  };

  /* ---- dragging a placed element ---- */
  const startDrag = (e, prim) => {
    if (!canDrag || !prim.element) return;
    e.stopPropagation();
    e.preventDefault();
    const start = toDesign(e.clientX, e.clientY);
    dragRef.current = { id: prim.element, dx: prim.x - start.x, dy: prim.y - start.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onSelect?.(prim.part);
    onElementDragStart?.(prim.element);
  };
  const moveDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toDesign(e.clientX, e.clientY);
    d.moved = true;
    onElementDrag?.(d.id, applySnap(p.x + d.dx), applySnap(p.y + d.dy));
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onElementDragEnd?.(d.id, d.moved);
  };

  /* ---- dragging the character body to place it on the board ---- */
  const placeRef = useRef(null);
  const startPlace = (e) => {
    if (!canPlace) return;
    e.stopPropagation();
    e.preventDefault();
    const b = toBoard(e.clientX, e.clientY);
    placeRef.current = { dx: off.x - b.x, dy: off.y - b.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onPlaceStart?.();
  };
  const movePlace = (e) => {
    const d = placeRef.current;
    if (!d) return;
    const b = toBoard(e.clientX, e.clientY);
    d.moved = true;
    onPlace?.({ x: applySnap(b.x + d.dx), y: applySnap(b.y + d.dy) });
  };
  const endPlace = (e) => {
    const d = placeRef.current;
    if (!d) return;
    placeRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onPlaceEnd?.(d.moved);
  };

  /* ---- dropping a new element from the library ---- */
  const canDrop = onElementDrop && !isSide;
  const onDragOver = canDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } : undefined;
  const onDrop = canDrop ? (e) => {
    const key = e.dataTransfer.getData('application/x-cd-element') || e.dataTransfer.getData('text/plain');
    if (!key) return;
    e.preventDefault();
    const p = toDesign(e.clientX, e.clientY);
    onElementDrop(key, applySnap(p.x), applySnap(p.y));
  } : undefined;

  const rt = Math.max(30, vb.w / 25); // ruler thickness
  const ts = Math.max(10, vb.w / 50); // text size

  return (
    <svg
      ref={svgRef}
      viewBox={vb.str}
      width={size} height={size}
      role="img"
      aria-label={`${character.name}, a ${shape.label.toLowerCase()} on a ${board.width} by ${board.height} centimetre canvas, shown from the ${shown} in 2D`}
      style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', touchAction: 'none' }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid="canvas-2d"
      data-pose={shown}
    >
      <defs>
        {/* one shared volume gradient — a top-left light lifts flat fills into form */}
        <radialGradient id={`vol${uid}`} cx="34%" cy="26%" r="78%">
          <stop offset="0%"   stopColor="#fff" stopOpacity="0.30" />
          <stop offset="55%"  stopColor="#fff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.14" />
        </radialGradient>
        <pattern id={`gmin${uid}`} width={GRID.minor} height={GRID.minor} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID.minor} 0 L 0 0 0 ${GRID.minor}`} fill="none" stroke="#C9D2DC" strokeWidth="0.8" />
        </pattern>
        <pattern id={`gmaj${uid}`} width={GRID.major} height={GRID.major} patternUnits="userSpaceOnUse">
          <rect width={GRID.major} height={GRID.major} fill={`url(#gmin${uid})`} />
          <path d={`M ${GRID.major} 0 L 0 0 0 ${GRID.major}`} fill="none" stroke="#A6B4C2" strokeWidth="1.6" />
        </pattern>
      </defs>

      {/* the artboard itself — drawn in board units, never scaled with the character */}
      {showGrid && (
        <g pointerEvents="none" data-testid="grid-2d">
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={`url(#gmaj${uid})`} />
          <line x1={vb.x} y1="0" x2={vb.x + vb.w} y2="0" stroke="#8FA0B2" strokeWidth="1.8" />
          <line x1="0" y1={vb.y} x2="0" y2={vb.y + vb.h} stroke="#8FA0B2" strokeWidth="1.8" />
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="none" stroke="#7C8B9A" strokeWidth="2.4" />
          <text x={vb.x + 6} y={vb.y + 18} fontSize={Math.max(11, vb.w / 40)} fill="#6C7B8A"
                fontFamily="system-ui, sans-serif">
            {board.width} × {board.height} cm
          </text>
        </g>
      )}

      {/* Rulers */}
      {showRulers && interactive && (
        <g pointerEvents="none" data-testid="rulers-2d">
          <rect x={vb.x} y={vb.y} width={vb.w} height={rt} fill="var(--surface-2, #f5f7f9)" />
          <line x1={vb.x} y1={vb.y + rt} x2={vb.x + vb.w} y2={vb.y + rt} stroke="var(--line, #e1e7ec)" strokeWidth="2" />
          
          <rect x={vb.x} y={vb.y} width={rt} height={vb.h} fill="var(--surface-2, #f5f7f9)" />
          <line x1={vb.x + rt} y1={vb.y} x2={vb.x + rt} y2={vb.y + vb.h} stroke="var(--line, #e1e7ec)" strokeWidth="2" />

          <rect x={vb.x} y={vb.y} width={rt} height={rt} fill="var(--surface, #fff)" stroke="var(--line, #e1e7ec)" strokeWidth="2" />

          {(() => {
             const ticks = [];
             const addTick = (valCm, isMajor, label, isY = false) => {
                 const pos = valCm * CM_UNITS;
                 if (isY) {
                   ticks.push(
                     <g key={`y-${valCm}`}>
                       <line x1={vb.x + rt - (isMajor ? rt * 0.4 : rt * 0.2)} y1={pos} x2={vb.x + rt} y2={pos} stroke="#8FA0B2" strokeWidth={isMajor ? 2 : 1} />
                       {isMajor && label != null && valCm !== 0 && <text x={vb.x + ts*0.2} y={pos - ts*0.2} fontSize={ts} fill="#6C7B8A" fontFamily="system-ui, sans-serif">{label}</text>}
                     </g>
                   );
                 } else {
                   ticks.push(
                     <g key={`x-${valCm}`}>
                       <line x1={pos} y1={vb.y + rt - (isMajor ? rt * 0.4 : rt * 0.2)} x2={pos} y2={vb.y + rt} stroke="#8FA0B2" strokeWidth={isMajor ? 2 : 1} />
                       {isMajor && label != null && <text x={pos + ts*0.2} y={vb.y + rt*0.5} fontSize={ts} fill="#6C7B8A" fontFamily="system-ui, sans-serif">{label}</text>}
                     </g>
                   );
                 }
             };

             const halfW = board.width / 2;
             const halfH = board.height / 2;
             
             if (rulerUnit === 'inch') {
                const halfInchesX = Math.ceil(halfW / 2.54);
                const halfInchesY = Math.ceil(halfH / 2.54);
                for (let i = -halfInchesX; i <= halfInchesX; i++) {
                   addTick(i * 2.54, true, i, false);
                   addTick(i * 2.54 + 0.635, false, null, false);
                   addTick(i * 2.54 + 1.27, false, null, false);
                   addTick(i * 2.54 + 1.905, false, null, false);
                }
                for (let i = -halfInchesY; i <= halfInchesY; i++) {
                   addTick(i * 2.54, true, i, true);
                   addTick(i * 2.54 + 0.635, false, null, true);
                   addTick(i * 2.54 + 1.27, false, null, true);
                   addTick(i * 2.54 + 1.905, false, null, true);
                }
             } else if (rulerUnit === 'mm') {
                const halfMmX = Math.ceil(halfW * 10);
                const halfMmY = Math.ceil(halfH * 10);
                for (let i = -halfMmX; i <= halfMmX; i++) {
                   const isMajor = i % 10 === 0;
                   if (isMajor || halfMmX < 300) addTick(i * 0.1, isMajor, isMajor ? i : null, false);
                }
                for (let i = -halfMmY; i <= halfMmY; i++) {
                   const isMajor = i % 10 === 0;
                   if (isMajor || halfMmY < 300) addTick(i * 0.1, isMajor, isMajor ? i : null, true);
                }
             } else { // cm
                const halfCmX = Math.ceil(halfW);
                const halfCmY = Math.ceil(halfH);
                for (let i = -halfCmX; i <= halfCmX; i++) {
                   const isMajor = i % 5 === 0;
                   addTick(i, isMajor, isMajor ? i : null, false);
                }
                for (let i = -halfCmY; i <= halfCmY; i++) {
                   const isMajor = i % 5 === 0;
                   addTick(i, isMajor, isMajor ? i : null, true);
                }
             }
             return ticks;
          })()}

          {/* Crosshairs */}
          <line ref={crosshairXRef} x1="-9999" y1={vb.y + rt} x2="-9999" y2={vb.y + vb.h} stroke="#ff4757" strokeWidth={Math.max(1, vb.w / 600)} strokeDasharray={`${Math.max(4, vb.w/150)} ${Math.max(4, vb.w/150)}`} />
          <line ref={crosshairYRef} x1={vb.x + rt} y1="-9999" x2={vb.x + vb.w} y2="-9999" stroke="#ff4757" strokeWidth={Math.max(1, vb.w / 600)} strokeDasharray={`${Math.max(4, vb.w/150)} ${Math.max(4, vb.w/150)}`} />
        </g>
      )}

      <g transform={`translate(${off.x} ${off.y}) scale(${s})`} data-testid="artwork">
        {prims.map((p, i) => {
          const isSel = showSelection && selected === p.part;
          const fill = fillOf(character, p);
          const selectable = interactive && !p.detail;
          const draggable = canDrag && !!p.element;

          const placeable = canPlace && !p.element && !p.detail;
          const handlers = {
            style: selectable || placeable ? { cursor: draggable || placeable ? 'move' : 'pointer' } : undefined,
            onClick: selectable ? (e) => { e.stopPropagation(); onSelect?.(p.part); } : undefined,
            ...(draggable ? {
              onPointerDown: (e) => startDrag(e, p),
              onPointerMove: moveDrag,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
            } : placeable ? {
              onPointerDown: startPlace,
              onPointerMove: movePlace,
              onPointerUp: endPlace,
              onPointerCancel: endPlace,
            } : {}),
          };

          const stroke = p.outline === false || p.detail ? 'none' : 'rgba(26,24,21,.55)';
          const common = {
            stroke,
            strokeWidth: stroke === 'none' ? 0 : 2,
            transform: p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined,
          };

          const body = <Prim p={p} fill={fill} common={common} />;
          // the gloss pass is what reads as roundness; details stay matte
          const gloss = !p.detail && p.outline !== false
            ? <Prim p={p} fill={`url(#vol${uid})`} common={{ ...common, stroke: 'none', strokeWidth: 0 }} pointerEvents="none" />
            : null;

          return (
            <g key={p.element ? `el-${p.element}-${i}` : `p-${i}`} {...handlers}>
              {body}
              {gloss}
              {isSel && <SelectionRing p={p} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** One primitive as SVG. Every kind the shared model can emit is handled here. */
function Prim({ p, fill, common, pointerEvents }) {
  const extra = pointerEvents ? { pointerEvents } : {};
  const props = { fill, ...common, ...extra };
  const hw = p.w / 2, hh = p.h / 2;

  switch (p.kind) {
    case 'rect':
      return <rect x={p.x - hw} y={p.y - hh} width={p.w} height={p.h}
                   rx={p.round ?? Math.min(p.w, p.h) * 0.3} {...props} />;

    case 'capsule':
      return <rect x={p.x - hw} y={p.y - hh} width={p.w} height={p.h}
                   rx={Math.min(p.w, p.h) / 2} {...props} />;

    case 'cylinder':
      // a cylinder seen side-on is a barrel, not an ellipse
      return <rect x={p.x - hw} y={p.y - hh} width={p.w} height={p.h}
                   rx={Math.min(p.w, p.h) * 0.22} {...props} />;

    case 'cone':
      return <polygon points={`${p.x},${p.y - hh} ${p.x + hw},${p.y + hh} ${p.x - hw},${p.y + hh}`} {...props} />;

    case 'leaf':
      return <path d={leafPath(p.x, p.y, p.w, p.h)} {...props} />;

    case 'torus':
      return <path d={ringPath(p.x, p.y, hw, hh)} fillRule="evenodd" {...props} />;

    case 'star':
      return <polygon points={starPoints(p.x, p.y, hw, hh)} {...props} />;

    default:
      return <ellipse cx={p.x} cy={p.y} rx={hw} ry={hh} {...props} />;
  }
}

/* A symmetric pointed oval — petals, leaves, fins and feathers. */
function leafPath(x, y, w, h) {
  const hw = w / 2, hh = h / 2;
  return `M ${x - hw} ${y} C ${x - hw * 0.5} ${y - hh} ${x + hw * 0.5} ${y - hh} ${x + hw} ${y}`
       + ` C ${x + hw * 0.5} ${y + hh} ${x - hw * 0.5} ${y + hh} ${x - hw} ${y} Z`;
}

/* Outer ellipse plus a reversed inner one — evenodd punches the hole. */
function ringPath(x, y, rx, ry) {
  const irx = rx * 0.52, iry = ry * 0.52;
  return `M ${x - rx} ${y} A ${rx} ${ry} 0 1 0 ${x + rx} ${y} A ${rx} ${ry} 0 1 0 ${x - rx} ${y} Z`
       + ` M ${x - irx} ${y} A ${irx} ${iry} 0 1 1 ${x + irx} ${y} A ${irx} ${iry} 0 1 1 ${x - irx} ${y} Z`;
}

function starPoints(x, y, rx, ry) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const f = i % 2 ? 0.44 : 1;
    pts.push(`${(x + Math.cos(a) * rx * f).toFixed(1)},${(y + Math.sin(a) * ry * f).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Dashed halo marking the selected part — visibility of system status. */
function SelectionRing({ p }) {
  const pad = 10;
  return (
    <rect
      x={p.x - p.w / 2 - pad} y={p.y - p.h / 2 - pad}
      width={p.w + pad * 2} height={p.h + pad * 2}
      rx={12} fill="none" stroke="#B4530A" strokeWidth="2.5" strokeDasharray="7 5"
      transform={p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined}
      pointerEvents="none"
    />
  );
}
