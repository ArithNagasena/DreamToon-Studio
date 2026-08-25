import mongoose from 'mongoose';

/**
 * A designer-placed element: a free primitive dragged onto the canvas and
 * positioned by hand. Bounds mirror ELEMENT_LIMITS in shared/character.js —
 * the validator there runs first, so these are a second line of defence.
 */
const elementSchema = new mongoose.Schema({
  id:    { type: String, required: true },
  el:    { type: String, required: true },
  x:     { type: Number, default: 0, min: -260, max: 260 },
  y:     { type: Number, default: 0, min: -260, max: 260 },
  w:     { type: Number, default: 64, min: 6, max: 460 },
  h:     { type: Number, default: 64, min: 6, max: 460 },
  d:     { type: Number, default: 64, min: 6, max: 460 },
  z:     { type: Number, default: 0, min: -200, max: 200 },
  rot:   { type: Number, default: 0, min: -180, max: 180 },
  color: { type: String, default: 'Sky Blue' },
}, { _id: false });

const characterSchema = new mongoose.Schema({
  owner:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:   { type: String, required: true, trim: true, maxlength: 60 },
  type:   { type: String, enum: ['animal', 'plant', 'human', 'custom'], required: true },
  shape:  { type: String, required: true },
  scale:  { type: Number, default: 1, min: 0.25, max: 2 },
  colors: { type: Map, of: String, default: {} },
  // body shape / head shape / face style — one chosen option key per axis
  variants: { type: Map, of: String, default: {} },
  // optional parts the designer has switched off (a tail, a hat of hair, shoes)
  hidden: { type: [String], default: [] },
  // FR-drag — free elements the designer placed, in layer order
  elements: { type: [elementSchema], default: [] },
  // where the whole composition sits on the board, in design units
  offset: {
    x: { type: Number, default: 0, min: -1000, max: 1000 },
    y: { type: Number, default: 0, min: -1000, max: 1000 },
    z: { type: Number, default: 0, min: -1000, max: 1000 },
  },
  // the artboard, in centimetres — designers size work physically
  canvas: {
    width:  { type: Number, default: 26, min: 5, max: 100 },
    height: { type: Number, default: 26, min: 5, max: 100 },
  },
  // soft delete powers the 10-second undo (FR12 / NFR4)
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

characterSchema.index({ owner: 1, updatedAt: -1 });
characterSchema.index({ owner: 1, createdAt: -1 });

export const Character = mongoose.model('Character', characterSchema);
