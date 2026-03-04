import Session from '../models/Session.js';
import Course from '../models/Course.js';
import Question from '../models/Question.js';
import Response from '../models/Response.js';

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

      const session = await Session.create({
        name,
        description: description || '',
        courseId: course._id,
        status: 'hidden',
        quiz: quiz || false,
        practiceQuiz: practiceQuiz || false,
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

      const allowed = ['name', 'description', 'quiz', 'practiceQuiz', 'quizStart', 'quizEnd', 'reviewable', 'status', 'date'];
      const updates = {};
      for (const key of allowed) {
        if (request.body[key] !== undefined) {
          updates[key] = request.body[key];
        }
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

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

  // POST /sessions/:id/start - Start a session
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

      const updates = { status: 'running' };
      if (session.questions.length > 0 && !session.currentQuestion) {
        updates.currentQuestion = session.questions[0];
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

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

      return reply.code(201).send({ session: newSession.toObject() });
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
}
