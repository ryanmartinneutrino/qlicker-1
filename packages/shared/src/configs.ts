// Shared configuration constants, migrated from imports/configs.js

export enum QuestionType {
  MC = 0,
  TF = 1,
  SA = 2,
  MS = 3,
  NU = 4,
}

export enum UserRole {
  student = 'student',
  prof = 'professor',
  admin = 'admin',
}

export enum SessionStatus {
  hidden = 'hidden',
  visible = 'visible',
  running = 'running',
  done = 'done',
}

export const QUESTION_TYPE_STRINGS = [
  'Multiple Choice',
  'True/False',
  'Short Answer',
  'Multi Select',
  'Numerical',
]

export const QUESTION_TYPE_STRINGS_SHORT = ['MC', 'TF', 'SA', 'MS', 'NU']

export const MC_ORDER = ['A', 'B', 'C', 'D', 'E', 'F']
export const TF_ORDER = ['TRUE', 'FALSE']
export const SA_ORDER = ['ANSWER']

export const SESSION_STATUS_STRINGS: Record<string, string> = {
  hidden: 'Draft',
  visible: 'Upcoming',
  running: '• Live',
  done: 'Ended',
  submitted: 'Submitted',
}

/** Whether or not a question type can be automatically graded */
export function isAutoGradeable(type: QuestionType): boolean {
  switch (type) {
    case QuestionType.MC:
      return true
    case QuestionType.TF:
      return true
    case QuestionType.SA:
      return false
    case QuestionType.MS:
      return true
    case QuestionType.NU:
      return true
    default:
      return false
  }
}
