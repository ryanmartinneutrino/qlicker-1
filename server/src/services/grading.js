import Course from '../models/Course.js';
import Grade from '../models/Grade.js';
import Question from '../models/Question.js';
import Response from '../models/Response.js';
import Session from '../models/Session.js';
import User from '../models/User.js';

export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 0,
  TRUE_FALSE: 1,
  SHORT_ANSWER: 2,
  MULTI_SELECT: 3,
  NUMERICAL: 4,
};

export const MS_SCORING_METHODS = {
  RIGHT_MINUS_WRONG: 'right-minus-wrong',
  ALL_OR_NOTHING: 'all-or-nothing',
  CORRECTNESS_RATIO: 'correctness-ratio',
};

export const DEFAULT_MS_SCORING_METHOD = MS_SCORING_METHODS.RIGHT_MINUS_WRONG;

const MS_SCORING_METHOD_SET = new Set(Object.values(MS_SCORING_METHODS));

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

function getResponseTimestamp(response) {
  const updated = response?.updatedAt ? new Date(response.updatedAt).getTime() : Number.NaN;
  if (Number.isFinite(updated)) return updated;
  const created = response?.createdAt ? new Date(response.createdAt).getTime() : Number.NaN;
  if (Number.isFinite(created)) return created;
  return 0;
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

function resolveOptionIndex(answer, options = []) {
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

  if (/^-?\d+$/.test(normalizedRaw)) {
    const parsed = Number(normalizedRaw);
    if (parsed >= 0 && parsed < options.length) return parsed;
    if (parsed >= 1 && parsed <= options.length) return parsed - 1;
  }

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

function collectAnswerEntries(answer) {
  if (answer === undefined || answer === null) return [];
  if (Array.isArray(answer)) return answer.flatMap((entry) => collectAnswerEntries(entry));
  if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (!trimmed) return [];

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== answer) return collectAnswerEntries(parsed);
      } catch {
        // Fall back to scalar handling.
      }
    }

    if (/[|,;]/.test(trimmed) && !/<[^>]*>/.test(trimmed)) {
      return trimmed.split(/[|,;]/).map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [answer];
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function roundToTenths(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10) / 10;
}

function roundToThousandths(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 1000) / 1000;
}

function formatUserDisplayName(user) {
  const first = normalizeAnswerValue(user?.profile?.firstname);
  const last = normalizeAnswerValue(user?.profile?.lastname);
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  return user?.emails?.[0]?.address || user?.email || 'Unknown Student';
}

function buildQuestionWithNormalizedOptions(question) {
  if (!question) return null;
  const normalized = { ...question };
  const options = Array.isArray(question.options) ? question.options.map((option) => ({ ...option })) : [];

  if (options.length > 0) {
    const hintedIndices = new Set(
      collectCorrectAnswerHints(question)
        .map((hint) => resolveOptionIndex(hint, options))
        .filter((idx) => idx >= 0 && idx < options.length)
    );

    normalized.options = options.map((option, idx) => ({
      ...option,
      correct: parseBooleanLike(option?.correct) || parseBooleanLike(option?.isCorrect) || hintedIndices.has(idx),
    }));
  } else {
    normalized.options = options;
  }

  return normalized;
}

function getQuestionType(question) {
  return Number(question?.type);
}

export function isQuestionAutoGradeable(type) {
  const numericType = Number(type);
  return [
    QUESTION_TYPES.MULTIPLE_CHOICE,
    QUESTION_TYPES.TRUE_FALSE,
    QUESTION_TYPES.MULTI_SELECT,
    QUESTION_TYPES.NUMERICAL,
  ].includes(numericType);
}

export function normalizeMsScoringMethod(method) {
  const candidate = normalizeAnswerValue(method).toLowerCase();
  if (MS_SCORING_METHOD_SET.has(candidate)) return candidate;
  return DEFAULT_MS_SCORING_METHOD;
}

export function getSessionMsScoringMethod(session) {
  return normalizeMsScoringMethod(session?.msScoringMethod);
}

export async function ensureSessionMsScoringMethod(session, { persist = true } = {}) {
  if (!session) {
    return {
      session,
      msScoringMethod: DEFAULT_MS_SCORING_METHOD,
      changed: false,
    };
  }

  const normalizedMethod = normalizeMsScoringMethod(session?.msScoringMethod);
  const storedMethod = normalizeAnswerValue(session?.msScoringMethod).toLowerCase();
  let changed = storedMethod !== normalizedMethod;

  if (!persist && !changed) {
    return {
      session,
      msScoringMethod: normalizedMethod,
      changed: false,
    };
  }

  const sessionId = normalizeAnswerValue(session?._id);
  let persistedSession = null;
  if (persist && sessionId) {
    const updateResult = await Session.updateOne(
      { _id: sessionId, msScoringMethod: { $ne: normalizedMethod } },
      { $set: { msScoringMethod: normalizedMethod } },
    );
    const modifiedCount = Number(updateResult?.modifiedCount ?? updateResult?.nModified ?? 0);
    if (modifiedCount > 0) {
      changed = true;
      persistedSession = await Session.findById(sessionId).lean();
    }
  } else if (!sessionId) {
    changed = storedMethod !== normalizedMethod;
  }

  return {
    session: persistedSession || { ...session, msScoringMethod: normalizedMethod },
    msScoringMethod: normalizedMethod,
    changed,
  };
}

export function getQuestionPoints(question) {
  // Meteor behavior for backward compatibility:
  // SA defaults to 0 unless explicitly configured, others default to 1.
  let points = getQuestionType(question) === QUESTION_TYPES.SHORT_ANSWER ? 0 : 1;
  if (question?.sessionOptions && Object.prototype.hasOwnProperty.call(question.sessionOptions, 'points')) {
    points = toFiniteNumber(question.sessionOptions.points, 0);
  }
  return points;
}

function getAttemptWeight(question, attemptNumber) {
  const maxAttempts = toFiniteNumber(question?.sessionOptions?.maxAttempts, 1);
  const weights = Array.isArray(question?.sessionOptions?.attemptWeights)
    ? question.sessionOptions.attemptWeights
    : [];

  if (maxAttempts > 1 && weights.length > 0) {
    const idx = Number(attemptNumber) - 1;
    if (idx >= 0 && idx < maxAttempts && idx < weights.length) {
      return toFiniteNumber(weights[idx], 0);
    }
    return 0;
  }

  return 1;
}

function responseHasContent(response) {
  if (!response) return false;
  if (response.answer === undefined || response.answer === null) return false;

  if (typeof response.answer === 'string') {
    return response.answer.trim().length > 0;
  }

  if (Array.isArray(response.answer)) {
    return response.answer.length > 0;
  }

  return true;
}

function getResponseStudentId(response) {
  return normalizeAnswerValue(response?.studentUserId || response?.userId || response?.studentId);
}

function getLatestResponse(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return null;

  let best = null;
  responses.forEach((response) => {
    if (!best) {
      best = response;
      return;
    }

    const attemptDiff = toFiniteNumber(response?.attempt, 0) - toFiniteNumber(best?.attempt, 0);
    if (attemptDiff > 0) {
      best = response;
      return;
    }
    if (attemptDiff < 0) return;

    if (getResponseTimestamp(response) >= getResponseTimestamp(best)) {
      best = response;
    }
  });

  return best;
}

function calculateMcOrTfScore(question, response) {
  const options = Array.isArray(question?.options) ? question.options : [];
  if (!options.length) return 0;

  const correctIndex = options.findIndex((option) => parseBooleanLike(option?.correct));
  if (correctIndex === -1) return 0;

  const selectedIndex = resolveOptionIndex(response?.answer, options);
  return selectedIndex === correctIndex ? 1 : 0;
}

function calculateMultiSelectScore(question, response, method) {
  const options = Array.isArray(question?.options) ? question.options : [];
  if (!options.length) return 0;

  const correctIndices = options
    .map((option, idx) => (parseBooleanLike(option?.correct) ? idx : -1))
    .filter((idx) => idx >= 0);
  if (!correctIndices.length) return 0;

  const selectedIndices = [...new Set(
    collectAnswerEntries(response?.answer)
      .map((entry) => resolveOptionIndex(entry, options))
      .filter((idx) => idx >= 0 && idx < options.length),
  )];

  if (method === MS_SCORING_METHODS.ALL_OR_NOTHING) {
    if (selectedIndices.length !== correctIndices.length) return 0;
    return selectedIndices.every((idx) => correctIndices.includes(idx)) ? 1 : 0;
  }

  if (method === MS_SCORING_METHODS.CORRECTNESS_RATIO) {
    const correctSet = new Set(correctIndices);
    const selectedSet = new Set(selectedIndices);

    let correctlyLabeled = 0;
    options.forEach((_, idx) => {
      const shouldSelect = correctSet.has(idx);
      const selected = selectedSet.has(idx);
      if ((shouldSelect && selected) || (!shouldSelect && !selected)) {
        correctlyLabeled += 1;
      }
    });

    return options.length > 0 ? correctlyLabeled / options.length : 0;
  }

  // Meteor-compatible default (right-minus-wrong style):
  // (2*correctSelections - totalSelections) / numberOfCorrect, clamped to [0,1].
  const correctSet = new Set(correctIndices);
  const correctSelections = selectedIndices.filter((idx) => correctSet.has(idx)).length;
  const percentage = (2 * correctSelections - selectedIndices.length) / correctIndices.length;
  if (!Number.isFinite(percentage)) return 0;
  if (percentage <= 0) return 0;
  return Math.min(1, percentage);
}

function calculateNumericalScore(question, response) {
  const expected = Number(question?.correctNumerical);
  if (!Number.isFinite(expected)) return 0;

  const toleranceRaw = Number(question?.toleranceNumerical ?? 0);
  const tolerance = Number.isFinite(toleranceRaw) ? Math.abs(toleranceRaw) : 0;
  const actual = Number(response?.answer);
  if (!Number.isFinite(actual)) return 0;

  return Math.abs(actual - expected) <= tolerance ? 1 : 0;
}

function calculateRawScore(question, response, msScoringMethod) {
  const type = getQuestionType(question);
  if (type === QUESTION_TYPES.MULTIPLE_CHOICE || type === QUESTION_TYPES.TRUE_FALSE) {
    return calculateMcOrTfScore(question, response);
  }

  if (type === QUESTION_TYPES.MULTI_SELECT) {
    return calculateMultiSelectScore(question, response, msScoringMethod);
  }

  if (type === QUESTION_TYPES.NUMERICAL) {
    return calculateNumericalScore(question, response);
  }

  return 0;
}

export function calculateResponsePoints(question, response, { msScoringMethod = DEFAULT_MS_SCORING_METHOD } = {}) {
  if (!question || !response || !responseHasContent(response)) return 0;
  if (!isQuestionAutoGradeable(getQuestionType(question))) return 0;

  const normalizedMethod = normalizeMsScoringMethod(msScoringMethod);
  const points = getQuestionPoints(question);
  if (points <= 0) return 0;

  const attemptWeight = getAttemptWeight(question, toFiniteNumber(response?.attempt, 1));
  const weightedPoints = points * attemptWeight;
  if (weightedPoints <= 0) return 0;

  const rawScore = calculateRawScore(question, response, normalizedMethod);
  return roundToThousandths(rawScore * weightedPoints);
}

function buildDefaultGrade({ studentId, courseId, sessionId, sessionName, visibleToStudents }) {
  return {
    userId: studentId,
    courseId,
    sessionId,
    name: sessionName,
    joined: false,
    participation: 0,
    value: 0,
    automatic: true,
    points: 0,
    outOf: 0,
    numAnswered: 0,
    numQuestions: 0,
    numAnsweredTotal: 0,
    numQuestionsTotal: 0,
    visibleToStudents,
    needsGrading: false,
    marks: [],
  };
}

function computeGradeValueFromPoints({ points, outOf }) {
  if (points > 0) {
    if (outOf > 0) {
      return roundToTenths((100 * points) / outOf);
    }
    return 100;
  }
  return 0;
}

export function recomputeGradeAggregates(grade) {
  const mutable = grade;
  const marks = Array.isArray(mutable.marks) ? mutable.marks : [];

  let points = 0;
  let needsGrading = false;

  marks.forEach((mark) => {
    points += toFiniteNumber(mark?.points, 0);
    if (mark?.needsGrading) needsGrading = true;
  });

  mutable.points = roundToThousandths(points);
  mutable.needsGrading = needsGrading;

  if (mutable.automatic) {
    mutable.value = computeGradeValueFromPoints({
      points: mutable.points,
      outOf: toFiniteNumber(mutable.outOf, 0),
    });
  }

  return mutable;
}

function summarizeMarksNeedingGrading(grades = []) {
  const summary = {
    students: 0,
    marks: 0,
  };

  grades.forEach((grade) => {
    let gradeMarkCount = 0;
    (grade?.marks || []).forEach((mark) => {
      if (mark?.needsGrading) {
        summary.marks += 1;
        gradeMarkCount += 1;
      }
    });
    if (gradeMarkCount > 0) summary.students += 1;
  });

  return summary;
}

function shouldExcludeQuestionForLowResponses({ question, joinedCount, questionResponseCount }) {
  if (!question) return false;
  if (joinedCount <= 0) return false;

  const configuredMaxAttempts = toFiniteNumber(question?.sessionOptions?.maxAttempts, 0);
  if (configuredMaxAttempts > 1) return false;

  const configuredAttempts = Array.isArray(question?.sessionOptions?.attempts)
    ? question.sessionOptions.attempts
    : [];
  const maxConfiguredAttempt = configuredAttempts.reduce((maxAttempt, attempt) => {
    const current = toFiniteNumber(attempt?.number, 0);
    return current > maxAttempt ? current : maxAttempt;
  }, 0);
  const effectiveMaxAttempts = Math.max(configuredMaxAttempts || 1, maxConfiguredAttempt || 1);
  const isSingleAttempt = effectiveMaxAttempts <= 1;

  if (!isSingleAttempt) return false;
  return questionResponseCount < (joinedCount * 0.1);
}

export async function setSessionGradesVisibility({ sessionId, visibleToStudents }) {
  const normalized = !!visibleToStudents;
  await Grade.updateMany(
    { sessionId: String(sessionId) },
    { $set: { visibleToStudents: normalized } }
  );
}

export async function recalculateSessionGrades({
  sessionId,
  sessionDoc = null,
  courseDoc = null,
  missingOnly = false,
  visibleToStudents = null,
} = {}) {
  let session = sessionDoc
    ? (typeof sessionDoc.toObject === 'function' ? sessionDoc.toObject() : { ...sessionDoc })
    : await Session.findById(sessionId).lean();
  if (!session) {
    throw new Error('Session not found');
  }

  const msNormalization = await ensureSessionMsScoringMethod(session);
  session = msNormalization.session || session;

  const course = courseDoc
    ? (typeof courseDoc.toObject === 'function' ? courseDoc.toObject() : { ...courseDoc })
    : await Course.findById(session.courseId).lean();
  if (!course) {
    throw new Error('Course not found');
  }

  const courseId = String(course._id);
  const normalizedSessionId = String(session._id);
  const sessionQuestionIds = Array.isArray(session.questions) ? session.questions.map((id) => String(id)) : [];

  const [questionDocs, responseDocs, existingGradeDocs, studentDocs] = await Promise.all([
    sessionQuestionIds.length > 0
      ? Question.find({ _id: { $in: sessionQuestionIds } }).lean()
      : Promise.resolve([]),
    sessionQuestionIds.length > 0
      ? Response.find({ questionId: { $in: sessionQuestionIds } }).lean()
      : Promise.resolve([]),
    Grade.find({ sessionId: normalizedSessionId, courseId }),
    Array.isArray(course.students) && course.students.length > 0
      ? User.find({ _id: { $in: course.students } }).select('_id profile emails email').lean()
      : Promise.resolve([]),
  ]);

  const questionById = new Map(
    questionDocs
      .map((question) => buildQuestionWithNormalizedOptions(question))
      .filter(Boolean)
      .map((question) => [String(question._id), question])
  );
  const orderedQuestions = sessionQuestionIds
    .map((questionId) => questionById.get(questionId))
    .filter(Boolean);

  const responsesByQuestionId = new Map();
  const latestResponseByStudentQuestion = new Map();

  responseDocs.forEach((response) => {
    const questionId = normalizeAnswerValue(response?.questionId);
    if (!questionId) return;
    const studentId = getResponseStudentId(response);
    if (!studentId) return;

    if (!responsesByQuestionId.has(questionId)) {
      responsesByQuestionId.set(questionId, []);
    }
    responsesByQuestionId.get(questionId).push(response);

    const key = `${studentId}::${questionId}`;
    const existingResponse = latestResponseByStudentQuestion.get(key);
    if (!existingResponse) {
      latestResponseByStudentQuestion.set(key, response);
      return;
    }

    const attemptDiff = toFiniteNumber(response?.attempt, 0) - toFiniteNumber(existingResponse?.attempt, 0);
    if (attemptDiff > 0) {
      latestResponseByStudentQuestion.set(key, response);
      return;
    }
    if (attemptDiff === 0 && getResponseTimestamp(response) >= getResponseTimestamp(existingResponse)) {
      latestResponseByStudentQuestion.set(key, response);
    }
  });

  const joinedSet = new Set((session.joined || []).map((userId) => String(userId)).filter(Boolean));
  const joinedCount = joinedSet.size;

  const msScoringMethod = getSessionMsScoringMethod(session);
  const visibleFlag = visibleToStudents !== null && visibleToStudents !== undefined
    ? !!visibleToStudents
    : !!session.reviewable;

  const ungradableQuestionIds = new Set();
  const lowResponseExcludedQuestionIds = new Set();

  const questionMeta = orderedQuestions.map((question) => {
    const questionId = String(question._id);
    const questionResponses = responsesByQuestionId.get(questionId) || [];
    const uniqueResponders = new Set(
      questionResponses
        .map((response) => getResponseStudentId(response))
        .filter(Boolean)
    );

    const defaultOutOf = getQuestionPoints(question);
    const excludedForLowResponse = defaultOutOf > 0 && shouldExcludeQuestionForLowResponses({
      question,
      joinedCount,
      questionResponseCount: uniqueResponders.size,
    });

    if (excludedForLowResponse) {
      lowResponseExcludedQuestionIds.add(questionId);
    }

    const outOf = excludedForLowResponse ? 0 : defaultOutOf;

    if (!isQuestionAutoGradeable(getQuestionType(question)) && outOf > 0) {
      ungradableQuestionIds.add(questionId);
    }

    return {
      question,
      questionId,
      outOf,
      excludedForLowResponse,
      isAutoGradeable: isQuestionAutoGradeable(getQuestionType(question)),
    };
  });

  const studentById = new Map(studentDocs.map((student) => [String(student._id), student]));
  const existingGradeByStudentId = new Map(existingGradeDocs.map((grade) => [String(grade.userId), grade]));

  const studentIds = Array.isArray(course.students) ? course.students.map((studentId) => String(studentId)) : [];

  let createdGradeCount = 0;
  let updatedGradeCount = 0;
  let skippedExistingCount = 0;
  const manualMarkConflicts = [];

  for (const studentId of studentIds) {
    const existingGradeDoc = existingGradeByStudentId.get(studentId) || null;

    if (missingOnly && existingGradeDoc) {
      skippedExistingCount += 1;
      continue;
    }

    const gradeSource = existingGradeDoc
      ? { ...existingGradeDoc.toObject() }
      : buildDefaultGrade({
        studentId,
        courseId,
        sessionId: normalizedSessionId,
        sessionName: session.name || '',
        visibleToStudents: visibleFlag,
      });

    const existingMarksByQuestionId = new Map(
      (Array.isArray(gradeSource.marks) ? gradeSource.marks : [])
        .map((mark) => [String(mark?.questionId || ''), mark])
    );

    const marks = [];
    let gradePoints = 0;
    let numAnswered = 0;
    let numAnsweredTotal = 0;
    let needsGrading = false;

    questionMeta.forEach(({ question, questionId, outOf, isAutoGradeable: autoGradeable }) => {
      const response = getLatestResponse([
        latestResponseByStudentQuestion.get(`${studentId}::${questionId}`),
      ].filter(Boolean));

      const hasResponse = responseHasContent(response);
      if (hasResponse) numAnsweredTotal += 1;
      if (hasResponse && outOf > 0) numAnswered += 1;

      const existingMark = existingMarksByQuestionId.get(questionId);
      const feedback = normalizeAnswerValue(existingMark?.feedback);

      const autoPoints = hasResponse && outOf > 0 && autoGradeable
        ? calculateResponsePoints(question, response, { msScoringMethod })
        : 0;

      let markPoints = autoPoints;
      let automaticMark = true;
      let markNeedsGrading = false;

      const existingMarkIsManual = existingMark?.automatic === false;

      if (existingMarkIsManual) {
        automaticMark = false;
        markPoints = toFiniteNumber(existingMark?.points, 0);
        markNeedsGrading = !!existingMark?.needsGrading;

        if (autoGradeable && Math.abs(markPoints - autoPoints) > 0.0001) {
          const student = studentById.get(studentId);
          manualMarkConflicts.push({
            gradeId: existingGradeDoc?._id ? String(existingGradeDoc._id) : '',
            studentId,
            studentName: formatUserDisplayName(student),
            questionId,
            questionType: getQuestionType(question),
            existingPoints: roundToThousandths(markPoints),
            calculatedPoints: roundToThousandths(autoPoints),
          });
        }
      } else if (!autoGradeable && hasResponse && outOf > 0) {
        markPoints = toFiniteNumber(existingMark?.points, 0);
        markNeedsGrading = true;
      }

      if (markNeedsGrading) needsGrading = true;

      marks.push({
        questionId,
        responseId: hasResponse ? String(response?._id || '') : '',
        attempt: hasResponse ? toFiniteNumber(response?.attempt, 1) : 0,
        points: roundToThousandths(markPoints),
        outOf: roundToThousandths(outOf),
        automatic: automaticMark,
        needsGrading: markNeedsGrading,
        feedback,
      });

      gradePoints += markPoints;
    });

    const numQuestions = questionMeta.filter((questionInfo) => questionInfo.outOf > 0).length;
    const outOf = roundToThousandths(
      questionMeta.reduce((sum, questionInfo) => sum + toFiniteNumber(questionInfo.outOf, 0), 0)
    );

    let participation = 0;
    if (numAnswered > 0) {
      if (numQuestions > 0) {
        participation = roundToTenths((100 * numAnswered) / numQuestions);
      } else {
        participation = 100;
      }
    }
    if (joinedSet.has(studentId) && numQuestions === 0) {
      participation = 100;
    }

    gradeSource.courseId = courseId;
    gradeSource.sessionId = normalizedSessionId;
    gradeSource.userId = studentId;
    gradeSource.name = session.name || '';
    gradeSource.joined = joinedSet.has(studentId);
    gradeSource.participation = participation;
    gradeSource.points = roundToThousandths(gradePoints);
    gradeSource.outOf = outOf;
    gradeSource.numAnswered = numAnswered;
    gradeSource.numQuestions = numQuestions;
    gradeSource.numAnsweredTotal = numAnsweredTotal;
    gradeSource.numQuestionsTotal = orderedQuestions.length;
    gradeSource.visibleToStudents = visibleFlag;
    gradeSource.needsGrading = needsGrading;
    gradeSource.marks = marks;

    // Preserve manually overridden grade values.
    if (gradeSource.automatic !== false) {
      gradeSource.automatic = true;
      gradeSource.value = computeGradeValueFromPoints({
        points: gradeSource.points,
        outOf: gradeSource.outOf,
      });
    }

    if (existingGradeDoc) {
      await Grade.updateOne(
        { _id: existingGradeDoc._id },
        {
          $set: {
            name: gradeSource.name,
            marks: gradeSource.marks,
            joined: gradeSource.joined,
            participation: gradeSource.participation,
            value: gradeSource.value,
            automatic: gradeSource.automatic,
            points: gradeSource.points,
            outOf: gradeSource.outOf,
            numAnswered: gradeSource.numAnswered,
            numQuestions: gradeSource.numQuestions,
            numAnsweredTotal: gradeSource.numAnsweredTotal,
            numQuestionsTotal: gradeSource.numQuestionsTotal,
            visibleToStudents: gradeSource.visibleToStudents,
            needsGrading: gradeSource.needsGrading,
          },
        }
      );
      updatedGradeCount += 1;
    } else {
      await Grade.create(gradeSource);
      createdGradeCount += 1;
    }
  }

  // Keep visibility synchronized for any orphaned legacy rows too.
  await Grade.updateMany(
    { sessionId: normalizedSessionId, courseId },
    { $set: { visibleToStudents: visibleFlag } }
  );

  const persistedGrades = await Grade.find({ sessionId: normalizedSessionId, courseId }).lean();
  const needsGradingSummary = summarizeMarksNeedingGrading(persistedGrades);

  const warningMessages = [];
  if (ungradableQuestionIds.size > 0) {
    warningMessages.push('Some questions cannot be auto-graded and still need manual grading.');
  }
  if (manualMarkConflicts.length > 0) {
    warningMessages.push('Some manual mark overrides differ from recalculated automatic marks and were preserved.');
  }

  return {
    session,
    course,
    grades: persistedGrades,
    summary: {
      sessionId: normalizedSessionId,
      courseId,
      missingOnly: !!missingOnly,
      createdGradeCount,
      updatedGradeCount,
      skippedExistingCount,
      totalGradeCount: persistedGrades.length,
      ungradableQuestionIds: [...ungradableQuestionIds],
      lowResponseExcludedQuestionIds: [...lowResponseExcludedQuestionIds],
      needsGradingStudents: needsGradingSummary.students,
      needsGradingMarks: needsGradingSummary.marks,
      manualMarkConflicts,
      warnings: warningMessages,
    },
  };
}

export async function getSessionUngradedSummary(sessionIds = []) {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) return {};

  const grades = await Grade.find({ sessionId: { $in: sessionIds.map((id) => String(id)) } })
    .select('sessionId marks needsGrading joined')
    .lean();

  const summaryBySessionId = {};
  sessionIds.forEach((sessionId) => {
    summaryBySessionId[String(sessionId)] = {
      studentsNeedingGrading: 0,
      marksNeedingGrading: 0,
    };
  });

  grades.forEach((grade) => {
    const sessionId = String(grade.sessionId || '');
    if (!summaryBySessionId[sessionId]) {
      summaryBySessionId[sessionId] = {
        studentsNeedingGrading: 0,
        marksNeedingGrading: 0,
      };
    }

    let markCount = 0;
    (grade.marks || []).forEach((mark) => {
      if (mark?.needsGrading) {
        markCount += 1;
      }
    });

    if (markCount > 0) {
      summaryBySessionId[sessionId].studentsNeedingGrading += 1;
      summaryBySessionId[sessionId].marksNeedingGrading += markCount;
    }
  });

  return summaryBySessionId;
}
