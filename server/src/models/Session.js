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
    joined: { type: [String], default: [] },
    submittedQuiz: { type: [String], default: [] },
    tags: { type: [TagSchema], default: [] },
    reviewable: { type: Boolean, default: false },
  },
  {
    collection: 'sessions',
    timestamps: false,
  }
);

const Session = mongoose.model('Session', SessionSchema);

export default Session;
