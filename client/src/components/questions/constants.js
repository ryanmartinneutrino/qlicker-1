export const QUESTION_TYPES = {
  SHORT_ANSWER: 1,
  MULTIPLE_CHOICE: 2,
  TRUE_FALSE: 3,
  MULTI_SELECT: 4,
  NUMERICAL: 5,
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
 * Normalize legacy Meteor question type values to the current UI enum.
 * Handles mixed datasets where existing documents may use old numeric values.
 */
export function normalizeQuestionType(question = {}) {
  const rawType = Number(question?.type);
  const options = question?.options || [];
  const hasNumerical = question?.correctNumerical !== undefined && question?.correctNumerical !== null;
  const correctCount = countCorrect(options);

  // Explicit legacy-only code.
  if (rawType === 0) return QUESTION_TYPES.MULTIPLE_CHOICE;

  // Ambiguous values (legacy + new):
  // 1: legacy TF, new SA
  // 2: legacy SA, new MC
  // 3: legacy MS, new TF
  // 4: legacy NUM, new MS
  if (rawType === 1) {
    if (isTrueFalseOptions(options)) return QUESTION_TYPES.TRUE_FALSE;
    return QUESTION_TYPES.SHORT_ANSWER;
  }

  if (rawType === 2) {
    if (options.length > 1) return QUESTION_TYPES.MULTIPLE_CHOICE;
    return QUESTION_TYPES.SHORT_ANSWER;
  }

  if (rawType === 3) {
    if (isTrueFalseOptions(options) && correctCount <= 1) return QUESTION_TYPES.TRUE_FALSE;
    return QUESTION_TYPES.MULTI_SELECT;
  }

  if (rawType === 4) {
    if (hasNumerical || options.length <= 1) return QUESTION_TYPES.NUMERICAL;
    return QUESTION_TYPES.MULTI_SELECT;
  }

  if (rawType === 5) return QUESTION_TYPES.NUMERICAL;
  if (Object.values(QUESTION_TYPES).includes(rawType)) return rawType;

  // Last-resort fallback for malformed records.
  if (hasNumerical) return QUESTION_TYPES.NUMERICAL;
  if (isTrueFalseOptions(options)) return QUESTION_TYPES.TRUE_FALSE;
  if (correctCount > 1) return QUESTION_TYPES.MULTI_SELECT;
  if (options.length > 1) return QUESTION_TYPES.MULTIPLE_CHOICE;
  return QUESTION_TYPES.SHORT_ANSWER;
}
