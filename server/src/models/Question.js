import mongoose from 'mongoose';
import { generateMeteorId } from '../utils/meteorId.js';

const OptionSchema = new mongoose.Schema(
  {
    wysiwyg: { type: Boolean, default: false },
    correct: { type: Boolean, default: false },
    answer: { type: String, default: '' },
    content: { type: String, default: '' },
    plainText: { type: String, default: '' },
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

const AttemptSchema = new mongoose.Schema(
  {
    number: { type: Number },
    closed: { type: Boolean, default: false },
  },
  { _id: false }
);

const SessionOptionsSchema = new mongoose.Schema(
  {
    hidden: { type: Boolean, default: false },
    stats: { type: Boolean, default: false },
    correct: { type: Boolean, default: false },
    points: { type: Number, default: 1 },
    maxAttempts: { type: Number, default: 1 },
    attemptWeights: { type: [Number], default: [] },
    attempts: { type: [AttemptSchema], default: [] },
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => generateMeteorId() },
    plainText: { type: String, default: '' },
    type: { type: Number, required: true },
    content: { type: String, default: '' },
    options: { type: [OptionSchema], default: [] },
    toleranceNumerical: { type: Number },
    correctNumerical: { type: Number },
    creator: { type: String, required: true },
    owner: { type: String, default: '' },
    originalQuestion: { type: String, default: '' },
    originalCourse: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    courseId: { type: String, default: '' },
    public: { type: Boolean, default: false },
    publicOnQlicker: { type: Boolean, default: false },
    publicOnQlickerForStudents: { type: Boolean, default: false },
    solution: { type: String, default: '' },
    solution_plainText: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    lastEditedAt: { type: Date },
    approved: { type: Boolean, default: true },
    tags: { type: [TagSchema], default: [] },
    sessionOptions: { type: SessionOptionsSchema },
    imagePath: { type: String, default: '' },
    studentCopyOfPublic: { type: Boolean, default: false },
    studentCreated: { type: Boolean, default: false },
  },
  {
    collection: 'questions',
    timestamps: false,
  }
);

// Indexes for query performance (matching legacy database indexes)
QuestionSchema.index({ sessionId: 1 });
QuestionSchema.index({ courseId: 1 });
QuestionSchema.index({ owner: 1 });
QuestionSchema.index({ courseId: 1, createdAt: -1 });
QuestionSchema.index({ originalCourse: 1 });
QuestionSchema.index({ 'tags.value': 1 });
QuestionSchema.index({
  plainText: 'text',
  'options.plainText': 'text',
  'options.answer': 'text',
});

const Question = mongoose.model('Question', QuestionSchema);

export default Question;
