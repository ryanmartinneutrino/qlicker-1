import Question from '../models/Question.js';
import Session from '../models/Session.js';
import Course from '../models/Course.js';
import Response from '../models/Response.js';
import { copyQuestionToSession } from '../services/questionCopy.js';
import { isQuestionResponseCollectionEnabled } from '../services/grading.js';

const createQuestionSchema = {
  body: {
    type: 'object',
    required: ['type'],
    properties: {
      // Canonical mapping: MC=0 (single correct), TF=1, SA=2, MS=3 (multi-correct), NU=4, Slide=6.
      type: { type: 'integer', minimum: 0, maximum: 6 },
      content: { type: 'string' },
      plainText: { type: 'string' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            wysiwyg: { type: 'boolean' },
            correct: { type: 'boolean' },
            answer: { type: 'string' },
            content: { type: 'string' },
            plainText: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      toleranceNumerical: { type: 'number' },
      correctNumerical: { type: 'number' },
      sessionId: { type: 'string' },
      courseId: { type: 'string' },
      solution: { type: 'string' },
      solution_plainText: { type: 'string' },
      public: { type: 'boolean' },
      sessionOptions: {
        type: 'object',
        properties: {
          hidden: { type: 'boolean' },
          stats: { type: 'boolean' },
          correct: { type: 'boolean' },
          points: { type: 'number' },
          maxAttempts: { type: 'number' },
          attemptWeights: { type: 'array', items: { type: 'number' } },
          attempts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'number' },
                closed: { type: 'boolean' },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            label: { type: 'string' },
            className: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      imagePath: { type: 'string' },
    },
    additionalProperties: false,
  },
};

const updateQuestionSchema = {
  body: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      plainText: { type: 'string' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            wysiwyg: { type: 'boolean' },
            correct: { type: 'boolean' },
            answer: { type: 'string' },
            content: { type: 'string' },
            plainText: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      // Canonical mapping: MC=0 (single correct), TF=1, SA=2, MS=3 (multi-correct), NU=4, Slide=6.
      type: { type: 'integer', minimum: 0, maximum: 6 },
      toleranceNumerical: { type: 'number' },
      correctNumerical: { type: 'number' },
      solution: { type: 'string' },
      solution_plainText: { type: 'string' },
      public: { type: 'boolean' },
      approved: { type: 'boolean' },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            label: { type: 'string' },
            className: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      imagePath: { type: 'string' },
      sessionOptions: {
        type: 'object',
        properties: {
          hidden: { type: 'boolean' },
          stats: { type: 'boolean' },
          correct: { type: 'boolean' },
          points: { type: 'number' },
          maxAttempts: { type: 'number' },
          attemptWeights: { type: 'array', items: { type: 'number' } },
          attempts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'number' },
                closed: { type: 'boolean' },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
};

const copyToSessionSchema = {
  body: {
    type: 'object',
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

const addQuestionToSessionSchema = {
  body: {
    type: 'object',
    required: ['questionId'],
    properties: {
      questionId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

const reorderQuestionsSchema = {
  body: {
    type: 'object',
    required: ['questions'],
    properties: {
      questions: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
};

const attemptStatusSchema = {
  body: {
    type: 'object',
    required: ['attemptNumber', 'closed'],
    properties: {
      attemptNumber: { type: 'integer', minimum: 1 },
      closed: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

const visibilitySchema = {
  body: {
    type: 'object',
    required: ['hidden'],
    properties: {
      hidden: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

const statsSchema = {
  body: {
    type: 'object',
    required: ['stats'],
    properties: {
      stats: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

const correctSchema = {
  body: {
    type: 'object',
    required: ['correct'],
    properties: {
      correct: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

const QUESTION_TYPE_MULTIPLE_CHOICE = 0;

function countCorrectOptions(options = []) {
  if (!Array.isArray(options)) return 0;
  return options.reduce((count, option) => (option?.correct ? count + 1 : count), 0);
}

function multipleChoiceValidationError(type, options) {
  if (Number(type) !== QUESTION_TYPE_MULTIPLE_CHOICE) return null;
  if (countCorrectOptions(options) <= 1) return null;
  return {
    error: 'Bad Request',
    message: 'Multiple Choice questions can only have one correct option',
  };
}

// Helper to check if user is instructor of course or admin
function isInstructorOrAdmin(course, user) {
  const roles = user.roles || [];
  return roles.includes('admin') || course.instructors.includes(user.userId);
}

function sendToCourseMembers(app, course, event, payload) {
  if (typeof app.wsSendToUsers !== 'function') return;
  if (!course) return;
  const memberIds = [...new Set([
    ...(course.instructors || []),
    ...(course.students || []),
  ].map((userId) => String(userId)).filter(Boolean))];
  if (memberIds.length === 0) return;
  app.wsSendToUsers(memberIds, event, payload);
}

function sendToInstructors(app, course, event, payload) {
  if (typeof app.wsSendToUsers !== 'function') return;
  if (!course) return;
  const instructorIds = [...new Set(
    (course.instructors || []).map((userId) => String(userId)).filter(Boolean)
  )];
  if (instructorIds.length === 0) return;
  app.wsSendToUsers(instructorIds, event, payload);
}

function sendToStudents(app, course, event, payload) {
  if (typeof app.wsSendToUsers !== 'function') return;
  if (!course) return;
  const studentIds = [...new Set(
    (course.students || []).map((userId) => String(userId)).filter(Boolean)
  )];
  if (studentIds.length === 0) return;
  app.wsSendToUsers(studentIds, event, payload);
}

function toQuestionPayload(question) {
  if (!question) return null;
  return typeof question.toObject === 'function'
    ? question.toObject()
    : { ...question };
}

function stripAnswerRevealFields(questionPayload, { revealCorrectAnswers = false } = {}) {
  if (!questionPayload) return null;
  if (revealCorrectAnswers) return questionPayload;

  const sanitized = { ...questionPayload };
  if (Array.isArray(sanitized.options)) {
    sanitized.options = sanitized.options.map((option) => ({
      ...option,
      correct: undefined,
    }));
  }
  delete sanitized.correctNumerical;
  delete sanitized.solution;
  delete sanitized.solution_plainText;
  delete sanitized.solutionText;
  delete sanitized.solutionPlainText;
  delete sanitized.solutionHtml;
  return sanitized;
}

function buildStudentQuestionUpdate(question) {
  const questionPayload = toQuestionPayload(question);
  if (!questionPayload) {
    return {
      question: null,
      questionHidden: false,
      showStats: false,
      showCorrect: false,
    };
  }

  const questionHidden = !!questionPayload?.sessionOptions?.hidden;
  const collectsResponses = isQuestionResponseCollectionEnabled(questionPayload);
  const showStats = collectsResponses ? !!questionPayload?.sessionOptions?.stats : false;
  const showCorrect = collectsResponses ? !!questionPayload?.sessionOptions?.correct : false;

  return {
    question: questionHidden
      ? null
      : stripAnswerRevealFields(questionPayload, { revealCorrectAnswers: showCorrect }),
    questionHidden,
    showStats,
    showCorrect,
  };
}

async function getLinkedSessionsForQuestion(question) {
  const linkedSessions = [];
  const seenSessionIds = new Set();

  const addSession = (session) => {
    const sessionId = String(session?._id || '').trim();
    if (!sessionId || seenSessionIds.has(sessionId)) return;
    seenSessionIds.add(sessionId);
    linkedSessions.push({
      _id: sessionId,
      courseId: String(session?.courseId || '').trim(),
      currentQuestion: String(session?.currentQuestion || '').trim(),
    });
  };

  if (question?.sessionId) {
    const session = await Session.findById(question.sessionId)
      .select('_id courseId currentQuestion')
      .lean();
    if (session) addSession(session);
  }

  const normalizedQuestionId = String(question?._id || '').trim();
  if (normalizedQuestionId) {
    const sessions = await Session.find({ questions: normalizedQuestionId })
      .select('_id courseId currentQuestion')
      .lean();
    sessions.forEach(addSession);
  }

  return linkedSessions;
}

async function userCanManageQuestion(question, user) {
  if (!question || !user) return false;
  const roles = user.roles || [];
  if (roles.includes('admin')) return true;
  if (question.creator === user.userId || question.owner === user.userId) return true;

  const candidateCourseIds = [
    question.courseId,
  ]
    .map((courseId) => String(courseId || '').trim())
    .filter(Boolean);

  for (const courseId of candidateCourseIds) {
    const course = await Course.findById(courseId);
    if (course && course.instructors.includes(user.userId)) {
      return true;
    }
  }

  const linkedSessionCourseIds = new Set(
    (await getLinkedSessionsForQuestion(question))
      .map((session) => String(session?.courseId || '').trim())
      .filter(Boolean)
  );

  for (const sessionCourseId of linkedSessionCourseIds) {
    if (!candidateCourseIds.includes(sessionCourseId)) {
      const sessionCourse = await Course.findById(sessionCourseId);
      if (sessionCourse && sessionCourse.instructors.includes(user.userId)) {
        return true;
      }
    }
  }

  return false;
}

async function notifyLinkedSessionQuestionUpdated(app, question) {
  const linkedSessions = await getLinkedSessionsForQuestion(question);
  if (linkedSessions.length === 0) return;

  const courseIds = [...new Set(
    linkedSessions
      .map((session) => String(session.courseId || '').trim())
      .filter(Boolean)
  )];
  if (courseIds.length === 0) return;

  const courses = await Course.find({ _id: { $in: courseIds } }).lean();
  const courseById = new Map(
    courses.map((course) => [String(course._id), course])
  );
  const questionId = String(question?._id || '').trim();
  const instructorQuestionPayload = toQuestionPayload(question);
  const studentQuestionUpdate = buildStudentQuestionUpdate(question);

  linkedSessions.forEach((session) => {
    const course = courseById.get(String(session.courseId || ''));
    if (!course) return;

    const payload = {
      courseId: String(course._id),
      sessionId: String(session._id),
      questionId,
    };
    const includeQuestionPayload = String(session.currentQuestion || '') === questionId;

    sendToInstructors(
      app,
      course,
      'session:question-updated',
      includeQuestionPayload
        ? { ...payload, question: instructorQuestionPayload }
        : payload
    );
    sendToStudents(
      app,
      course,
      'session:question-updated',
      includeQuestionPayload
        ? { ...payload, ...studentQuestionUpdate }
        : payload
    );
  });
}

export default async function questionRoutes(app) {
  const { authenticate, requireRole } = app;

  // POST /questions - Create a question
  app.post(
    '/questions',
    {
      preHandler: requireRole(['professor', 'admin']),
      schema: createQuestionSchema,
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const {
        type, content, plainText, options, toleranceNumerical, correctNumerical,
        sessionId, courseId, solution, solution_plainText, sessionOptions, tags, imagePath,
      } = request.body;

      const createValidationError = multipleChoiceValidationError(type, options);
      if (createValidationError) {
        return reply.code(400).send(createValidationError);
      }

      const questionData = {
        type,
        content: content || '',
        plainText: plainText || '',
        options: options || [],
        creator: userId,
        owner: userId,
        sessionId: sessionId || '',
        courseId: courseId || '',
        solution: solution || '',
        solution_plainText: solution_plainText || '',
        sessionOptions,
        public: request.body.public || false,
        tags: tags || [],
        imagePath: imagePath || '',
      };

      if (toleranceNumerical !== undefined) questionData.toleranceNumerical = toleranceNumerical;
      if (correctNumerical !== undefined) questionData.correctNumerical = correctNumerical;

      const question = await Question.create(questionData);

      return reply.code(201).send({ question: question.toObject() });
    }
  );

  // GET /questions/:id - Get a single question
  app.get(
    '/questions/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      return { question: question.toObject() };
    }
  );

  // PATCH /questions/:id - Update a question
  app.patch(
    '/questions/:id',
    {
      preHandler: authenticate,
      schema: updateQuestionSchema,
    },
    async (request, reply) => {
      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      const hasPermission = await userCanManageQuestion(question, request.user);
      if (!hasPermission) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const requestedType = request.body.type;
      if (requestedType !== undefined && Number(requestedType) !== Number(question.type)) {
        const hasResponses = await Response.exists({ questionId: String(question._id) });
        if (hasResponses) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'Question type cannot be changed because this question has response data',
          });
        }
      }

      const hasResponses = await Response.exists({ questionId: String(question._id) });
      if (hasResponses && request.body.options !== undefined) {
        const currentOptionCount = Array.isArray(question.options) ? question.options.length : 0;
        const nextOptionCount = Array.isArray(request.body.options) ? request.body.options.length : 0;
        if (nextOptionCount !== currentOptionCount) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'Question options cannot be added or removed because this question has response data',
          });
        }
      }

      const nextType = request.body.type !== undefined ? request.body.type : question.type;
      const nextOptions = request.body.options !== undefined ? request.body.options : question.options;
      const updateValidationError = multipleChoiceValidationError(nextType, nextOptions);
      if (updateValidationError) {
        return reply.code(400).send(updateValidationError);
      }

      const allowed = [
        'content', 'plainText', 'options', 'type', 'toleranceNumerical', 'correctNumerical',
        'solution', 'solution_plainText', 'public', 'approved', 'tags', 'imagePath', 'sessionOptions',
      ];
      const updates = {};
      for (const key of allowed) {
        if (request.body[key] !== undefined) {
          updates[key] = request.body[key];
        }
      }

      const updated = await Question.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

      await notifyLinkedSessionQuestionUpdated(app, updated || question);

      return { question: updated.toObject() };
    }
  );

  // DELETE /questions/:id - Delete a question
  app.delete(
    '/questions/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      if (!isAdmin && question.creator !== userId) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the creator or an admin can delete this question' });
      }

      const hasResponses = await Response.exists({ questionId: String(question._id) });
      if (hasResponses) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Questions with response data cannot be deleted',
        });
      }

      // Remove from session if linked
      if (question.sessionId) {
        await Session.findByIdAndUpdate(question.sessionId, {
          $pull: { questions: question._id },
        });
      }

      await Question.findByIdAndDelete(request.params.id);

      return { success: true };
    }
  );

  // POST /questions/:id/copy - Copy question to personal library
  app.post(
    '/questions/:id/copy',
    { preHandler: authenticate },
    async (request, reply) => {
      const userId = request.user.userId;

      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      const obj = question.toObject();
      delete obj._id;
      delete obj.__v;
      delete obj.updatedAt;

      const copy = await Question.create({
        ...obj,
        creator: userId,
        owner: userId,
        sessionId: '',
        courseId: '',
        originalQuestion: question._id,
        createdAt: new Date(),
      });

      return reply.code(201).send({ question: copy.toObject() });
    }
  );

  // POST /questions/:id/copy-to-session - Copy question to a session
  app.post(
    '/questions/:id/copy-to-session',
    {
      preHandler: authenticate,
      schema: copyToSessionSchema,
    },
    async (request, reply) => {
      const userId = request.user.userId;

      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      const session = await Session.findById(request.body.sessionId);
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

      const copy = await copyQuestionToSession({
        sourceQuestion: question,
        targetSessionId: session._id,
        targetCourseId: course._id,
        userId,
      });

      return reply.code(201).send({ question: copy.toObject() });
    }
  );

  // POST /sessions/:sessionId/questions - Add existing question to session
  app.post(
    '/sessions/:sessionId/questions',
    {
      preHandler: authenticate,
      schema: addQuestionToSessionSchema,
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.sessionId);
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

      if (session.questions.includes(questionId)) {
        return { session: session.toObject() };
      }

      const question = await Question.findById(questionId).lean();
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }
      const nextQuestionIds = [...(session.questions || []), String(questionId)];

      const updated = await Session.findByIdAndUpdate(
        session._id,
        { $set: { questions: nextQuestionIds } },
        { new: true }
      );

      return { session: updated.toObject() };
    }
  );

  // DELETE /sessions/:sessionId/questions/:questionId - Remove question from session
  app.delete(
    '/sessions/:sessionId/questions/:questionId',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = await Session.findById(request.params.sessionId);
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

      const hasResponses = await Response.exists({ questionId: String(request.params.questionId) });
      if (hasResponses) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Questions with response data cannot be removed from this session',
        });
      }

      const updated = await Session.findByIdAndUpdate(
        session._id,
        { $pull: { questions: request.params.questionId } },
        { new: true }
      );

      return { session: updated.toObject() };
    }
  );

  // PATCH /sessions/:sessionId/questions/order - Reorder questions in session
  app.patch(
    '/sessions/:sessionId/questions/order',
    {
      preHandler: authenticate,
      schema: reorderQuestionsSchema,
    },
    async (request, reply) => {
      const session = await Session.findById(request.params.sessionId);
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

      const newOrder = request.body.questions;

      const updated = await Session.findByIdAndUpdate(
        session._id,
        { $set: { questions: newOrder } },
        { new: true }
      );

      return { session: updated.toObject() };
    }
  );

  // POST /questions/:id/attempt - Start new attempt on question
  app.post(
    '/questions/:id/attempt',
    { preHandler: authenticate },
    async (request, reply) => {
      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      // Must be instructor of question's course or admin
      if (question.courseId) {
        const course = await Course.findById(question.courseId);
        if (!course) {
          return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
        }
        if (!isInstructorOrAdmin(course, request.user)) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
        }
      } else {
        const roles = request.user.roles || [];
        if (!roles.includes('admin')) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
        }
      }

      const attempts = question.sessionOptions?.attempts || [];
      const nextNumber = attempts.length > 0
        ? Math.max(...attempts.map(a => a.number)) + 1
        : 1;

      const updated = await Question.findByIdAndUpdate(
        request.params.id,
        { $push: { 'sessionOptions.attempts': { number: nextNumber, closed: false } } },
        { new: true }
      );

      return { question: updated.toObject() };
    }
  );

  // PATCH /questions/:id/attempt-status - Open/close an attempt
  app.patch(
    '/questions/:id/attempt-status',
    {
      preHandler: authenticate,
      schema: attemptStatusSchema,
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      let hasPermission = isAdmin;
      if (!hasPermission && question.courseId) {
        const course = await Course.findById(question.courseId);
        if (course && course.instructors.includes(userId)) {
          hasPermission = true;
        }
      }

      if (!hasPermission) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const { attemptNumber, closed } = request.body;

      const updated = await Question.findOneAndUpdate(
        { _id: request.params.id, 'sessionOptions.attempts.number': attemptNumber },
        { $set: { 'sessionOptions.attempts.$.closed': closed } },
        { new: true }
      );

      if (!updated) {
        return reply.code(404).send({ error: 'Not Found', message: 'Attempt not found' });
      }

      return { question: updated.toObject() };
    }
  );

  // PATCH /questions/:id/visibility - Toggle question visibility
  app.patch(
    '/questions/:id/visibility',
    {
      preHandler: authenticate,
      schema: visibilitySchema,
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      let hasPermission = isAdmin;
      if (!hasPermission && question.courseId) {
        const course = await Course.findById(question.courseId);
        if (course && course.instructors.includes(userId)) {
          hasPermission = true;
        }
      }

      if (!hasPermission) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updated = await Question.findByIdAndUpdate(
        request.params.id,
        { $set: { 'sessionOptions.hidden': request.body.hidden } },
        { new: true }
      );

      return { question: updated.toObject() };
    }
  );

  // PATCH /questions/:id/stats - Show/hide stats
  app.patch(
    '/questions/:id/stats',
    {
      preHandler: authenticate,
      schema: statsSchema,
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      let hasPermission = isAdmin;
      if (!hasPermission && question.courseId) {
        const course = await Course.findById(question.courseId);
        if (course && course.instructors.includes(userId)) {
          hasPermission = true;
        }
      }

      if (!hasPermission) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updated = await Question.findByIdAndUpdate(
        request.params.id,
        { $set: { 'sessionOptions.stats': request.body.stats } },
        { new: true }
      );

      return { question: updated.toObject() };
    }
  );

  // PATCH /questions/:id/correct - Show/hide correct answer
  app.patch(
    '/questions/:id/correct',
    {
      preHandler: authenticate,
      schema: correctSchema,
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const question = await Question.findById(request.params.id);
      if (!question) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      let hasPermission = isAdmin;
      if (!hasPermission && question.courseId) {
        const course = await Course.findById(question.courseId);
        if (course && course.instructors.includes(userId)) {
          hasPermission = true;
        }
      }

      if (!hasPermission) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updated = await Question.findByIdAndUpdate(
        request.params.id,
        { $set: { 'sessionOptions.correct': request.body.correct } },
        { new: true }
      );

      return { question: updated.toObject() };
    }
  );
}
