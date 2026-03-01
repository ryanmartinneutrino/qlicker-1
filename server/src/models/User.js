import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateMeteorId } from '../utils/meteorId.js';

const EmailSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

const PasswordSchema = new mongoose.Schema(
  {
    bcrypt: { type: String },
  },
  { _id: false }
);

const ResumeSchema = new mongoose.Schema(
  {
    loginTokens: { type: Array, default: [] },
  },
  { _id: false }
);

const EmailTokenSchema = new mongoose.Schema(
  {
    token: { type: String },
    address: { type: String },
    when: { type: Date },
  },
  { _id: false }
);

const EmailServiceSchema = new mongoose.Schema(
  {
    verificationTokens: { type: [EmailTokenSchema], default: [] },
  },
  { _id: false }
);

const ResetPasswordSchema = new mongoose.Schema(
  {
    token: { type: String },
    email: { type: String },
    when: { type: Date },
    reason: { type: String, default: 'reset' },
  },
  { _id: false }
);

const SSOServiceSchema = new mongoose.Schema(
  {
    nameID: { type: String },
  },
  { _id: false }
);

const ServicesSchema = new mongoose.Schema(
  {
    password: { type: PasswordSchema, default: () => ({}) },
    resume: { type: ResumeSchema, default: () => ({}) },
    email: { type: EmailServiceSchema, default: () => ({}) },
    resetPassword: { type: ResetPasswordSchema },
    sso: { type: SSOServiceSchema },
  },
  { _id: false }
);

const ProfileSchema = new mongoose.Schema(
  {
    firstname: { type: String, default: '' },
    lastname: { type: String, default: '' },
    roles: { type: [String], default: ['student'] },
    courses: { type: Array, default: [] },
    studentNumber: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    profileThumbnail: { type: String, default: '' },
    canPromote: { type: Boolean, default: false },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => generateMeteorId() },
    emails: { type: [EmailSchema], default: [] },
    services: { type: ServicesSchema, default: () => ({}) },
    profile: { type: ProfileSchema, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'users',
    timestamps: false,
  }
);

// Virtual: convenient email getter
UserSchema.virtual('email').get(function () {
  return this.emails?.[0]?.address;
});

// Instance method: verify password
UserSchema.methods.verifyPassword = async function (password) {
  const hash = this.services?.password?.bcrypt;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
};

// Static method: hash password
UserSchema.statics.hashPassword = async function (password) {
  return bcrypt.hash(password, 10);
};

// Ensure virtuals are included in JSON/Object output
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', UserSchema);

export default User;
