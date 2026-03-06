import crypto from 'crypto';
import Session from '../models/Session.js';
import Course from '../models/Course.js';
import Question from '../models/Question.js';
import Response from '../models/Response.js';
import User from '../models/User.js';
import { copyQuestionToSession } from '../services/questionCopy.js';

const createSessionSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      quiz: { type: 'boolean' },
      practiceQuiz: { type: 'boolean' },
      quizStart: { type: 'string', format: 'date-time' },
      quizEnd: { type: 'string', format: 'date-time' },
      date: { type: 'string', format: 'date-time' },
    },
    additionalProperties: false,
  },
};

const updateSessionSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      quiz: { type: 'boolean' },
      practiceQuiz: { type: 'boolean' },
      quizStart: { type: 'string', format: 'date-time' },
      quizEnd: { type: 'string', format: 'date-time' },
      reviewable: { type: 'boolean' },
      status: { type: 'string', enum: ['hidden', 'visible', 'running', 'done'] },
      date: { type: 'string', format: 'date-time' },
      joinCodeEnabled: { type: 'boolean' },
      joinCodeInterval: { type: 'number', minimum: 5, maximum: 120 },
    },
    additionalProperties: false,
  },
};

const setCurrentQuestionSchema = {
  body: {
    type: 'object',
    required: ['questionId'],
    properties: {
      questionId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

const toggleReviewableSchema = {
  body: {
    type: 'object',
    required: ['reviewable'],
    properties: {
      reviewable: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

const setExtensionsSchema = {
  body: {
    type: 'object',
    required: ['extensions'],
    properties: {
      extensions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', minLength: 1 },
            quizStart: { type: 'string', format: 'date-time' },
            quizEnd: { type: 'string', format: 'date-time' },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

// Generate a 6-digit numeric join code
function generateJoinCode() {
  return String(crypto.randomInt(100000, 999999));
}

// Build response stats for a question's responses (for distribution display)
function buildResponseStats(question, responses) {
  if (!question || !responses) return null;
  const type = Number(question.type);
  const options = question.options || [];

  // MC, TF, MS: count per option
  if ([0, 1, 3].includes(type) && options.length > 0) {
    const distribution = options.map((opt, i) => ({
      index: i,
      answer: opt.answer || opt.content || opt.plainText || `Option ${i + 1}`,
      correct: !!opt.correct,
      count: 0,
    }));

    for (const r of responses) {
      if (Array.isArray(r.answer)) {
        // MS: answer is array of indices or values
        for (const a of r.answer) {
          const idx = typeof a === 'number' ? a : options.findIndex(
            (o) => o.answer === a || o.content === a
          );
          if (idx >= 0 && idx < distribution.length) distribution[idx].count++;
        }
      } else {
        const idx = typeof r.answer === 'number' ? r.answer : options.findIndex(
          (o) => o.answer === r.answer || o.content === r.answer
        );
        if (idx >= 0 && idx < distribution.length) distribution[idx].count++;
      }
    }

    return { type: 'distribution', distribution, total: responses.length };
  }

  // SA: list of answers with student names
  if (type === 2) {
    return {
      type: 'shortAnswer',
      answers: responses.map((r) => ({
        studentUserId: r.studentUserId,
        answer: r.answer,
        answerWysiwyg: r.answerWysiwyg,
      })),
      total: responses.length,
    };
  }

  // Numerical: stats
  if (type === 4) {
    const values = responses.map((r) => Number(r.answer)).filter((v) => !Number.isNaN(v));
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const min = sorted.length > 0 ? sorted[0] : 0;
    const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;

    return {
      type: 'numerical',
      values,
      mean: Math.round(mean * 100) / 100,
      median,
      min,
      max,
      total: responses.length,
    };
  }

  return { type: 'unknown', total: responses.length };
}

// Helper to check if user is instructor of course or admin
function isInstructorOrAdmin(course, user) {
  const roles = user.roles || [];
  return roles.includes('admin') || course.instructors.includes(user.userId);
}

// Helper to check if user is a member of the course (student, instructor, or admin)
function isCourseMember(course, user) {
  const roles = user.roles || [];
  return roles.includes('admin') ||
    course.instructors.includes(user.userId) ||
    course.students.includes(user.userId);
}

function notifySessionUpdated(app, course, sessionId) {
  if (typeof app.wsSendToUser !== 'function') return;
  if (!course || !sessionId) return;

  const memberIds = new Set([
    ...(course.instructors || []),
    ...(course.students || []),
  ].map((userId) => String(userId)).filter(Boolean));

  const payload = {
    courseId: String(course._id),
    sessionId: String(sessionId),
  };

  memberIds.forEach((userId) => {
    app.wsSendToUser(userId, 'session:updated', payload);
  });
}

export default async function sessionRoutes(app) {
  const { authenticate } = app;

  // POST /courses/:courseId/sessions - Create a session in a course
  app.post(
    '/courses/:courseId/sessions',
    {
      preHandler: authenticate,
      schema: createSessionSchema,
    },
    async (request, reply) => {
      const course = await Course.findById(request.params.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const { name, description, quiz, practiceQuiz, quizStart, quizEnd, date } = request.body;
      const isPracticeQuiz = !!practiceQuiz;
      const isQuiz = isPracticeQuiz ? true : !!quiz;

      const session = await Session.create({
        name,
        description: description || '',
        courseId: course._id,
        status: 'hidden',
        quiz: isQuiz,
        practiceQuiz: isPracticeQuiz,
        quizStart: quizStart ? new Date(quizStart) : undefined,
        quizEnd: quizEnd ? new Date(quizEnd) : undefined,
        date: date ? new Date(date) : undefined,
      });

      await Course.findByIdAndUpdate(course._id, {
        $addToSet: { sessions: session._id },
      });

      return reply.code(201).send({ session: session.toObject() });
    }
  );

  // GET /courses/:courseId/sessions - List sessions for a course
  app.get(
    '/courses/:courseId/sessions',
    { preHandler: authenticate },
    async (request, reply) => {
      const course = await Course.findById(request.params.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      const isInstrOrAdmin = isInstructorOrAdmin(course, request.user);

      const filter = { courseId: course._id };
      if (!isInstrOrAdmin) {
        filter.status = { $ne: 'hidden' };
      }

      const sessions = await Session.find(filter).lean();

      return { sessions };
    }
  );

  // GET /sessions/:id - Get a single session
  app.get(
    '/sessions/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      const obj = session.toObject();

      // For students, hide certain fields if session is hidden
      if (!isInstructorOrAdmin(course, request.user) && session.status === 'hidden') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Session is not available' });
      }

      return { session: obj };
    }
  );

  // PATCH /sessions/:id - Update a session
  app.patch(
    '/sessions/:id',
    {
      preHandler: authenticate,
      schema: updateSessionSchema,
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const allowed = ['name', 'description', 'quiz', 'practiceQuiz', 'quizStart', 'quizEnd', 'reviewable', 'status', 'date', 'joinCodeEnabled', 'joinCodeInterval'];
      const updates = {};
      for (const key of allowed) {
        if (request.body[key] !== undefined) {
          updates[key] = request.body[key];
        }
      }

      // Practice quizzes are a subset of quizzes.
      if (updates.practiceQuiz === true) {
        updates.quiz = true;
      }
      if (updates.quiz === false) {
        updates.practiceQuiz = false;
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject() };
    }
  );

  // DELETE /sessions/:id - Delete a session
  app.delete(
    '/sessions/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      await Course.findByIdAndUpdate(course._id, {
        $pull: { sessions: session._id },
      });

      await Session.findByIdAndDelete(request.params.id);

      return { success: true };
    }
  );

  // POST /sessions/:id/start - Start (launch) a session
  app.post(
    '/sessions/:id/start',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const now = new Date();
      const updates = { status: 'running', date: now };
      if (session.questions.length > 0 && !session.currentQuestion) {
        updates.currentQuestion = session.questions[0];
      }
      // Activate join code if enabled
      if (session.joinCodeEnabled) {
        updates.joinCodeActive = true;
        updates.currentJoinCode = generateJoinCode();
        updates.joinCodeExpiresAt = new Date(now.getTime() + (session.joinCodeInterval || 10) * 1000);
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject() };
    }
  );

  // POST /sessions/:id/end - End a session
  app.post(
    '/sessions/:id/end',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: { status: 'done' } },
        { new: true }
      );

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject() };
    }
  );

  // PATCH /sessions/:id/current - Set current question in a live session
  app.patch(
    '/sessions/:id/current',
    {
      preHandler: authenticate,
      schema: setCurrentQuestionSchema,
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const { questionId } = request.body;
      if (!session.questions.includes(questionId)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Question not found in this session' });
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: { currentQuestion: questionId } },
        { new: true }
      );

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject() };
    }
  );

  // PATCH /sessions/:id/reviewable - Toggle reviewable
  app.patch(
    '/sessions/:id/reviewable',
    {
      preHandler: authenticate,
      schema: toggleReviewableSchema,
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: { reviewable: request.body.reviewable } },
        { new: true }
      );

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject() };
    }
  );

  // PATCH /sessions/:id/extensions - Set quiz extensions
  app.patch(
    '/sessions/:id/extensions',
    {
      preHandler: authenticate,
      schema: setExtensionsSchema,
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: { quizExtensions: request.body.extensions } },
        { new: true }
      );

      return { session: updated.toObject() };
    }
  );

  // POST /sessions/:id/copy - Copy a session
  app.post(
    '/sessions/:id/copy',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const newSession = await Session.create({
        name: session.name + ' (copy)',
        description: session.description,
        courseId: session.courseId,
        status: 'hidden',
        quiz: session.quiz,
        practiceQuiz: session.practiceQuiz,
        quizStart: session.quizStart,
        quizEnd: session.quizEnd,
        date: session.date,
        tags: session.tags,
        reviewable: session.reviewable,
        questions: [],
        joined: [],
        submittedQuiz: [],
        quizExtensions: [],
        currentQuestion: '',
      });

      await Course.findByIdAndUpdate(course._id, {
        $addToSet: { sessions: newSession._id },
      });

      const sourceQuestionIds = session.questions || [];
      if (sourceQuestionIds.length > 0) {
        const sourceQuestions = await Question.find({ _id: { $in: sourceQuestionIds } });
        const sourceQuestionsById = new Map(sourceQuestions.map((q) => [String(q._id), q]));
        const copiedQuestionIds = [];

        for (const sourceQuestionId of sourceQuestionIds) {
          const sourceQuestion = sourceQuestionsById.get(String(sourceQuestionId));
          if (!sourceQuestion) continue;

          const copiedQuestion = await copyQuestionToSession({
            sourceQuestion,
            targetSessionId: newSession._id,
            targetCourseId: course._id,
            userId: request.user.userId,
            addToSession: false,
          });

          copiedQuestionIds.push(copiedQuestion._id);
        }

        if (copiedQuestionIds.length > 0) {
          await Session.findByIdAndUpdate(newSession._id, {
            $set: { questions: copiedQuestionIds },
          });
        }
      }

      const copiedSession = await Session.findById(newSession._id);

      return reply.code(201).send({
        session: copiedSession ? copiedSession.toObject() : newSession.toObject(),
      });
    }
  );

  // GET /sessions/:id/review - Get session review data for a student
  app.get(
    '/sessions/:id/review',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      // Students can only review if the session is reviewable and done
      const isInstrOrAdmin = isInstructorOrAdmin(course, request.user);
      if (!isInstrOrAdmin) {
        if (!session.reviewable) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Session is not reviewable' });
        }
        if (session.status !== 'done') {
          return reply.code(403).send({ error: 'Forbidden', message: 'Session is not yet finished' });
        }
      }

      // Fetch questions in session order
      const questionIds = session.questions || [];
      const questions = await Question.find({ _id: { $in: questionIds } }).lean();

      // Maintain session question order
      const questionMap = {};
      for (const q of questions) {
        questionMap[String(q._id)] = q;
      }
      const orderedQuestions = questionIds
        .map((id) => questionMap[String(id)])
        .filter(Boolean);

      // Fetch this student's responses for these questions
      const responses = await Response.find({
        questionId: { $in: questionIds },
        studentUserId: request.user.userId,
      }).lean();

      // Group responses by questionId
      const responsesByQuestion = {};
      for (const r of responses) {
        if (!responsesByQuestion[r.questionId]) {
          responsesByQuestion[r.questionId] = [];
        }
        responsesByQuestion[r.questionId].push(r);
      }

      return {
        session: session.toObject(),
        questions: orderedQuestions,
        responses: responsesByQuestion,
      };
    }
  );

  // ─── Interactive Session Routes ──────────────────────────────────────────

  // POST /sessions/:id/join - Student joins a live session
  app.post(
    '/sessions/:id/join',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: {
            joinCode: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      if (session.status !== 'running') {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not live' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      const userId = request.user.userId;

      // Already joined — return success
      if (session.joined.includes(userId)) {
        return { success: true, alreadyJoined: true };
      }

      // Verify join code if active
      if (session.joinCodeActive) {
        const providedCode = String(request.body?.joinCode || '').trim();
        if (!providedCode) {
          return reply.code(400).send({ error: 'Bad Request', message: 'Join code is required' });
        }
        if (providedCode !== session.currentJoinCode) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Invalid join code' });
        }
      }

      const now = new Date();
      await Session.findByIdAndUpdate(request.params.id, {
        $addToSet: {
          joined: userId,
          joinRecords: { userId, joinedAt: now },
        },
      });

      notifySessionUpdated(app, course, request.params.id);

      return { success: true, alreadyJoined: false };
    }
  );

  // GET /sessions/:id/live - Get live session data
  app.get(
    '/sessions/:id/live',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id).lean();
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      const isInstrOrAdmin = isInstructorOrAdmin(course, request.user);
      const userId = request.user.userId;
      const isJoined = session.joined.includes(userId);

      // Fetch current question
      let currentQuestion = null;
      if (session.currentQuestion) {
        currentQuestion = await Question.findById(session.currentQuestion).lean();
      }

      // For students: strip answer info and limit data
      const questionHidden = currentQuestion?.sessionOptions?.hidden ?? true;
      const showStats = currentQuestion?.sessionOptions?.stats ?? false;
      const showCorrect = currentQuestion?.sessionOptions?.correct ?? false;
      const attempts = currentQuestion?.sessionOptions?.attempts || [];
      const currentAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : { number: 1, closed: false };

      let responseStats = null;
      let studentResponse = null;
      let allResponses = null;
      const questionId = currentQuestion?._id;

      if (questionId) {
        if (isInstrOrAdmin) {
          // Prof gets all responses for current question & attempt
          const responses = await Response.find({
            questionId,
            attempt: currentAttempt.number,
          }).lean();
          allResponses = responses;
          responseStats = buildResponseStats(currentQuestion, responses);
        } else if (isJoined && !questionHidden) {
          // Student gets their own response
          studentResponse = await Response.findOne({
            questionId,
            studentUserId: userId,
            attempt: currentAttempt.number,
          }).lean();

          // Provide stats if showStats is enabled
          if (showStats) {
            const responses = await Response.find({
              questionId,
              attempt: currentAttempt.number,
            }).lean();
            responseStats = buildResponseStats(currentQuestion, responses);
          }
        }
      }

      // Build response
      const result = {
        session: {
          _id: session._id,
          name: session.name,
          description: session.description,
          courseId: session.courseId,
          status: session.status,
          questions: session.questions,
          currentQuestion: session.currentQuestion,
          joinedCount: session.joined.length,
          joinCodeActive: session.joinCodeActive,
          reviewable: session.reviewable,
        },
        currentQuestion: null,
        currentAttempt,
        responseStats,
        responseCount: allResponses ? allResponses.length : 0,
      };

      if (isInstrOrAdmin) {
        result.session.joined = session.joined;
        result.session.joinRecords = session.joinRecords;
        result.session.joinCodeEnabled = session.joinCodeEnabled;
        result.session.joinCodeInterval = session.joinCodeInterval;
        result.session.currentJoinCode = session.currentJoinCode;
        result.allResponses = allResponses;

        if (currentQuestion) {
          result.currentQuestion = currentQuestion;
        }
      } else {
        // Student view
        if (isJoined && currentQuestion && !questionHidden) {
          // Strip correct answer info unless showCorrect is enabled
          const studentQ = { ...currentQuestion };
          if (!showCorrect) {
            if (studentQ.options) {
              studentQ.options = studentQ.options.map((opt) => ({
                ...opt,
                correct: undefined,
              }));
            }
            delete studentQ.correctNumerical;
            delete studentQ.toleranceNumerical;
            delete studentQ.solution;
            delete studentQ.solution_plainText;
          }
          result.currentQuestion = studentQ;
        }
        result.studentResponse = studentResponse;
        result.isJoined = isJoined;
        result.showStats = showStats;
        result.showCorrect = showCorrect;
        result.questionHidden = questionHidden;
      }

      return result;
    }
  );

  // POST /sessions/:id/respond - Submit a response
  app.post(
    '/sessions/:id/respond',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['answer'],
          properties: {
            answer: {},
            answerWysiwyg: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      if (session.status !== 'running') {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not live' });
      }

      const userId = request.user.userId;
      if (!session.joined.includes(userId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'You have not joined this session' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      const questionId = session.currentQuestion;
      if (!questionId) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No current question' });
      }

      const question = await Question.findById(questionId);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      // Check if question is hidden
      if (question.sessionOptions?.hidden) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Question is not visible' });
      }

      // Get current attempt
      const attempts = question.sessionOptions?.attempts || [];
      const currentAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : { number: 1, closed: false };

      if (currentAttempt.closed) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Responses are closed for this attempt' });
      }

      // Check if student already responded to this attempt
      const existingResponse = await Response.findOne({
        questionId,
        studentUserId: userId,
        attempt: currentAttempt.number,
      });

      if (existingResponse) {
        return reply.code(409).send({ error: 'Conflict', message: 'You have already responded to this attempt' });
      }

      const response = await Response.create({
        questionId,
        studentUserId: userId,
        attempt: currentAttempt.number,
        answer: request.body.answer,
        answerWysiwyg: request.body.answerWysiwyg || '',
      });

      // Notify prof of new response
      notifySessionUpdated(app, course, session._id);

      return reply.code(201).send({ response: response.toObject() });
    }
  );

  // PATCH /sessions/:id/question-visibility - Toggle question visibility/stats/correct
  app.patch(
    '/sessions/:id/question-visibility',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: {
            hidden: { type: 'boolean' },
            stats: { type: 'boolean' },
            correct: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const questionId = session.currentQuestion;
      if (!questionId) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No current question' });
      }

      const updates = {};
      if (request.body.hidden !== undefined) updates['sessionOptions.hidden'] = request.body.hidden;
      if (request.body.stats !== undefined) updates['sessionOptions.stats'] = request.body.stats;
      if (request.body.correct !== undefined) updates['sessionOptions.correct'] = request.body.correct;

      const updatedQuestion = await Question.findByIdAndUpdate(
        questionId,
        { $set: updates },
        { new: true }
      );

      notifySessionUpdated(app, course, session._id);

      return { question: updatedQuestion?.toObject() };
    }
  );

  // POST /sessions/:id/new-attempt - Start a new attempt for current question
  app.post(
    '/sessions/:id/new-attempt',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const questionId = session.currentQuestion;
      if (!questionId) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No current question' });
      }

      const question = await Question.findById(questionId);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      const attempts = question.sessionOptions?.attempts || [];
      // Close current attempt
      const closedAttempts = attempts.map((a) => ({ ...a.toObject ? a.toObject() : a, closed: true }));
      const newAttemptNumber = (attempts.length > 0 ? Math.max(...attempts.map((a) => a.number)) : 0) + 1;
      closedAttempts.push({ number: newAttemptNumber, closed: false });

      const updatedQuestion = await Question.findByIdAndUpdate(
        questionId,
        { $set: { 'sessionOptions.attempts': closedAttempts } },
        { new: true }
      );

      notifySessionUpdated(app, course, session._id);

      return { question: updatedQuestion?.toObject(), attemptNumber: newAttemptNumber };
    }
  );

  // PATCH /sessions/:id/toggle-responses - Toggle allowing responses
  app.patch(
    '/sessions/:id/toggle-responses',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['closed'],
          properties: {
            closed: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const questionId = session.currentQuestion;
      if (!questionId) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No current question' });
      }

      const question = await Question.findById(questionId);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      const attempts = question.sessionOptions?.attempts || [];
      if (attempts.length === 0) {
        // Initialize with first attempt
        const updatedQuestion = await Question.findByIdAndUpdate(
          questionId,
          { $set: { 'sessionOptions.attempts': [{ number: 1, closed: request.body.closed }] } },
          { new: true }
        );
        notifySessionUpdated(app, course, session._id);
        return { question: updatedQuestion?.toObject() };
      }

      // Update the last attempt's closed status
      const updated = attempts.map((a, i) => {
        const obj = a.toObject ? a.toObject() : { ...a };
        if (i === attempts.length - 1) obj.closed = request.body.closed;
        return obj;
      });

      const updatedQuestion = await Question.findByIdAndUpdate(
        questionId,
        { $set: { 'sessionOptions.attempts': updated } },
        { new: true }
      );

      notifySessionUpdated(app, course, session._id);

      return { question: updatedQuestion?.toObject() };
    }
  );

  // POST /sessions/:id/refresh-join-code - Generate a new join code
  app.post(
    '/sessions/:id/refresh-join-code',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const now = new Date();
      const code = generateJoinCode();
      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        {
          $set: {
            currentJoinCode: code,
            joinCodeExpiresAt: new Date(now.getTime() + (session.joinCodeInterval || 10) * 1000),
          },
        },
        { new: true }
      );

      notifySessionUpdated(app, course, session._id);

      return { joinCode: code, expiresAt: updated.joinCodeExpiresAt };
    }
  );

  // PATCH /sessions/:id/join-code-settings - Update join code settings
  app.patch(
    '/sessions/:id/join-code-settings',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: {
            joinCodeEnabled: { type: 'boolean' },
            joinCodeActive: { type: 'boolean' },
            joinCodeInterval: { type: 'number', minimum: 5, maximum: 120 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updates = {};
      if (request.body.joinCodeEnabled !== undefined) updates.joinCodeEnabled = request.body.joinCodeEnabled;
      if (request.body.joinCodeInterval !== undefined) updates.joinCodeInterval = request.body.joinCodeInterval;

      if (request.body.joinCodeActive !== undefined) {
        updates.joinCodeActive = request.body.joinCodeActive;
        if (request.body.joinCodeActive) {
          const now = new Date();
          updates.currentJoinCode = generateJoinCode();
          updates.joinCodeExpiresAt = new Date(now.getTime() + (request.body.joinCodeInterval || session.joinCodeInterval || 10) * 1000);
        } else {
          updates.currentJoinCode = '';
        }
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

      notifySessionUpdated(app, course, session._id);

      return { session: updated.toObject() };
    }
  );

  // GET /sessions/:id/results - Get full session results (prof only) for review/CSV
  app.get(
    '/sessions/:id/results',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.id).lean();
      if (!session) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(session.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      // Fetch questions
      const questionIds = session.questions || [];
      const questions = await Question.find({ _id: { $in: questionIds } }).lean();
      const questionMap = {};
      for (const q of questions) {
        questionMap[String(q._id)] = q;
      }
      const orderedQuestions = questionIds.map((id) => questionMap[String(id)]).filter(Boolean);

      // Fetch all responses for this session's questions
      const allResponses = await Response.find({
        questionId: { $in: questionIds },
      }).lean();

      // Fetch all joined students
      const joinedUserIds = session.joined || [];
      const students = await User.find({ _id: { $in: joinedUserIds } }).lean();
      const studentMap = {};
      for (const s of students) {
        studentMap[String(s._id)] = s;
      }

      // Build per-student results
      const studentResults = joinedUserIds.map((studentId) => {
        const student = studentMap[String(studentId)];
        const firstname = student?.profile?.firstname || '';
        const lastname = student?.profile?.lastname || '';
        const email = student?.emails?.[0]?.address || student?.email || '';

        const questionResults = orderedQuestions.map((q) => {
          const responses = allResponses.filter(
            (r) => String(r.questionId) === String(q._id) && String(r.studentUserId) === String(studentId)
          );
          return {
            questionId: q._id,
            responses: responses.sort((a, b) => a.attempt - b.attempt),
          };
        });

        // Calculate participation
        const questionsWithPoints = orderedQuestions.filter(
          (q) => (q.sessionOptions?.points || 0) > 0
        );
        const answeredCount = questionsWithPoints.filter((q) =>
          allResponses.some(
            (r) => String(r.questionId) === String(q._id) && String(r.studentUserId) === String(studentId)
          )
        ).length;
        const participation = questionsWithPoints.length > 0
          ? Math.round(1000 * answeredCount / questionsWithPoints.length) / 10
          : 100;

        return {
          studentId,
          firstname,
          lastname,
          email,
          participation,
          questionResults,
        };
      });

      return {
        session,
        questions: orderedQuestions,
        studentResults,
      };
    }
  );
}
