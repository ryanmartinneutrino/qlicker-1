"use strict";
// Zod validation schemas for all Qlicker collection types.
// Replaces Meteor check/Match patterns from imports/api/*.js
Object.defineProperty(exports, "__esModule", { value: true });
exports.userSchema = exports.userProfileSchema = exports.settingsSchema = exports.imageSchema = exports.gradeSchema = exports.responseSchema = exports.sessionSchema = exports.courseSchema = exports.questionSchema = void 0;
const zod_1 = require("zod");
// ─── Reusable primitives ─────────────────────────────────────────────────────
const mongoId = zod_1.z.string().min(1);
const nonEmptyString = zod_1.z.string().min(1);
const email = zod_1.z.string().email();
// ─── Question ────────────────────────────────────────────────────────────────
const questionOptionSchema = zod_1.z.object({
    wysiwyg: zod_1.z.boolean().optional(),
    correct: zod_1.z.boolean().optional(),
    answer: nonEmptyString.optional(),
    content: zod_1.z.string().optional(),
    plainText: zod_1.z.string().optional(),
});
const sessionOptionsSchema = zod_1.z.object({
    hidden: zod_1.z.boolean(),
    stats: zod_1.z.boolean(),
    correct: zod_1.z.boolean(),
    points: zod_1.z.number().optional(),
    maxAttempts: zod_1.z.number().optional(),
    attemptWeights: zod_1.z.array(zod_1.z.number()),
    attempts: zod_1.z.array(zod_1.z.object({ number: zod_1.z.number(), closed: zod_1.z.boolean() })),
});
const questionTagSchema = zod_1.z.object({
    value: nonEmptyString,
    label: nonEmptyString,
    className: zod_1.z.string().optional(),
});
exports.questionSchema = zod_1.z.object({
    _id: mongoId.optional(),
    plainText: zod_1.z.string(),
    type: zod_1.z.number(),
    content: zod_1.z.string(),
    options: zod_1.z.array(questionOptionSchema),
    toleranceNumerical: zod_1.z.number().optional(),
    correctNumerical: zod_1.z.number().optional(),
    creator: mongoId,
    owner: mongoId.optional(),
    originalQuestion: mongoId.optional(),
    sessionId: mongoId.optional(),
    courseId: mongoId.optional(),
    public: zod_1.z.boolean(),
    solution: zod_1.z.string().optional(),
    solution_plainText: zod_1.z.string().optional(),
    createdAt: zod_1.z.date(),
    approved: zod_1.z.boolean(),
    tags: zod_1.z.array(questionTagSchema),
    sessionOptions: sessionOptionsSchema.optional(),
    imagePath: zod_1.z.string().optional(),
    studentCopyOfPublic: zod_1.z.boolean().optional(),
});
// ─── Course ──────────────────────────────────────────────────────────────────
const videoOptionsSchema = zod_1.z.object({
    urlId: nonEmptyString,
    joined: zod_1.z.array(mongoId).optional(),
    apiOptions: zod_1.z
        .object({
        startAudioMuted: zod_1.z.boolean().optional(),
        startVideoMuted: zod_1.z.boolean().optional(),
        startTileView: zod_1.z.boolean().optional(),
        subjectTitle: nonEmptyString.optional(),
    })
        .optional(),
});
const groupSchema = zod_1.z.object({
    groupNumber: zod_1.z.number().optional(),
    groupName: nonEmptyString.optional(),
    students: zod_1.z.array(mongoId).optional(),
    joinedVideoChat: zod_1.z.array(mongoId).optional(),
    helpVideoChat: zod_1.z.boolean().optional(),
});
const groupCategorySchema = zod_1.z.object({
    categoryNumber: zod_1.z.number().optional(),
    categoryName: nonEmptyString.optional(),
    catVideoChatOptions: videoOptionsSchema.optional(),
    groups: zod_1.z.array(groupSchema).optional(),
});
exports.courseSchema = zod_1.z.object({
    _id: nonEmptyString.optional(),
    name: nonEmptyString,
    deptCode: nonEmptyString,
    courseNumber: nonEmptyString,
    section: nonEmptyString,
    owner: mongoId,
    enrollmentCode: nonEmptyString,
    semester: nonEmptyString,
    inactive: zod_1.z.boolean().optional(),
    students: zod_1.z.array(mongoId).optional(),
    instructors: zod_1.z.array(mongoId).optional(),
    sessions: zod_1.z.array(mongoId).optional(),
    createdAt: zod_1.z.date(),
    requireVerified: zod_1.z.boolean().optional(),
    allowStudentQuestions: zod_1.z.boolean().optional(),
    videoChatOptions: videoOptionsSchema.optional(),
    groupCategories: zod_1.z.array(groupCategorySchema).optional(),
});
// ─── Session ─────────────────────────────────────────────────────────────────
const quizExtensionSchema = zod_1.z.object({
    userId: mongoId,
    quizStart: zod_1.z.date().nullable().optional(),
    quizEnd: zod_1.z.date().nullable().optional(),
});
exports.sessionSchema = zod_1.z.object({
    _id: mongoId.optional(),
    name: nonEmptyString,
    description: zod_1.z.string(),
    courseId: mongoId,
    status: nonEmptyString,
    quiz: zod_1.z.boolean(),
    practiceQuiz: zod_1.z.boolean().optional(),
    date: zod_1.z.date().nullable().optional(),
    quizStart: zod_1.z.date().nullable().optional(),
    quizEnd: zod_1.z.date().nullable().optional(),
    quizExtensions: zod_1.z.array(quizExtensionSchema).optional(),
    questions: zod_1.z.array(mongoId.nullable()).optional(),
    createdAt: zod_1.z.date(),
    currentQuestion: mongoId.optional(),
    joined: zod_1.z.array(mongoId.nullable()).optional(),
    submittedQuiz: zod_1.z.array(mongoId.nullable()).optional(),
    tags: zod_1.z.array(questionTagSchema).optional(),
    reviewable: zod_1.z.boolean().optional(),
});
// ─── Response ────────────────────────────────────────────────────────────────
exports.responseSchema = zod_1.z.object({
    _id: mongoId.optional(),
    attempt: zod_1.z.number(),
    questionId: mongoId,
    studentUserId: mongoId,
    answer: zod_1.z.union([nonEmptyString, zod_1.z.array(nonEmptyString)]),
    answerWysiwyg: zod_1.z.string().optional(),
    correct: zod_1.z.boolean().optional(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date().optional(),
    editable: zod_1.z.boolean().optional(),
});
// ─── Grade ───────────────────────────────────────────────────────────────────
const markSchema = zod_1.z.object({
    questionId: nonEmptyString.optional(),
    responseId: nonEmptyString.optional(),
    attempt: zod_1.z.number().optional(),
    points: zod_1.z.number().optional(),
    outOf: zod_1.z.number().optional(),
    automatic: zod_1.z.boolean().optional(),
    needsGrading: zod_1.z.boolean().optional(),
    feedback: zod_1.z.string().optional(),
});
exports.gradeSchema = zod_1.z.object({
    _id: nonEmptyString.optional(),
    userId: nonEmptyString,
    courseId: nonEmptyString.optional(),
    sessionId: nonEmptyString.optional(),
    name: zod_1.z.string().optional(),
    marks: zod_1.z.array(markSchema).optional(),
    joined: zod_1.z.boolean().optional(),
    participation: zod_1.z.number().optional(),
    value: zod_1.z.number().optional(),
    automatic: zod_1.z.boolean().optional(),
    points: zod_1.z.number().optional(),
    outOf: zod_1.z.number().optional(),
    numAnswered: zod_1.z.number().optional(),
    numQuestions: zod_1.z.number().optional(),
    numAnsweredTotal: zod_1.z.number().optional(),
    numQuestionsTotal: zod_1.z.number().optional(),
    visibleToStudents: zod_1.z.boolean().optional(),
    needsGrading: zod_1.z.boolean().optional(),
});
// ─── Image ───────────────────────────────────────────────────────────────────
exports.imageSchema = zod_1.z.object({
    _id: mongoId.optional(),
    url: zod_1.z.string(),
    UID: zod_1.z.string(),
});
// ─── Settings ────────────────────────────────────────────────────────────────
exports.settingsSchema = zod_1.z.object({
    _id: nonEmptyString,
    restrictDomain: zod_1.z.boolean(),
    allowedDomains: zod_1.z.array(nonEmptyString),
    maxImageSize: zod_1.z.number(),
    maxImageWidth: zod_1.z.number(),
    email: email,
    requireVerified: zod_1.z.boolean(),
    storageType: zod_1.z.string().optional(),
    AWS_bucket: zod_1.z.string().optional(),
    AWS_region: zod_1.z.string().optional(),
    AWS_accessKey: zod_1.z.string().optional(),
    AWS_secret: zod_1.z.string().optional(),
    Azure_accountName: zod_1.z.string().optional(),
    Azure_accountKey: zod_1.z.string().optional(),
    Azure_containerName: zod_1.z.string().optional(),
    SSO_enabled: zod_1.z.boolean().optional(),
    SSO_entrypoint: zod_1.z.string().optional(),
    SSO_logoutUrl: zod_1.z.string().optional(),
    SSO_EntityId: zod_1.z.string().optional(),
    SSO_cert: zod_1.z.string().optional(),
    SSO_privCert: zod_1.z.string().optional(),
    SSO_privKey: zod_1.z.string().optional(),
    SSO_identifierFormat: zod_1.z.string().optional(),
    SSO_emailIdentifier: zod_1.z.string().optional(),
    SSO_firstNameIdentifier: zod_1.z.string().optional(),
    SSO_lastNameIdentifier: zod_1.z.string().optional(),
    SSO_institutionName: zod_1.z.string().optional(),
    SSO_roleIdentifier: zod_1.z.string().optional(),
    SSO_studentNumberIdentifier: zod_1.z.string().optional(),
    SSO_roleProfName: zod_1.z.string().optional(),
    Jitsi_Enabled: zod_1.z.boolean().optional(),
    Jitsi_Domain: zod_1.z.string().optional(),
    Jitsi_EnabledCourses: zod_1.z.array(nonEmptyString).optional(),
    Jitsi_WhiteboardDomain: zod_1.z.string().optional(),
    Jitsi_EtherpadDomain: zod_1.z.string().optional(),
});
// ─── User ────────────────────────────────────────────────────────────────────
exports.userProfileSchema = zod_1.z.object({
    firstname: zod_1.z.string(),
    lastname: zod_1.z.string(),
    profileImage: zod_1.z.string().optional(),
    profileThumbnail: zod_1.z.string().optional(),
    roles: zod_1.z.array(zod_1.z.string()),
    canPromote: zod_1.z.boolean().optional(),
    courses: zod_1.z.array(zod_1.z.string()).optional(),
    studentNumber: zod_1.z.string().optional(),
});
exports.userSchema = zod_1.z.object({
    _id: mongoId.optional(),
    emails: zod_1.z
        .array(zod_1.z.object({ address: zod_1.z.string().email(), verified: zod_1.z.boolean() }))
        .optional(),
    profile: exports.userProfileSchema,
    services: zod_1.z
        .object({
        password: zod_1.z.object({ bcrypt: zod_1.z.string() }).optional(),
        sso: zod_1.z
            .object({
            nameID: zod_1.z.string().optional(),
            sessionIndex: zod_1.z.string().optional(),
            sessions: zod_1.z.array(zod_1.z.string()).optional(),
        })
            .optional(),
    })
        .optional(),
    createdAt: zod_1.z.date().optional(),
});
//# sourceMappingURL=validation.js.map