export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 0,
  TRUE_FALSE: 1,
  SHORT_ANSWER: 2,
  MULTI_SELECT: 3,
  NUMERICAL: 4,
};

export const TYPE_LABELS = {
  [QUESTION_TYPES.SHORT_ANSWER]: 'Short Answer',
  [QUESTION_TYPES.MULTIPLE_CHOICE]: 'Multiple Choice',
  [QUESTION_TYPES.TRUE_FALSE]: 'True/False',
  [QUESTION_TYPES.MULTI_SELECT]: 'Multi-Select',
  [QUESTION_TYPES.NUMERICAL]: 'Numerical',
};

export const TYPE_COLORS = {
  [QUESTION_TYPES.SHORT_ANSWER]: 'default',
  [QUESTION_TYPES.MULTIPLE_CHOICE]: 'primary',
  [QUESTION_TYPES.TRUE_FALSE]: 'secondary',
  [QUESTION_TYPES.MULTI_SELECT]: 'info',
  [QUESTION_TYPES.NUMERICAL]: 'warning',
};

function isTrueFalseOptions(options = []) {
  if (!Array.isArray(options) || options.length !== 2) return false;
  const labels = options.map((o) => (o?.answer || o?.plainText || o?.content || '').replace(/<[^>]*>/g, '').trim().toUpperCase());
  return labels.includes('TRUE') && labels.includes('FALSE');
}

function countCorrect(options = []) {
  return options.filter((o) => !!o?.correct).length;
}

/**
 * Normalize question type values.
 * Canonical mapping follows Meteor app configs:
 * MC=0, TF=1, SA=2, MS=3, NU=4.
 */
export function normalizeQuestionType(question = {}) {
  const rawType = Number(question?.type);
  const options = question?.options || [];
  const hasNumerical = question?.correctNumerical !== undefined && question?.correctNumerical !== null;
  const correctCount = countCorrect(options);
  if (Object.values(QUESTION_TYPES).includes(rawType)) return rawType;
  // Compatibility for any docs written with a 1..5 enum where 5 represented numerical.
  if (rawType === 5) return QUESTION_TYPES.NUMERICAL;

  // Last-resort fallback for malformed records.
  if (hasNumerical) return QUESTION_TYPES.NUMERICAL;
  if (isTrueFalseOptions(options)) return QUESTION_TYPES.TRUE_FALSE;
  if (correctCount > 1) return QUESTION_TYPES.MULTI_SELECT;
  if (options.length > 1) return QUESTION_TYPES.MULTIPLE_CHOICE;
  return QUESTION_TYPES.SHORT_ANSWER;
}
