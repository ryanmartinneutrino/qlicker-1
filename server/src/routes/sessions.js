import crypto from 'crypto';
import Session from '../models/Session.js';
import Course from '../models/Course.js';
import Question from '../models/Question.js';
import Response from '../models/Response.js';
import User from '../models/User.js';
import { copyQuestionToSession } from '../services/questionCopy.js';
import {
  recalculateSessionGrades,
  setSessionGradesVisibility,
} from '../services/grading.js';

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
      msScoringMethod: { type: 'string', enum: ['right-minus-wrong', 'all-or-nothing', 'correctness-ratio'] },
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
      msScoringMethod: { type: 'string', enum: ['right-minus-wrong', 'all-or-nothing', 'correctness-ratio'] },
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

const saveQuizResponseSchema = {
  body: {
    type: 'object',
    required: ['questionId', 'answer'],
    properties: {
      questionId: { type: 'string', minLength: 1 },
      answer: {},
      answerWysiwyg: { type: 'string' },
    },
    additionalProperties: false,
  },
};

const submitQuizQuestionSchema = {
  body: {
    type: 'object',
    required: ['questionId'],
    properties: {
      questionId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

// Generate a 6-digit numeric join code
function generateJoinCode() {
  return String(crypto.randomInt(100000, 999999));
}

function getParticipationQuestionPoints(question) {
  // Meteor behavior: default to 1 point per question, except SA defaults to 0 unless explicitly set.
  let points = Number(question?.type) === 2 ? 0 : 1;
  if (question?.sessionOptions && Object.prototype.hasOwnProperty.call(question.sessionOptions, 'points')) {
    points = Number(question.sessionOptions.points) || 0;
  }
  return points;
}

function optionDisplayContent(option, index) {
  return option?.content || option?.plainText || option?.answer || `Option ${index + 1}`;
}

function normalizeAnswerValue(answer) {
  if (answer === null || answer === undefined) return '';
  return String(answer).trim();
}

function parseBooleanLike(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return false;
}

function normalizeComparableText(answer) {
  return normalizeAnswerValue(answer)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toPlainText(value) {
  return normalizeAnswerValue(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getResponseStudentId(response) {
  return normalizeAnswerValue(
    response?.studentUserId || response?.userId || response?.studentId
  );
}

function parseBooleanQuery(value) {
  if (typeof value === 'boolean') return value;
  const normalized = normalizeAnswerValue(value).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function toDateOrNull(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isQuizLikeSession(session) {
  return !!(session?.quiz || session?.practiceQuiz);
}

function getQuizWindowValidationMessage(session, updates = {}) {
  const hasQuiz = Object.prototype.hasOwnProperty.call(updates, 'quiz');
  const hasPracticeQuiz = Object.prototype.hasOwnProperty.call(updates, 'practiceQuiz');
  const hasQuizStart = Object.prototype.hasOwnProperty.call(updates, 'quizStart');
  const hasQuizEnd = Object.prototype.hasOwnProperty.call(updates, 'quizEnd');

  const nextQuiz = hasQuiz ? !!updates.quiz : !!session?.quiz;
  const nextPracticeQuiz = hasPracticeQuiz ? !!updates.practiceQuiz : !!session?.practiceQuiz;
  if (!nextQuiz && !nextPracticeQuiz) return null;

  const nextQuizStart = hasQuizStart ? updates.quizStart : session?.quizStart;
  const nextQuizEnd = hasQuizEnd ? updates.quizEnd : session?.quizEnd;
  const quizStart = toDateOrNull(nextQuizStart);
  const quizEnd = toDateOrNull(nextQuizEnd);
  if (quizStart && quizEnd && quizEnd.getTime() <= quizStart.getTime()) {
    return 'Quiz end time must be later than quiz start time';
  }

  return null;
}

function normalizeQuizExtension(extension, session) {
  const userId = normalizeAnswerValue(extension?.userId);
  if (!userId) return null;

  const fallbackStart = toDateOrNull(session?.quizStart);
  const fallbackEnd = toDateOrNull(session?.quizEnd);
  const quizStart = toDateOrNull(extension?.quizStart) || fallbackStart;
  const quizEnd = toDateOrNull(extension?.quizEnd) || fallbackEnd;
  if (!quizStart || !quizEnd) return null;
  if (quizEnd.getTime() <= quizStart.getTime()) return null;

  return { userId, quizStart, quizEnd };
}

function getNormalizedQuizExtensions(session) {
  if (!Array.isArray(session?.quizExtensions)) return [];
  return session.quizExtensions
    .map((extension) => normalizeQuizExtension(extension, session))
    .filter(Boolean);
}

function getLatestQuizWindowEndMs(session, normalizedExtensions = null) {
  const extensions = normalizedExtensions || getNormalizedQuizExtensions(session);
  let latestEndMs = Number.NEGATIVE_INFINITY;

  const quizEnd = toDateOrNull(session?.quizEnd);
  if (quizEnd) {
    latestEndMs = Math.max(latestEndMs, quizEnd.getTime());
  }

  extensions.forEach((extension) => {
    latestEndMs = Math.max(latestEndMs, extension.quizEnd.getTime());
  });

  return Number.isFinite(latestEndMs) ? latestEndMs : null;
}

function extensionIsActive(extension, nowMs) {
  if (!extension) return false;
  const startMs = extension.quizStart.getTime();
  const endMs = extension.quizEnd.getTime();
  return nowMs >= startMs && nowMs <= endMs;
}

function extensionIsUpcoming(extension, nowMs) {
  if (!extension) return false;
  return nowMs < extension.quizStart.getTime();
}

function extensionHasRemainingWindow(extension, nowMs) {
  if (!extension) return false;
  return nowMs <= extension.quizEnd.getTime();
}

function getQuizRuntimeState(session, { userId = '', instructorView = false, now = new Date() } = {}) {
  const defaultState = {
    effectiveStatus: session?.status || 'hidden',
    isOpenForUser: false,
    isUpcomingForUser: false,
    isClosedForUser: (session?.status || 'hidden') === 'done',
    quizHasActiveExtensions: false,
    activeExtensionsCount: 0,
    userHasActiveQuizExtension: false,
    userHasUpcomingQuizExtension: false,
    userHasRemainingQuizExtension: false,
  };

  if (!isQuizLikeSession(session)) return defaultState;

  const nowMs = now.getTime();
  const normalizedExtensions = getNormalizedQuizExtensions(session);
  const userExtension = normalizedExtensions.find((extension) => extension.userId === String(userId)) || null;
  const activeExtensions = normalizedExtensions.filter((extension) => extensionIsActive(extension, nowMs));
  const quizHasActiveExtensions = activeExtensions.length > 0;
  const anyExtensionsRemaining = normalizedExtensions.some((extension) => extensionHasRemainingWindow(extension, nowMs));

  const quizStart = toDateOrNull(session?.quizStart);
  const quizEnd = toDateOrNull(session?.quizEnd);
  const startMs = quizStart ? quizStart.getTime() : null;
  const endMs = quizEnd ? quizEnd.getTime() : null;
  const hasBaseWindow = Number.isFinite(startMs) && Number.isFinite(endMs);
  const baseWindowActive = hasBaseWindow && nowMs >= startMs && nowMs <= endMs;
  const baseWindowEnded = Number.isFinite(endMs) ? nowMs > endMs : false;

  const userHasActiveQuizExtension = extensionIsActive(userExtension, nowMs);
  const userHasUpcomingQuizExtension = extensionIsUpcoming(userExtension, nowMs);
  const userHasRemainingQuizExtension = extensionHasRemainingWindow(userExtension, nowMs);

  const latestWindowEndMs = getLatestQuizWindowEndMs(session, normalizedExtensions);
  const allQuizWindowsElapsed = Number.isFinite(latestWindowEndMs) ? nowMs > latestWindowEndMs : false;

  let effectiveStatus = session?.status || 'hidden';

  if (effectiveStatus === 'visible') {
    if (instructorView) {
      if (baseWindowActive || quizHasActiveExtensions) {
        effectiveStatus = 'running';
      } else if (allQuizWindowsElapsed || (baseWindowEnded && !anyExtensionsRemaining)) {
        effectiveStatus = 'done';
      } else {
        effectiveStatus = 'visible';
      }
    } else if (baseWindowActive || userHasActiveQuizExtension) {
      effectiveStatus = 'running';
    } else if (allQuizWindowsElapsed || (baseWindowEnded && !userHasRemainingQuizExtension)) {
      effectiveStatus = 'done';
    } else {
      effectiveStatus = 'visible';
    }
  }

  if (effectiveStatus === 'running') {
    if (session?.status === 'running') {
      defaultState.isOpenForUser = true;
    } else {
      defaultState.isOpenForUser = baseWindowActive || userHasActiveQuizExtension;
    }
  }

  defaultState.effectiveStatus = effectiveStatus;
  defaultState.isUpcomingForUser = !defaultState.isOpenForUser && effectiveStatus === 'visible';
  defaultState.isClosedForUser = !defaultState.isOpenForUser && effectiveStatus === 'done';
  defaultState.quizHasActiveExtensions = quizHasActiveExtensions;
  defaultState.activeExtensionsCount = activeExtensions.length;
  defaultState.userHasActiveQuizExtension = userHasActiveQuizExtension;
  defaultState.userHasUpcomingQuizExtension = userHasUpcomingQuizExtension;
  defaultState.userHasRemainingQuizExtension = userHasRemainingQuizExtension;

  return defaultState;
}

async function maybeAutoCloseScheduledQuiz(session) {
  if (!isQuizLikeSession(session)) {
    return { session, changed: false };
  }
  if (session?.status !== 'visible') {
    return { session, changed: false };
  }

  const normalizedExtensions = getNormalizedQuizExtensions(session);
  const latestEndMs = getLatestQuizWindowEndMs(session, normalizedExtensions);
  if (!Number.isFinite(latestEndMs)) {
    return { session, changed: false };
  }
  if (Date.now() <= latestEndMs) {
    return { session, changed: false };
  }

  const updated = await Session.findByIdAndUpdate(
    session._id,
    { $set: { status: 'done' } },
    { new: true }
  ).lean();

  if (updated) {
    return { session: updated, changed: true };
  }

  return { session: { ...session, status: 'done' }, changed: true };
}

function formatUserDisplayName(user) {
  const first = normalizeAnswerValue(user?.profile?.firstname);
  const last = normalizeAnswerValue(user?.profile?.lastname);
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  return user?.emails?.[0]?.address || user?.email || 'Unknown Student';
}

function collectCorrectAnswerHints(question) {
  const hints = [];
  const candidateFields = [
    question?.correctAnswer,
    question?.correctAnswers,
    question?.correctOption,
    question?.correctOptions,
    question?.correctIndex,
    question?.correctIndexes,
    question?.answerKey,
    question?.answerKeys,
    question?.rightAnswer,
    question?.rightAnswers,
  ];

  for (const candidate of candidateFields) {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') hints.push(entry);
      });
    } else if (candidate !== undefined && candidate !== null && candidate !== '') {
      hints.push(candidate);
    }
  }

  return hints;
}

function normalizeQuestionForReview(question) {
  if (!question) return question;
  const normalized = { ...question };
  const options = Array.isArray(normalized.options) ? normalized.options.map((opt) => ({ ...opt })) : [];

  if (options.length > 0) {
    const hintedIndices = new Set(
      collectCorrectAnswerHints(normalized)
        .map((hint) => resolveOptionIndex(hint, options))
        .filter((idx) => idx >= 0 && idx < options.length)
    );

    normalized.options = options.map((opt, idx) => ({
      ...opt,
      correct: parseBooleanLike(opt?.correct) || parseBooleanLike(opt?.isCorrect) || hintedIndices.has(idx),
    }));
  } else {
    normalized.options = options;
  }

  const solutionHtml = normalizeAnswerValue(
    normalized.solution
      || normalized.solutionHtml
      || normalized.explanation
      || normalized.explanationHtml
      || normalized.rationale
  );
  const solutionPlain = normalizeAnswerValue(
    normalized.solution_plainText
      || normalized.solutionPlainText
      || normalized.solutionText
      || normalized.explanation_plainText
      || normalized.explanationPlainText
      || normalized.rationaleText
  );

  if (solutionHtml) {
    normalized.solution = solutionHtml;
  }
  if (solutionPlain) {
    normalized.solution_plainText = solutionPlain;
  } else if (solutionHtml) {
    normalized.solution_plainText = toPlainText(solutionHtml);
  }

  return normalized;
}

function resolveOptionIndex(answer, options) {
  if (answer && typeof answer === 'object') {
    if (Array.isArray(answer)) return -1;
    if (answer.optionId !== undefined) return resolveOptionIndex(answer.optionId, options);
    if (answer._id !== undefined) return resolveOptionIndex(answer._id, options);
    if (answer.id !== undefined) return resolveOptionIndex(answer.id, options);
    if (answer.index !== undefined) return resolveOptionIndex(answer.index, options);
    if (answer.value !== undefined) return resolveOptionIndex(answer.value, options);
    if (answer.answer !== undefined) return resolveOptionIndex(answer.answer, options);
    if (answer.text !== undefined) return resolveOptionIndex(answer.text, options);
  }

  if (typeof answer === 'number' && Number.isInteger(answer)) {
    if (answer >= 0 && answer < options.length) return answer;
    if (answer >= 1 && answer <= options.length) return answer - 1;
    return -1;
  }

  const normalizedRaw = normalizeAnswerValue(answer);
  if (!normalizedRaw) return -1;
  const normalized = normalizedRaw.toLowerCase();

  // Current student UI may submit option index as a string (e.g. "0", "1").
  if (/^-?\d+$/.test(normalizedRaw)) {
    const parsed = Number(normalizedRaw);
    if (parsed >= 0 && parsed < options.length) return parsed;
    if (parsed >= 1 && parsed <= options.length) return parsed - 1;
  }

  // Legacy payloads may store option letters (e.g., "A", "B").
  if (/^[a-z]$/.test(normalized)) {
    const idx = normalized.charCodeAt(0) - 97;
    if (idx >= 0 && idx < options.length) return idx;
  }

  return options.findIndex((opt) => {
    if (normalizeAnswerValue(opt?._id).toLowerCase() === normalized) return true;
    if (normalizeComparableText(opt?.answer) === normalizeComparableText(normalizedRaw)) return true;
    if (normalizeComparableText(opt?.content) === normalizeComparableText(normalizedRaw)) return true;
    if (normalizeComparableText(opt?.plainText) === normalizeComparableText(normalizedRaw)) return true;
    return false;
  });
}

function sanitizeQuizQuestionForStudent(question, { revealAnswers = false } = {}) {
  if (!question) return question;
  const sanitized = { ...question };

  if (!revealAnswers) {
    if (Array.isArray(sanitized.options)) {
      sanitized.options = sanitized.options.map((option) => ({
        ...option,
        correct: undefined,
      }));
    }
    delete sanitized.correctNumerical;
    delete sanitized.toleranceNumerical;
    delete sanitized.solution;
    delete sanitized.solution_plainText;
    delete sanitized.solutionText;
    delete sanitized.solutionPlainText;
    delete sanitized.solutionHtml;
  }

  return sanitized;
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
      answer: optionDisplayContent(opt, i),
      correct: !!opt.correct,
      count: 0,
    }));

    for (const r of responses) {
      if (Array.isArray(r.answer)) {
        // MS: answer can be array of indices, option IDs, or answer strings
        for (const a of r.answer) {
          const idx = resolveOptionIndex(a, options);
          if (idx >= 0 && idx < distribution.length) distribution[idx].count++;
        }
      } else {
        const idx = resolveOptionIndex(r.answer, options);
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
        studentUserId: getResponseStudentId(r),
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

async function loadOrderedQuestions(questionIds = []) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) return [];
  const questions = await Question.find({ _id: { $in: questionIds } }).lean();
  const byId = new Map(questions.map((question) => [String(question._id), question]));
  return questionIds.map((questionId) => byId.get(String(questionId))).filter(Boolean);
}

// Helper to check if user is instructor of course or admin
function isInstructorOrAdmin(course, user) {
  const roles = user.roles || [];
  return roles.includes('admin') || course.instructors.includes(user.userId);
}

function isStudentBlockedByInactiveCourse(course, user) {
  if (!course?.inactive) return false;
  const roles = user.roles || [];
  if (roles.includes('admin')) return false;
  if (course.instructors.includes(user.userId)) return false;
  return course.students.includes(user.userId);
}

// Helper to check if user is a member of the course (student, instructor, or admin)
function isCourseMember(course, user) {
  if (isStudentBlockedByInactiveCourse(course, user)) return false;
  const roles = user.roles || [];
  return roles.includes('admin') ||
    course.instructors.includes(user.userId) ||
    course.students.includes(user.userId);
}

function buildSessionForUser(session, user, { instructorView = false } = {}) {
  const normalized = { ...(session || {}) };
  const runtime = getQuizRuntimeState(normalized, {
    userId: user?.userId,
    instructorView,
  });
  normalized.status = runtime.effectiveStatus;

  if (isQuizLikeSession(normalized)) {
    const submittedQuiz = Array.isArray(normalized.submittedQuiz) ? normalized.submittedQuiz : [];
    normalized.quizSubmittedByCurrentUser = submittedQuiz.includes(user?.userId);
    normalized.quizHasActiveExtensions = runtime.quizHasActiveExtensions;
    normalized.activeExtensionsCount = runtime.activeExtensionsCount;
    normalized.userHasActiveQuizExtension = runtime.userHasActiveQuizExtension;
    normalized.userHasUpcomingQuizExtension = runtime.userHasUpcomingQuizExtension;
  }

  if (!instructorView) {
    delete normalized.submittedQuiz;
    delete normalized.joinRecords;
    delete normalized.joined;
    delete normalized.currentJoinCode;
  }

  return normalized;
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

      const {
        name,
        description,
        quiz,
        practiceQuiz,
        quizStart,
        quizEnd,
        date,
        msScoringMethod,
      } = request.body;
      const isPracticeQuiz = !!practiceQuiz;
      const isQuiz = isPracticeQuiz ? true : !!quiz;
      const quizWindowValidationError = getQuizWindowValidationMessage(null, {
        quiz: isQuiz,
        practiceQuiz: isPracticeQuiz,
        quizStart,
        quizEnd,
      });
      if (quizWindowValidationError) {
        return reply.code(400).send({ error: 'Bad Request', message: quizWindowValidationError });
      }

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
        msScoringMethod: msScoringMethod || undefined,
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
      const hydratedSessions = [];

      for (const rawSession of sessions) {
        const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(rawSession);
        if (changed) {
          notifySessionUpdated(app, course, normalizedSession?._id || rawSession?._id);
        }
        hydratedSessions.push(buildSessionForUser(normalizedSession, request.user, {
          instructorView: isInstrOrAdmin,
        }));
      }

      return { sessions: hydratedSessions };
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

      const isInstrOrAdmin = isInstructorOrAdmin(course, request.user);
      const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(session.toObject());
      if (changed) {
        notifySessionUpdated(app, course, normalizedSession?._id || session._id);
      }

      // For students, hide certain fields if session is hidden.
      if (!isInstrOrAdmin && normalizedSession.status === 'hidden') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Session is not available' });
      }

      return {
        session: buildSessionForUser(normalizedSession, request.user, {
          instructorView: isInstrOrAdmin,
        }),
      };
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

      const allowed = ['name', 'description', 'quiz', 'practiceQuiz', 'quizStart', 'quizEnd', 'reviewable', 'status', 'date', 'joinCodeEnabled', 'joinCodeInterval', 'msScoringMethod'];
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

      const quizWindowValidationError = getQuizWindowValidationMessage(session.toObject(), updates);
      if (quizWindowValidationError) {
        return reply.code(400).send({ error: 'Bad Request', message: quizWindowValidationError });
      }

      // If passcode requirement is disabled through the generic session patch,
      // also close any active join period for consistent behavior.
      if (updates.joinCodeEnabled === false) {
        updates.joinCodeActive = false;
        updates.currentJoinCode = '';
        updates.joinCodeExpiresAt = null;
      }

      // Reviewable can only be set to true when session is ended
      // Allow if session is already done or if status is being set to done in this request
      if (updates.reviewable === true && session.status !== 'done' && updates.status !== 'done') {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Session must be in ended state to be made reviewable',
        });
      }

      if (updates.reviewable === true) {
        const previewSession = {
          ...session.toObject(),
          ...updates,
        };
        const runtime = getQuizRuntimeState(previewSession, {
          instructorView: true,
        });
        if (isQuizLikeSession(previewSession) && runtime.quizHasActiveExtensions) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Session cannot be made reviewable while quiz extensions are active',
          });
        }
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

      let grading = null;
      const makingReviewable = updates.reviewable === true && !session.reviewable;
      const removingReviewable = updates.reviewable === false && session.reviewable;

      if (makingReviewable) {
        const gradingResult = await recalculateSessionGrades({
          sessionId: updated._id,
          sessionDoc: updated,
          courseDoc: course,
          missingOnly: true,
          visibleToStudents: true,
        });
        grading = gradingResult.summary;
      } else if (removingReviewable) {
        await setSessionGradesVisibility({
          sessionId: updated._id,
          visibleToStudents: false,
        });
      }

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject(), grading };
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
      const updates = {
        status: 'running',
        date: now,
        // Join period is always explicit; starting a session does not auto-open passcode entry.
        joinCodeActive: false,
        currentJoinCode: '',
        joinCodeExpiresAt: null,
      };
      if (session.questions.length > 0 && !session.currentQuestion) {
        updates.currentQuestion = session.questions[0];

        // Set first question hidden by default when session launches
        await Question.findByIdAndUpdate(session.questions[0], {
          $set: { 'sessionOptions.hidden': true },
        });
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

      const updates = {
        status: 'done',
        joinCodeActive: false,
        currentJoinCode: '',
        joinCodeExpiresAt: null,
      };
      if (request.body?.reviewable !== undefined) {
        if (request.body.reviewable === true && isQuizLikeSession(session)) {
          const runtime = getQuizRuntimeState(session.toObject(), {
            instructorView: true,
          });
          if (runtime.quizHasActiveExtensions) {
            return reply.code(400).send({
              error: 'Bad Request',
              message: 'Session cannot be made reviewable while quiz extensions are active',
            });
          }
        }
        updates.reviewable = request.body.reviewable;
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

      let grading = null;
      if (request.body?.reviewable === true && !session.reviewable) {
        const gradingResult = await recalculateSessionGrades({
          sessionId: updated._id,
          sessionDoc: updated,
          courseDoc: course,
          missingOnly: true,
          visibleToStudents: true,
        });
        grading = gradingResult.summary;
      } else if (request.body?.reviewable === false && session.reviewable) {
        await setSessionGradesVisibility({
          sessionId: updated._id,
          visibleToStudents: false,
        });
      }

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject(), grading };
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

      // Carry over visibility state from previous question to the new one
      if (session.currentQuestion && session.currentQuestion !== questionId) {
        const prevQ = await Question.findById(session.currentQuestion).lean();
        const prevHidden = prevQ?.sessionOptions?.hidden ?? true;
        await Question.findByIdAndUpdate(questionId, {
          $set: { 'sessionOptions.hidden': prevHidden },
        });
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

      // Reviewable can only be set to true when session is ended
      if (request.body.reviewable === true && session.status !== 'done') {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Session must be in ended state to be made reviewable',
        });
      }

      if (request.body.reviewable === true && isQuizLikeSession(session)) {
        const runtime = getQuizRuntimeState(session.toObject(), {
          instructorView: true,
        });
        if (runtime.quizHasActiveExtensions) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Session cannot be made reviewable while quiz extensions are active',
          });
        }
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: { reviewable: request.body.reviewable } },
        { new: true }
      );

      let grading = null;
      if (request.body.reviewable === true && !session.reviewable) {
        const gradingResult = await recalculateSessionGrades({
          sessionId: updated._id,
          sessionDoc: updated,
          courseDoc: course,
          missingOnly: true,
          visibleToStudents: true,
        });
        grading = gradingResult.summary;
      } else if (request.body.reviewable === false && session.reviewable) {
        await setSessionGradesVisibility({
          sessionId: updated._id,
          visibleToStudents: false,
        });
      }

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return { session: updated.toObject(), grading };
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

      if (!isQuizLikeSession(session)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not a quiz' });
      }

      const baseQuizStart = toDateOrNull(session.quizStart);
      const baseQuizEnd = toDateOrNull(session.quizEnd);

      const normalizedExtensionsByUser = new Map();
      const extensionStudents = new Set((course.students || []).map((studentId) => String(studentId)));

      for (const rawExtension of request.body.extensions || []) {
        const userId = normalizeAnswerValue(rawExtension?.userId);
        if (!userId) {
          return reply.code(400).send({ error: 'Bad Request', message: 'Each extension requires a userId' });
        }
        if (!extensionStudents.has(userId)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: `User ${userId} is not enrolled as a student in this course`,
          });
        }

        const quizStart = toDateOrNull(rawExtension?.quizStart) || baseQuizStart;
        const quizEnd = toDateOrNull(rawExtension?.quizEnd) || baseQuizEnd;
        if (!quizStart || !quizEnd) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Each extension requires a valid start and end time (or quiz defaults)',
          });
        }
        if (quizEnd.getTime() <= quizStart.getTime()) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Extension end time must be later than extension start time',
          });
        }

        normalizedExtensionsByUser.set(userId, {
          userId,
          quizStart,
          quizEnd,
        });
      }

      const normalizedExtensions = [...normalizedExtensionsByUser.values()].sort(
        (a, b) => a.quizEnd.getTime() - b.quizEnd.getTime()
      );

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        { $set: { quizExtensions: normalizedExtensions } },
        { new: true }
      );

      notifySessionUpdated(app, course, updated?._id || request.params.id);

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
        msScoringMethod: session.msScoringMethod,
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

      const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(session.toObject());
      if (changed) {
        notifySessionUpdated(app, course, normalizedSession?._id || session._id);
      }

      // Students can only review if the session is reviewable and done
      const isInstrOrAdmin = isInstructorOrAdmin(course, request.user);
      if (!isInstrOrAdmin) {
        if (!normalizedSession.reviewable) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Session is not reviewable' });
        }
        if (normalizedSession.status !== 'done') {
          return reply.code(403).send({ error: 'Forbidden', message: 'Session is not yet finished' });
        }
      }

      // Fetch questions in session order
      const questionIds = normalizedSession.questions || [];
      const questions = await Question.find({ _id: { $in: questionIds } }).lean();

      // Maintain session question order
      const questionMap = {};
      for (const q of questions) {
        questionMap[String(q._id)] = q;
      }
      const orderedQuestions = questionIds
        .map((id) => questionMap[String(id)])
        .filter(Boolean);
      const normalizedQuestions = orderedQuestions.map((question) => normalizeQuestionForReview(question));

      // Fetch this student's responses for these questions
      const responses = await Response.find({
        questionId: { $in: questionIds },
        studentUserId: request.user.userId,
      }).lean();

      // Group responses by questionId
      const responsesByQuestion = {};
      for (const r of responses) {
        const questionId = normalizeAnswerValue(r.questionId);
        if (!questionId) continue;
        if (!responsesByQuestion[questionId]) {
          responsesByQuestion[questionId] = [];
        }
        responsesByQuestion[questionId].push(r);
      }

      return {
        session: normalizedSession,
        questions: normalizedQuestions,
        responses: responsesByQuestion,
      };
    }
  );

  // GET /sessions/:id/quiz - Get quiz payload for student quiz mode
  app.get(
    '/sessions/:id/quiz',
    { preHandler: authenticate },
    async (request, reply) => {
      const sessionDoc = await Session.findById(request.params.id);
      if (!sessionDoc) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(sessionDoc.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      if (isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only students can access quiz mode' });
      }

      const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(sessionDoc.toObject());
      if (changed) {
        notifySessionUpdated(app, course, normalizedSession?._id || sessionDoc._id);
      }

      if (!isQuizLikeSession(normalizedSession)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not a quiz' });
      }

      if (normalizedSession.status === 'hidden') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Session is not available' });
      }

      const runtime = getQuizRuntimeState(normalizedSession, {
        userId: request.user.userId,
        instructorView: false,
      });

      const submittedByCurrentUser = Array.isArray(normalizedSession.submittedQuiz)
        && normalizedSession.submittedQuiz.includes(request.user.userId);
      if (submittedByCurrentUser && !normalizedSession.practiceQuiz) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Quiz already submitted' });
      }

      if (!runtime.isOpenForUser) {
        if (runtime.isUpcomingForUser) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Quiz is not open yet' });
        }
        return reply.code(403).send({ error: 'Forbidden', message: 'Quiz is closed' });
      }

      // Mark the student as participating once they open an active quiz.
      const userId = request.user.userId;
      const now = new Date();
      const joined = Array.isArray(normalizedSession.joined) ? normalizedSession.joined : [];
      if (!joined.includes(userId)) {
        const existingRecord = (normalizedSession.joinRecords || []).find((record) => record.userId === userId);
        if (existingRecord) {
          await Session.findOneAndUpdate(
            { _id: request.params.id, 'joinRecords.userId': userId },
            {
              $addToSet: { joined: userId },
              $set: { 'joinRecords.$.joinedAt': now },
            },
          );
        } else {
          await Session.findByIdAndUpdate(request.params.id, {
            $addToSet: { joined: userId },
            $push: {
              joinRecords: {
                userId,
                joinedAt: now,
                joinedWithCode: false,
              },
            },
          });
        }
      }

      const questionIds = normalizedSession.questions || [];
      const orderedQuestions = await loadOrderedQuestions(questionIds);

      const responses = questionIds.length > 0
        ? await Response.find({
          questionId: { $in: questionIds },
          studentUserId: userId,
          attempt: 1,
        }).lean()
        : [];

      const latestResponseByQuestionId = {};
      responses.forEach((response) => {
        const questionId = String(response.questionId);
        const current = latestResponseByQuestionId[questionId];
        if (!current) {
          latestResponseByQuestionId[questionId] = response;
          return;
        }
        const currentTs = current.updatedAt ? new Date(current.updatedAt).getTime() : new Date(current.createdAt || 0).getTime();
        const nextTs = response.updatedAt ? new Date(response.updatedAt).getTime() : new Date(response.createdAt || 0).getTime();
        if (nextTs >= currentTs) {
          latestResponseByQuestionId[questionId] = response;
        }
      });

      const questionPayload = orderedQuestions.map((question) => {
        const response = latestResponseByQuestionId[String(question._id)];
        const revealAnswers = !!normalizedSession.practiceQuiz && !!response && response.editable === false;
        return sanitizeQuizQuestionForStudent(question, { revealAnswers });
      });

      const answeredQuestionIds = new Set(Object.keys(latestResponseByQuestionId));
      const allAnswered = questionIds.every((questionId) => answeredQuestionIds.has(String(questionId)));

      return {
        session: buildSessionForUser(normalizedSession, request.user, { instructorView: false }),
        questions: questionPayload,
        responses: latestResponseByQuestionId,
        allAnswered,
        submitted: submittedByCurrentUser,
      };
    }
  );

  // PATCH /sessions/:id/quiz-response - Auto-save/update a quiz response
  app.patch(
    '/sessions/:id/quiz-response',
    {
      preHandler: authenticate,
      schema: saveQuizResponseSchema,
    },
    async (request, reply) => {
      const sessionDoc = await Session.findById(request.params.id);
      if (!sessionDoc) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(sessionDoc.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      if (isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only students can submit quiz responses' });
      }

      const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(sessionDoc.toObject());
      if (changed) {
        notifySessionUpdated(app, course, normalizedSession?._id || sessionDoc._id);
      }

      if (!isQuizLikeSession(normalizedSession)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not a quiz' });
      }

      const runtime = getQuizRuntimeState(normalizedSession, {
        userId: request.user.userId,
        instructorView: false,
      });
      if (!runtime.isOpenForUser) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Quiz is closed' });
      }

      if (
        Array.isArray(normalizedSession.submittedQuiz)
        && normalizedSession.submittedQuiz.includes(request.user.userId)
        && !normalizedSession.practiceQuiz
      ) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Quiz already submitted' });
      }

      const questionId = request.body.questionId;
      if (!Array.isArray(normalizedSession.questions) || !normalizedSession.questions.includes(questionId)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Question not found in this quiz' });
      }

      const question = await Question.findById(questionId).lean();
      if (!question || String(question.sessionId) !== String(normalizedSession._id)) {
        return reply.code(404).send({ error: 'Not Found', message: 'Question not found' });
      }

      const userId = request.user.userId;
      const existing = await Response.findOne({
        questionId,
        studentUserId: userId,
        attempt: 1,
      });

      if (existing && existing.editable === false) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: normalizedSession.practiceQuiz
            ? 'This question has already been submitted'
            : 'Quiz answer is already locked',
        });
      }

      const now = new Date();
      const editable = true;
      const payload = {
        answer: request.body.answer,
        answerWysiwyg: request.body.answerWysiwyg || '',
        updatedAt: now,
        editable,
      };

      let response;
      if (existing) {
        response = await Response.findByIdAndUpdate(existing._id, { $set: payload }, { new: true });
      } else {
        response = await Response.create({
          questionId,
          studentUserId: userId,
          attempt: 1,
          answer: request.body.answer,
          answerWysiwyg: request.body.answerWysiwyg || '',
          createdAt: now,
          updatedAt: now,
          editable,
        });
      }

      return { response: response.toObject() };
    }
  );

  // POST /sessions/:id/quiz-question-submit - Lock a practice-quiz question answer
  app.post(
    '/sessions/:id/quiz-question-submit',
    {
      preHandler: authenticate,
      schema: submitQuizQuestionSchema,
    },
    async (request, reply) => {
      const sessionDoc = await Session.findById(request.params.id);
      if (!sessionDoc) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(sessionDoc.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      if (isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only students can submit quiz responses' });
      }

      const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(sessionDoc.toObject());
      if (changed) {
        notifySessionUpdated(app, course, normalizedSession?._id || sessionDoc._id);
      }

      if (!isQuizLikeSession(normalizedSession)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not a quiz' });
      }
      if (!normalizedSession.practiceQuiz) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Per-question submission is only available for practice quizzes' });
      }

      const runtime = getQuizRuntimeState(normalizedSession, {
        userId: request.user.userId,
        instructorView: false,
      });
      if (!runtime.isOpenForUser) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Quiz is closed' });
      }

      const questionId = request.body.questionId;
      if (!Array.isArray(normalizedSession.questions) || !normalizedSession.questions.includes(questionId)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Question not found in this quiz' });
      }

      const response = await Response.findOne({
        questionId,
        studentUserId: request.user.userId,
        attempt: 1,
      });
      if (!response) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Answer this question before submitting it' });
      }

      if (response.editable === false) {
        return { response: response.toObject(), alreadySubmitted: true };
      }

      const locked = await Response.findByIdAndUpdate(
        response._id,
        { $set: { editable: false, updatedAt: new Date() } },
        { new: true }
      );

      return { response: locked.toObject(), alreadySubmitted: false };
    }
  );

  // POST /sessions/:id/submit - Submit a quiz (locks all answers)
  app.post(
    '/sessions/:id/submit',
    { preHandler: authenticate },
    async (request, reply) => {
      const sessionDoc = await Session.findById(request.params.id);
      if (!sessionDoc) {
        return reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      const course = await Course.findById(sessionDoc.courseId);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
      }

      if (isInstructorOrAdmin(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only students can submit quizzes' });
      }

      const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(sessionDoc.toObject());
      if (changed) {
        notifySessionUpdated(app, course, normalizedSession?._id || sessionDoc._id);
      }

      if (!isQuizLikeSession(normalizedSession)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not a quiz' });
      }
      if (normalizedSession.practiceQuiz) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Practice quizzes are submitted per question' });
      }

      const userId = request.user.userId;
      if (Array.isArray(normalizedSession.submittedQuiz) && normalizedSession.submittedQuiz.includes(userId)) {
        return reply.code(409).send({ error: 'Conflict', message: 'Quiz already submitted' });
      }

      const runtime = getQuizRuntimeState(normalizedSession, {
        userId,
        instructorView: false,
      });
      if (!runtime.isOpenForUser) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Quiz is closed' });
      }

      const questionIds = normalizedSession.questions || [];
      const responses = questionIds.length > 0
        ? await Response.find({
          questionId: { $in: questionIds },
          studentUserId: userId,
          attempt: 1,
        }).lean()
        : [];

      const answeredQuestionIds = new Set(responses.map((response) => String(response.questionId)));
      const hasAllAnswers = questionIds.every((questionId) => answeredQuestionIds.has(String(questionId)));
      if (!hasAllAnswers) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Must answer all questions to submit quiz' });
      }

      const now = new Date();
      await Response.updateMany(
        {
          questionId: { $in: questionIds },
          studentUserId: userId,
          attempt: 1,
          editable: true,
        },
        { $set: { editable: false, updatedAt: now } }
      );

      const hasJoinRecord = Array.isArray(normalizedSession.joinRecords)
        && normalizedSession.joinRecords.some((record) => record.userId === userId);
      const updateOps = {
        $addToSet: { submittedQuiz: userId, joined: userId },
      };
      if (hasJoinRecord) {
        updateOps.$set = { 'joinRecords.$[student].joinedAt': now };
      } else {
        updateOps.$push = {
          joinRecords: {
            userId,
            joinedAt: now,
            joinedWithCode: false,
          },
        };
      }

      const updated = await Session.findByIdAndUpdate(
        request.params.id,
        updateOps,
        hasJoinRecord
          ? {
            new: true,
            arrayFilters: [{ 'student.userId': userId }],
          }
          : { new: true }
      );

      notifySessionUpdated(app, course, updated?._id || request.params.id);

      return {
        success: true,
        session: updated ? buildSessionForUser(updated.toObject(), request.user, { instructorView: false }) : undefined,
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

      // Check if already joined
      const alreadyInList = session.joined.includes(userId);
      const existingRecord = (session.joinRecords || []).find((r) => r.userId === userId);

      // Already joined students remain joined even if passcode settings change later.
      if (alreadyInList) {
        return { success: true, alreadyJoined: true };
      }

      // Enforce passcode requirement only at join time.
      const joinCodeRequired = !!session.joinCodeEnabled;
      if (joinCodeRequired && !session.joinCodeActive) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Join period is closed. Please wait for your instructor.',
        });
      }
      if (joinCodeRequired) {
        const providedCode = String(request.body?.joinCode || '').trim();
        if (!providedCode) {
          return reply.code(400).send({ error: 'Bad Request', message: 'Join code is required' });
        }
        if (providedCode !== session.currentJoinCode) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Invalid join code' });
        }
      }

      const now = new Date();
      const joinedWithCode = joinCodeRequired && session.joinCodeActive;

      if (existingRecord) {
        // Upgrade existing record to mark joinedWithCode
        await Session.findOneAndUpdate(
          { _id: request.params.id, 'joinRecords.userId': userId },
          {
            $addToSet: { joined: userId },
            $set: {
              'joinRecords.$.joinedWithCode': joinedWithCode || existingRecord.joinedWithCode,
              'joinRecords.$.joinedAt': now,
            },
          },
        );
      } else {
        await Session.findByIdAndUpdate(request.params.id, {
          $addToSet: { joined: userId },
          $push: {
            joinRecords: {
              userId,
              joinedAt: now,
              joinedWithCode,
            },
          },
        });
      }

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
      const includeStudentNames = isInstrOrAdmin && parseBooleanQuery(request.query?.includeStudentNames);
      const userId = request.user.userId;
      let isJoined = session.joined.includes(userId);

      // Fetch current question
      let currentQuestion = null;
      if (session.currentQuestion) {
        currentQuestion = await Question.findById(session.currentQuestion).lean();
      }
      const questionCount = Array.isArray(session.questions) ? session.questions.length : 0;
      const questionIndex = session.currentQuestion
        ? (session.questions || []).findIndex((id) => String(id) === String(session.currentQuestion))
        : -1;
      const questionNumber = questionIndex >= 0 ? questionIndex + 1 : null;

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
          responseStats = buildResponseStats(currentQuestion, responses);

          const includeNamesInPayload = includeStudentNames && responseStats?.type === 'shortAnswer';
          let studentNameById = {};
          if (includeNamesInPayload) {
            const responderIds = [...new Set(
              responses
                .map((response) => getResponseStudentId(response))
                .filter(Boolean)
            )];
            if (responderIds.length > 0) {
              const users = await User.find({ _id: { $in: responderIds } })
                .select('_id profile emails email')
                .lean();
              users.forEach((user) => {
                studentNameById[String(user._id)] = formatUserDisplayName(user);
              });
            }
          }

          // Keep response content but strip raw student identifiers from live payloads.
          allResponses = responses.map((response) => {
            const base = {
              _id: response._id,
              attempt: response.attempt,
              questionId: response.questionId,
              answer: response.answer,
              answerWysiwyg: response.answerWysiwyg,
              correct: response.correct,
              mark: response.mark,
              createdAt: response.createdAt,
              updatedAt: response.updatedAt,
              editable: response.editable,
            };
            if (!includeNamesInPayload) return base;
            return {
              ...base,
              studentName: studentNameById[getResponseStudentId(response)] || 'Unknown Student',
            };
          });

          if (responseStats?.type === 'shortAnswer' && Array.isArray(responseStats.answers)) {
            responseStats = {
              ...responseStats,
              answers: responseStats.answers.map((entry) => ({
                answer: entry.answer,
                answerWysiwyg: entry.answerWysiwyg,
                ...(includeNamesInPayload
                  ? { studentName: studentNameById[getResponseStudentId(entry)] || 'Unknown Student' }
                  : {}),
              })),
            };
          }
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
            if (responseStats?.type === 'shortAnswer' && Array.isArray(responseStats.answers)) {
              responseStats = {
                ...responseStats,
                answers: responseStats.answers.map((entry) => ({
                  answer: entry.answer,
                  answerWysiwyg: entry.answerWysiwyg,
                })),
              };
            }
          }
        }
      }

      let joinedStudents = [];
      if (isInstrOrAdmin) {
        const joinedIds = [...new Set((session.joined || []).map((id) => String(id)).filter(Boolean))];
        const joinedUsers = joinedIds.length > 0
          ? await User.find({ _id: { $in: joinedIds } })
            .select('_id profile emails email')
            .lean()
          : [];
        const joinedUserMap = new Map(joinedUsers.map((user) => [String(user._id), user]));

        const latestJoinByStudentId = new Map();
        (session.joinRecords || []).forEach((record) => {
          const studentId = normalizeAnswerValue(record?.userId);
          if (!studentId) return;
          const joinedAt = record?.joinedAt ? new Date(record.joinedAt) : null;
          if (!joinedAt || Number.isNaN(joinedAt.getTime())) return;
          const existing = latestJoinByStudentId.get(studentId);
          if (!existing || joinedAt > existing) {
            latestJoinByStudentId.set(studentId, joinedAt);
          }
        });

        joinedStudents = joinedIds.map((studentId) => {
          const user = joinedUserMap.get(studentId);
          return {
            _id: studentId,
            firstname: normalizeAnswerValue(user?.profile?.firstname),
            lastname: normalizeAnswerValue(user?.profile?.lastname),
            email: normalizeAnswerValue(user?.emails?.[0]?.address || user?.email),
            profileImage: normalizeAnswerValue(user?.profile?.profileImage),
            profileThumbnail: normalizeAnswerValue(user?.profile?.profileThumbnail),
            displayName: formatUserDisplayName(user),
            joinedAt: latestJoinByStudentId.get(studentId) || null,
          };
        }).sort((a, b) => {
          const lastCmp = normalizeAnswerValue(a.lastname).localeCompare(normalizeAnswerValue(b.lastname));
          if (lastCmp !== 0) return lastCmp;
          const firstCmp = normalizeAnswerValue(a.firstname).localeCompare(normalizeAnswerValue(b.firstname));
          if (firstCmp !== 0) return firstCmp;
          return normalizeAnswerValue(a.email).localeCompare(normalizeAnswerValue(b.email));
        });
      }

      // Build response payload.
      // Student payload is intentionally minimal and only includes fields needed for live participation.
      const result = {
        session: isInstrOrAdmin
          ? {
            _id: session._id,
            name: session.name,
            description: session.description,
            courseId: session.courseId,
            status: session.status,
            questions: session.questions,
            currentQuestion: session.currentQuestion,
            joinedCount: session.joined.length,
            joinCodeActive: session.joinCodeActive,
            joinCodeEnabled: session.joinCodeEnabled,
            reviewable: session.reviewable,
          }
          : {
            _id: session._id,
            name: session.name,
            status: session.status,
            joinCodeActive: session.joinCodeActive,
            joinCodeEnabled: session.joinCodeEnabled,
          },
        currentQuestion: null,
        currentAttempt,
        responseStats,
        questionNumber,
        questionCount,
      };

      if (isInstrOrAdmin) {
        result.responseCount = allResponses ? allResponses.length : 0;
      }

      if (isInstrOrAdmin) {
        result.session.joined = session.joined;
        result.session.joinRecords = session.joinRecords;
        result.session.joinCodeEnabled = session.joinCodeEnabled;
        result.session.joinCodeInterval = session.joinCodeInterval;
        result.session.currentJoinCode = session.currentJoinCode;
        result.session.joinedStudents = joinedStudents;
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
            // Legacy compatibility keys from imported data.
            delete studentQ.solutionPlainText;
            delete studentQ.solutionText;
            delete studentQ.solutionHtml;
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
      if (!isCourseMember(course, request.user)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not a member of this course' });
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

      if (session.status !== 'running') {
        return reply.code(400).send({ error: 'Bad Request', message: 'Session is not live' });
      }
      if (!session.joinCodeEnabled) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Passcode is not required for this session' });
      }
      if (!session.joinCodeActive) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Join period is closed' });
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
      const nextJoinCodeEnabled = request.body.joinCodeEnabled ?? session.joinCodeEnabled;
      const nextJoinCodeInterval = request.body.joinCodeInterval ?? session.joinCodeInterval ?? 10;

      if (request.body.joinCodeEnabled !== undefined) {
        updates.joinCodeEnabled = request.body.joinCodeEnabled;
      }
      if (request.body.joinCodeInterval !== undefined) {
        updates.joinCodeInterval = request.body.joinCodeInterval;
      }

      if (!nextJoinCodeEnabled) {
        if (request.body.joinCodeActive === true) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Passcode requirement must be enabled before opening a join period',
          });
        }
        updates.joinCodeActive = false;
        updates.currentJoinCode = '';
        updates.joinCodeExpiresAt = null;
      } else if (request.body.joinCodeActive !== undefined) {
        updates.joinCodeActive = request.body.joinCodeActive;
        if (request.body.joinCodeActive) {
          const now = new Date();
          updates.currentJoinCode = generateJoinCode();
          updates.joinCodeExpiresAt = new Date(now.getTime() + nextJoinCodeInterval * 1000);
        } else {
          updates.currentJoinCode = '';
          updates.joinCodeExpiresAt = null;
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
      let session = await Session.findById(request.params.id).lean();
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

      const { session: normalizedSession, changed } = await maybeAutoCloseScheduledQuiz(session);
      session = normalizedSession;
      if (changed) {
        notifySessionUpdated(app, course, session?._id || request.params.id);
      }

      // Fetch questions in session order and normalize legacy fields for review.
      const questionIds = session.questions || [];
      const questions = questionIds.length > 0
        ? await Question.find({ _id: { $in: questionIds } }).lean()
        : [];
      const questionMap = new Map(
        questions.map((question) => [String(question._id), normalizeQuestionForReview(question)])
      );
      const orderedQuestions = questionIds
        .map((id) => questionMap.get(String(id)))
        .filter(Boolean);

      // Fetch all responses for this session's questions.
      const allResponses = questionIds.length > 0
        ? await Response.find({ questionId: { $in: questionIds } }).lean()
        : [];

      const responsesByStudentQuestion = new Map();
      const responderUserIds = new Set();
      allResponses.forEach((response) => {
        const studentId = getResponseStudentId(response);
        if (!studentId) return;
        responderUserIds.add(studentId);

        const key = `${studentId}::${String(response.questionId)}`;
        if (!responsesByStudentQuestion.has(key)) {
          responsesByStudentQuestion.set(key, []);
        }
        responsesByStudentQuestion.get(key).push(response);
      });
      responsesByStudentQuestion.forEach((responses) => {
        responses.sort((a, b) => {
          const attemptDiff = (Number(a?.attempt) || 0) - (Number(b?.attempt) || 0);
          if (attemptDiff !== 0) return attemptDiff;
          const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aTime - bTime;
        });
      });

      const joinedUserIds = new Set((session.joined || []).map((id) => String(id)).filter(Boolean));
      const courseStudentIds = new Set((course.students || []).map((id) => String(id)).filter(Boolean));
      const resultUserIds = [...new Set([
        ...courseStudentIds,
        ...joinedUserIds,
        ...responderUserIds,
      ])];

      const students = resultUserIds.length > 0
        ? await User.find({ _id: { $in: resultUserIds } })
          .select('_id profile emails email')
          .lean()
        : [];
      const studentMap = {};
      for (const student of students) {
        studentMap[String(student._id)] = student;
      }

      const latestJoinByStudentId = {};
      (session.joinRecords || []).forEach((record) => {
        const studentId = String(record?.userId || '');
        if (!studentId) return;
        const joinedAt = record?.joinedAt ? new Date(record.joinedAt) : null;
        if (!joinedAt) return;
        if (!latestJoinByStudentId[studentId] || joinedAt > latestJoinByStudentId[studentId]) {
          latestJoinByStudentId[studentId] = joinedAt;
        }
      });

      const questionsWithPoints = orderedQuestions.filter((q) => getParticipationQuestionPoints(q) > 0);

      // Build per-student results (include all course students plus extra responders/joined users).
      const studentResults = resultUserIds.map((studentId) => {
        const student = studentMap[String(studentId)];
        const firstname = student?.profile?.firstname || '';
        const lastname = student?.profile?.lastname || '';
        const email = student?.emails?.[0]?.address || student?.email || '';

        const questionResults = orderedQuestions.map((question) => {
          const key = `${studentId}::${String(question._id)}`;
          return {
            questionId: question._id,
            responses: responsesByStudentQuestion.get(key) || [],
          };
        });

        const answeredCount = questionsWithPoints.filter((question) => {
          const key = `${studentId}::${String(question._id)}`;
          const responses = responsesByStudentQuestion.get(key);
          return Array.isArray(responses) && responses.length > 0;
        }).length;

        let participation = 0;
        if (answeredCount > 0) {
          participation = questionsWithPoints.length > 0
            ? Math.round((1000 * answeredCount) / questionsWithPoints.length) / 10
            : 100;
        }
        if (questionsWithPoints.length === 0) {
          participation = 100;
        }

        return {
          studentId,
          firstname,
          lastname,
          email,
          profileImage: student?.profile?.profileImage || '',
          profileThumbnail: student?.profile?.profileThumbnail || '',
          inSession: joinedUserIds.has(String(studentId)),
          joinedAt: latestJoinByStudentId[String(studentId)] || null,
          participation,
          questionResults,
        };
      }).sort((a, b) => {
        const lastCmp = normalizeAnswerValue(a.lastname).localeCompare(normalizeAnswerValue(b.lastname));
        if (lastCmp !== 0) return lastCmp;
        const firstCmp = normalizeAnswerValue(a.firstname).localeCompare(normalizeAnswerValue(b.firstname));
        if (firstCmp !== 0) return firstCmp;
        return normalizeAnswerValue(a.email).localeCompare(normalizeAnswerValue(b.email));
      });

      return {
        session,
        questions: orderedQuestions,
        studentResults,
      };
    }
  );
}
