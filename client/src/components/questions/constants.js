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

  if (rawType === QUESTION_TYPES.NUMERICAL || hasNumerical) return QUESTION_TYPES.NUMERICAL;
  if (rawType === 0) return QUESTION_TYPES.MULTIPLE_CHOICE;

  if (rawType === 1) {
    return isTrueFalseOptions(options) ? QUESTION_TYPES.TRUE_FALSE : QUESTION_TYPES.SHORT_ANSWER;
  }

  if (rawType === 2) {
    if (options.length <= 1) return QUESTION_TYPES.SHORT_ANSWER;
    return QUESTION_TYPES.MULTIPLE_CHOICE;
  }

  if (rawType === 3) {
    const correctCount = countCorrect(options);
    if (correctCount > 1) return QUESTION_TYPES.MULTI_SELECT;
    return isTrueFalseOptions(options) ? QUESTION_TYPES.TRUE_FALSE : QUESTION_TYPES.MULTI_SELECT;
  }

  if (rawType === 4) return QUESTION_TYPES.MULTI_SELECT;

  if (Object.values(QUESTION_TYPES).includes(rawType)) return rawType;
  return QUESTION_TYPES.SHORT_ANSWER;
}
