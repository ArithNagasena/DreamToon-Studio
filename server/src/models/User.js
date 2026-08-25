import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true, maxlength: 80 },
  // A short handle the designer can sign in with instead of their email.
  username:     { type: String, required: true, unique: true, lowercase: true, trim: true, index: true, maxlength: 24 },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['designer', 'artlead'], default: 'designer' },
  status:       { type: String, enum: ['active', 'deactivated'], default: 'active' },
  // Profile picture, stored as a small square data URL. Studios of this size
  // have no asset host, and the client downscales to 256 px before upload, so
  // the picture travels with the record instead of needing separate storage.
  avatar:       { type: String, default: null, maxlength: 300_000 },
  lastActiveAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
