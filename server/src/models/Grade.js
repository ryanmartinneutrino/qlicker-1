import mongoose from 'mongoose';
import { generateMeteorId } from '../utils/meteorId.js';

const MarkSchema = new mongoose.Schema(
  {
    questionId: { type: String, default: '' },
    responseId: { type: String, default: '' },
    attempt: { type: Number, default: 1 },
    points: { type: Number, default: 0 },
    outOf: { type: Number, default: 0 },
    automatic: { type: Boolean, default: true },
    needsGrading: { type: Boolean, default: false },
    feedback: { type: String, default: '' },
  },
  { _id: false }
);

const GradeSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => generateMeteorId() },
    userId: { type: String, required: true },
    courseId: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    name: { type: String, default: '' },
    marks: { type: [MarkSchema], default: [] },
    joined: { type: Boolean, default: false },
    participation: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
    automatic: { type: Boolean, default: true },
    points: { type: Number, default: 0 },
    outOf: { type: Number, default: 0 },
    numAnswered: { type: Number, default: 0 },
    numQuestions: { type: Number, default: 0 },
    numAnsweredTotal: { type: Number, default: 0 },
    numQuestionsTotal: { type: Number, default: 0 },
    visibleToStudents: { type: Boolean, default: false },
    needsGrading: { type: Boolean, default: false },
  },
  {
    collection: 'grades',
    timestamps: false,
  }
);

const Grade = mongoose.model('Grade', GradeSchema);

export default Grade;
