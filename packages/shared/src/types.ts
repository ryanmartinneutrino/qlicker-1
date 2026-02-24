import { QuestionType } from './configs'

// Shared TypeScript interfaces for all Qlicker collections.
// Migrated from the *Pattern objects in imports/api/*.js

// ─── Question ───────────────────────────────────────────────────────────────

export interface QuestionOption {
  wysiwyg?: boolean
  correct?: boolean
  answer?: string
  content?: string
  plainText?: string
}

export interface SessionOptions {
  hidden: boolean
  stats: boolean
  correct: boolean
  points?: number
  maxAttempts?: number
  attemptWeights: number[]
  attempts: { number: number; closed: boolean }[]
}

export interface QuestionTag {
  value: string
  label: string
  className?: string
}

export interface Question {
  _id?: string
  plainText: string
  type: QuestionType
  content: string
  options: QuestionOption[]
  toleranceNumerical?: number
  correctNumerical?: number
  creator: string
  owner?: string
  originalQuestion?: string
  sessionId?: string
  courseId?: string
  public: boolean
  solution?: string
  solution_plainText?: string
  createdAt: Date
  approved: boolean
  tags: QuestionTag[]
  sessionOptions?: SessionOptions
  imagePath?: string
  studentCopyOfPublic?: boolean
}

// ─── Course ──────────────────────────────────────────────────────────────────

export interface VideoOptions {
  urlId: string
  joined?: string[]
  apiOptions?: {
    startAudioMuted?: boolean
    startVideoMuted?: boolean
    startTileView?: boolean
    subjectTitle?: string
  }
}

export interface Group {
  groupNumber?: number
  groupName?: string
  students?: string[]
  joinedVideoChat?: string[]
  helpVideoChat?: boolean
}

export interface GroupCategory {
  categoryNumber?: number
  categoryName?: string
  catVideoChatOptions?: VideoOptions
  groups?: Group[]
}

export interface Course {
  _id?: string
  name: string
  deptCode: string
  courseNumber: string
  section: string
  owner: string
  enrollmentCode: string
  semester: string
  inactive?: boolean
  students?: string[]
  instructors?: string[]
  sessions?: string[]
  createdAt: Date
  requireVerified?: boolean
  allowStudentQuestions?: boolean
  videoChatOptions?: VideoOptions
  groupCategories?: GroupCategory[]
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface QuizExtension {
  userId: string
  quizStart?: Date | null
  quizEnd?: Date | null
}

export interface Session {
  _id?: string
  name: string
  description: string
  courseId: string
  status: string
  quiz: boolean
  practiceQuiz?: boolean
  date?: Date | null
  quizStart?: Date | null
  quizEnd?: Date | null
  quizExtensions?: QuizExtension[]
  questions?: (string | null)[]
  createdAt: Date
  currentQuestion?: string
  joined?: (string | null)[]
  submittedQuiz?: (string | null)[]
  tags?: QuestionTag[]
  reviewable?: boolean
}

// ─── Response ────────────────────────────────────────────────────────────────

export interface Response {
  _id?: string
  attempt: number
  questionId: string
  studentUserId: string
  answer: string | string[]
  answerWysiwyg?: string
  correct?: boolean
  createdAt: Date
  updatedAt?: Date
  editable?: boolean
}

// ─── Grade ───────────────────────────────────────────────────────────────────

export interface Mark {
  questionId?: string
  responseId?: string
  attempt?: number
  points?: number
  outOf?: number
  automatic?: boolean
  needsGrading?: boolean
  feedback?: string
}

export interface Grade {
  _id?: string
  userId: string
  courseId?: string
  sessionId?: string
  name?: string
  marks?: Mark[]
  joined?: boolean
  participation?: number
  value?: number
  automatic?: boolean
  points?: number
  outOf?: number
  numAnswered?: number
  numQuestions?: number
  numAnsweredTotal?: number
  numQuestionsTotal?: number
  visibleToStudents?: boolean
  needsGrading?: boolean
}

// ─── Image ───────────────────────────────────────────────────────────────────

export interface Image {
  _id?: string
  url: string
  UID: string
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  _id: string
  restrictDomain: boolean
  allowedDomains: string[]
  maxImageSize: number
  maxImageWidth: number
  email: string
  requireVerified: boolean
  storageType?: string
  AWS_bucket?: string
  AWS_region?: string
  AWS_accessKey?: string
  AWS_secret?: string
  Azure_accountName?: string
  Azure_accountKey?: string
  Azure_containerName?: string
  SSO_enabled?: boolean
  SSO_entrypoint?: string
  SSO_logoutUrl?: string
  SSO_EntityId?: string
  SSO_cert?: string
  SSO_privCert?: string
  SSO_privKey?: string
  SSO_identifierFormat?: string
  SSO_emailIdentifier?: string
  SSO_firstNameIdentifier?: string
  SSO_lastNameIdentifier?: string
  SSO_institutionName?: string
  SSO_roleIdentifier?: string
  SSO_studentNumberIdentifier?: string
  SSO_roleProfName?: string
  Jitsi_Enabled?: boolean
  Jitsi_Domain?: string
  Jitsi_EnabledCourses?: string[]
  Jitsi_WhiteboardDomain?: string
  Jitsi_EtherpadDomain?: string
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  firstname: string
  lastname: string
  profileImage?: string
  profileThumbnail?: string
  roles: string[]
  canPromote?: boolean
  courses?: string[]
  studentNumber?: string
}

export interface User {
  _id?: string
  emails?: { address: string; verified: boolean }[]
  profile: UserProfile
  services?: {
    password?: { bcrypt: string }
    emailVerification?: {
      token?: string
      expiresAt?: Date
      requestedAt?: Date
    }
    sso?: {
      nameID?: string
      sessionIndex?: string
      sessions?: string[]
    }
  }
  createdAt?: Date
}
