export const QUESTION_TYPE = {
  MC: 0,
  TF: 1,
  SA: 2,
  MS: 3,
  NU: 4,
} as const

export const QUESTION_TYPE_LABELS: Record<number, string> = {
  [QUESTION_TYPE.MC]: 'Multiple Choice',
  [QUESTION_TYPE.TF]: 'True/False',
  [QUESTION_TYPE.SA]: 'Short Answer',
  [QUESTION_TYPE.MS]: 'Multi-Select',
  [QUESTION_TYPE.NU]: 'Numerical',
}

export type QuestionTypeValue = (typeof QUESTION_TYPE)[keyof typeof QUESTION_TYPE]
