import mongoose from 'mongoose';
import { generateMeteorId } from '../utils/meteorId.js';

const QuizExtensionSchema = new mongoose.Schema(
  {
    userId: { type: String },
    quizStart: { type: Date },
    quizEnd: { type: Date },
  },
  { _id: false }
);

const TagSchema = new mongoose.Schema(
  {
    value: { type: String },
    label: { type: String },
    className: { type: String },
  },
  { _id: false }
);

const JoinRecordSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SessionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => generateMeteorId() },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    courseId: { type: String, required: true },
    status: { type: String, required: true, enum: ['hidden', 'visible', 'running', 'done'] },
    quiz: { type: Boolean, default: false },
    practiceQuiz: { type: Boolean, default: false },
    date: { type: Date },
    quizStart: { type: Date },
    quizEnd: { type: Date },
    quizExtensions: { type: [QuizExtensionSchema], default: [] },
    questions: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    currentQuestion: { type: String, default: '' },
    // Legacy: plain userId strings. New sessions also populate joinRecords.
    joined: { type: [String], default: [] },
    joinRecords: { type: [JoinRecordSchema], default: [] },
    submittedQuiz: { type: [String], default: [] },
    tags: { type: [TagSchema], default: [] },
    reviewable: { type: Boolean, default: false },
    // Interactive session join-code settings
    joinCodeEnabled: { type: Boolean, default: false },
    joinCodeActive: { type: Boolean, default: false },
    currentJoinCode: { type: String, default: '' },
    joinCodeInterval: { type: Number, default: 10 },
    joinCodeExpiresAt: { type: Date },
  },
  {
    collection: 'sessions',
    timestamps: false,
  }
);

const Session = mongoose.model('Session', SessionSchema);

export default Session;
