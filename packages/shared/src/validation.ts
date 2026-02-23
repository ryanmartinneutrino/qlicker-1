// Zod validation schemas for all Qlicker collection types.
// Replaces Meteor check/Match patterns from imports/api/*.js

import { z } from 'zod'

// ─── Reusable primitives ─────────────────────────────────────────────────────

const mongoId = z.string().min(1)
const nonEmptyString = z.string().min(1)
const email = z.string().email()

// ─── Question ────────────────────────────────────────────────────────────────

const questionOptionSchema = z.object({
  wysiwyg: z.boolean().optional(),
  correct: z.boolean().optional(),
  answer: nonEmptyString.optional(),
  content: z.string().optional(),
  plainText: z.string().optional(),
})

const sessionOptionsSchema = z.object({
  hidden: z.boolean(),
  stats: z.boolean(),
  correct: z.boolean(),
  points: z.number().optional(),
  maxAttempts: z.number().optional(),
  attemptWeights: z.array(z.number()),
  attempts: z.array(z.object({ number: z.number(), closed: z.boolean() })),
})

const questionTagSchema = z.object({
  value: nonEmptyString,
  label: nonEmptyString,
  className: z.string().optional(),
})

export const questionSchema = z.object({
  _id: mongoId.optional(),
  plainText: z.string(),
  type: z.number(),
  content: z.string(),
  options: z.array(questionOptionSchema),
  toleranceNumerical: z.number().optional(),
  correctNumerical: z.number().optional(),
  creator: mongoId,
  owner: mongoId.optional(),
  originalQuestion: mongoId.optional(),
  sessionId: mongoId.optional(),
  courseId: mongoId.optional(),
  public: z.boolean(),
  solution: z.string().optional(),
  solution_plainText: z.string().optional(),
  createdAt: z.date(),
  approved: z.boolean(),
  tags: z.array(questionTagSchema),
  sessionOptions: sessionOptionsSchema.optional(),
  imagePath: z.string().optional(),
  studentCopyOfPublic: z.boolean().optional(),
})

// ─── Course ──────────────────────────────────────────────────────────────────

const videoOptionsSchema = z.object({
  urlId: nonEmptyString,
  joined: z.array(mongoId).optional(),
  apiOptions: z
    .object({
      startAudioMuted: z.boolean().optional(),
      startVideoMuted: z.boolean().optional(),
      startTileView: z.boolean().optional(),
      subjectTitle: nonEmptyString.optional(),
    })
    .optional(),
})

const groupSchema = z.object({
  groupNumber: z.number().optional(),
  groupName: nonEmptyString.optional(),
  students: z.array(mongoId).optional(),
  joinedVideoChat: z.array(mongoId).optional(),
  helpVideoChat: z.boolean().optional(),
})

const groupCategorySchema = z.object({
  categoryNumber: z.number().optional(),
  categoryName: nonEmptyString.optional(),
  catVideoChatOptions: videoOptionsSchema.optional(),
  groups: z.array(groupSchema).optional(),
})

export const courseSchema = z.object({
  _id: nonEmptyString.optional(),
  name: nonEmptyString,
  deptCode: nonEmptyString,
  courseNumber: nonEmptyString,
  section: nonEmptyString,
  owner: mongoId,
  enrollmentCode: nonEmptyString,
  semester: nonEmptyString,
  inactive: z.boolean().optional(),
  students: z.array(mongoId).optional(),
  instructors: z.array(mongoId).optional(),
  sessions: z.array(mongoId).optional(),
  createdAt: z.date(),
  requireVerified: z.boolean().optional(),
  allowStudentQuestions: z.boolean().optional(),
  videoChatOptions: videoOptionsSchema.optional(),
  groupCategories: z.array(groupCategorySchema).optional(),
})

// ─── Session ─────────────────────────────────────────────────────────────────

const quizExtensionSchema = z.object({
  userId: mongoId,
  quizStart: z.date().nullable().optional(),
  quizEnd: z.date().nullable().optional(),
})

export const sessionSchema = z.object({
  _id: mongoId.optional(),
  name: nonEmptyString,
  description: z.string(),
  courseId: mongoId,
  status: nonEmptyString,
  quiz: z.boolean(),
  practiceQuiz: z.boolean().optional(),
  date: z.date().nullable().optional(),
  quizStart: z.date().nullable().optional(),
  quizEnd: z.date().nullable().optional(),
  quizExtensions: z.array(quizExtensionSchema).optional(),
  questions: z.array(mongoId.nullable()).optional(),
  createdAt: z.date(),
  currentQuestion: mongoId.optional(),
  joined: z.array(mongoId.nullable()).optional(),
  submittedQuiz: z.array(mongoId.nullable()).optional(),
  tags: z.array(questionTagSchema).optional(),
  reviewable: z.boolean().optional(),
})

// ─── Response ────────────────────────────────────────────────────────────────

export const responseSchema = z.object({
  _id: mongoId.optional(),
  attempt: z.number(),
  questionId: mongoId,
  studentUserId: mongoId,
  answer: z.union([nonEmptyString, z.array(nonEmptyString)]),
  answerWysiwyg: z.string().optional(),
  correct: z.boolean().optional(),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
  editable: z.boolean().optional(),
})

// ─── Grade ───────────────────────────────────────────────────────────────────

const markSchema = z.object({
  questionId: nonEmptyString.optional(),
  responseId: nonEmptyString.optional(),
  attempt: z.number().optional(),
  points: z.number().optional(),
  outOf: z.number().optional(),
  automatic: z.boolean().optional(),
  needsGrading: z.boolean().optional(),
  feedback: z.string().optional(),
})

export const gradeSchema = z.object({
  _id: nonEmptyString.optional(),
  userId: nonEmptyString,
  courseId: nonEmptyString.optional(),
  sessionId: nonEmptyString.optional(),
  name: z.string().optional(),
  marks: z.array(markSchema).optional(),
  joined: z.boolean().optional(),
  participation: z.number().optional(),
  value: z.number().optional(),
  automatic: z.boolean().optional(),
  points: z.number().optional(),
  outOf: z.number().optional(),
  numAnswered: z.number().optional(),
  numQuestions: z.number().optional(),
  numAnsweredTotal: z.number().optional(),
  numQuestionsTotal: z.number().optional(),
  visibleToStudents: z.boolean().optional(),
  needsGrading: z.boolean().optional(),
})

// ─── Image ───────────────────────────────────────────────────────────────────

export const imageSchema = z.object({
  _id: mongoId.optional(),
  url: z.string(),
  UID: z.string(),
})

// ─── Settings ────────────────────────────────────────────────────────────────

export const settingsSchema = z.object({
  _id: nonEmptyString,
  restrictDomain: z.boolean(),
  allowedDomains: z.array(nonEmptyString),
  maxImageSize: z.number(),
  maxImageWidth: z.number(),
  email: email,
  requireVerified: z.boolean(),
  storageType: z.string().optional(),
  AWS_bucket: z.string().optional(),
  AWS_region: z.string().optional(),
  AWS_accessKey: z.string().optional(),
  AWS_secret: z.string().optional(),
  Azure_accountName: z.string().optional(),
  Azure_accountKey: z.string().optional(),
  Azure_containerName: z.string().optional(),
  SSO_enabled: z.boolean().optional(),
  SSO_entrypoint: z.string().optional(),
  SSO_logoutUrl: z.string().optional(),
  SSO_EntityId: z.string().optional(),
  SSO_cert: z.string().optional(),
  SSO_privCert: z.string().optional(),
  SSO_privKey: z.string().optional(),
  SSO_identifierFormat: z.string().optional(),
  SSO_emailIdentifier: z.string().optional(),
  SSO_firstNameIdentifier: z.string().optional(),
  SSO_lastNameIdentifier: z.string().optional(),
  SSO_institutionName: z.string().optional(),
  SSO_roleIdentifier: z.string().optional(),
  SSO_studentNumberIdentifier: z.string().optional(),
  SSO_roleProfName: z.string().optional(),
  Jitsi_Enabled: z.boolean().optional(),
  Jitsi_Domain: z.string().optional(),
  Jitsi_EnabledCourses: z.array(nonEmptyString).optional(),
  Jitsi_WhiteboardDomain: z.string().optional(),
  Jitsi_EtherpadDomain: z.string().optional(),
})

// ─── User ────────────────────────────────────────────────────────────────────

export const userProfileSchema = z.object({
  firstname: z.string(),
  lastname: z.string(),
  profileImage: z.string().optional(),
  profileThumbnail: z.string().optional(),
  roles: z.array(z.string()),
  canPromote: z.boolean().optional(),
  courses: z.array(z.string()).optional(),
  studentNumber: z.string().optional(),
})

export const userSchema = z.object({
  _id: mongoId.optional(),
  emails: z
    .array(z.object({ address: z.string().email(), verified: z.boolean() }))
    .optional(),
  profile: userProfileSchema,
  services: z
    .object({
      password: z.object({ bcrypt: z.string() }).optional(),
      emailVerification: z
        .object({
          token: z.string().optional(),
          expiresAt: z.date().optional(),
          requestedAt: z.date().optional(),
        })
        .optional(),
      sso: z
        .object({
          nameID: z.string().optional(),
          sessionIndex: z.string().optional(),
          sessions: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  createdAt: z.date().optional(),
})

// ─── Re-export inferred types ────────────────────────────────────────────────

export type QuestionSchema = z.infer<typeof questionSchema>
export type CourseSchema = z.infer<typeof courseSchema>
export type SessionSchema = z.infer<typeof sessionSchema>
export type ResponseSchema = z.infer<typeof responseSchema>
export type GradeSchema = z.infer<typeof gradeSchema>
export type ImageSchema = z.infer<typeof imageSchema>
export type SettingsSchema = z.infer<typeof settingsSchema>
export type UserSchema = z.infer<typeof userSchema>
