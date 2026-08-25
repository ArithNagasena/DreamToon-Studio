import mongoose from 'mongoose';

/**
 * A template a designer saved from one of their characters, so the next
 * character of that kind starts finished rather than blank. It stores the
 * same fields a character does, minus placement — where the artwork sat on
 * one board says nothing useful about the next one.
 */
const templateSchema = new mongoose.Schema({
  owner:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:   { type: String, required: true, trim: true, maxlength: 60 },
  type:   { type: String, enum: ['animal', 'plant', 'human', 'custom'], required: true },
  shape:  { type: String, required: true },
  blurb:  { type: String, default: '', maxlength: 120 },
  scale:  { type: Number, default: 1, min: 0.25, max: 2 },
  colors:   { type: Map, of: String, default: {} },
  variants: { type: Map, of: String, default: {} },
  hidden:   { type: [String], default: [] },
  elements: { type: Array, default: [] },
  canvas: {
    width:  { type: Number, default: 26, min: 5, max: 100 },
    height: { type: Number, default: 26, min: 5, max: 100 },
  },
}, { timestamps: true });

templateSchema.index({ owner: 1, updatedAt: -1 });

export const Template = mongoose.model('Template', templateSchema);
