"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const responses_1 = require("../collections/responses");
const questions_1 = require("../collections/questions");
const sessions_1 = require("../collections/sessions");
const courses_1 = require("../collections/courses");
const middleware_1 = require("../auth/middleware");
const rate_limit_1 = require("../middleware/rate-limit");
const shared_1 = require("@qlicker/shared");
const router = (0, express_1.Router)();
/** GET /api/responses?questionId=... — get responses for a question */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const { questionId } = req.query;
        if (!questionId)
            return res.status(400).json({ error: 'questionId required.' });
        const responses = (0, responses_1.getResponses)();
        const questions = (0, questions_1.getQuestions)();
        const question = await questions.findOne({ _id: questionId });
        if (!question)
            return res.status(404).json({ error: 'Question not found.' });
        const isAdmin = user.profile.roles.includes('admin');
        let isInstructor = false;
        if (question.sessionId) {
            const sessions = (0, sessions_1.getSessions)();
            const session = await sessions.findOne({ _id: question.sessionId });
            if (session) {
                const courses = (0, courses_1.getCourses)();
                const course = await courses.findOne({ _id: session.courseId });
                if (course) {
                    isInstructor = course.instructors?.includes(user._id ?? '') ?? false;
                }
            }
        }
        if (isAdmin || isInstructor) {
            const result = await responses.find({ questionId }).toArray();
            return res.json(result);
        }
        // Students: show own response, and if stats is enabled, show others without studentUserId
        const statsEnabled = question.sessionOptions?.stats ?? false;
        if (statsEnabled) {
            const all = await responses.find({ questionId }).toArray();
            const sanitized = all.map((r) => {
                if (r.studentUserId === user._id)
                    return r;
                const { studentUserId: _omit, ...rest } = r;
                return rest;
            });
            return res.json(sanitized);
        }
        const own = await responses.find({ questionId, studentUserId: user._id }).toArray();
        res.json(own);
    }
    catch (err) {
        next(err);
    }
});
/** POST /api/responses — submit a response */
router.post('/', middleware_1.requireAuth, rate_limit_1.responseLimiter, async (req, res, next) => {
    try {
        const user = req.user;
        const parsed = shared_1.responseSchema.omit({ _id: true, createdAt: true }).safeParse({
            ...req.body,
            studentUserId: user._id,
        });
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        const responses = (0, responses_1.getResponses)();
        // Upsert: one response per (questionId, studentUserId, attempt)
        const filter = {
            questionId: parsed.data.questionId,
            studentUserId: parsed.data.studentUserId,
            attempt: parsed.data.attempt,
        };
        const existing = await responses.findOne(filter);
        if (existing) {
            await responses.updateOne(filter, { $set: { ...parsed.data, updatedAt: new Date() } });
            const updated = await responses.findOne(filter);
            return res.json(updated);
        }
        const result = await responses.insertOne({ ...parsed.data, createdAt: new Date() });
        const created = await responses.findOne({ _id: result.insertedId });
        res.status(201).json(created);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/responses/:responseId — update a response */
router.put('/:responseId', middleware_1.requireAuth, rate_limit_1.responseLimiter, async (req, res, next) => {
    try {
        const user = req.user;
        const responses = (0, responses_1.getResponses)();
        const existing = await responses.findOne({ _id: req.params.responseId });
        if (!existing)
            return res.status(404).json({ error: 'Response not found.' });
        if (existing.studentUserId !== user._id && !user.profile.roles.includes('admin')) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        const parsed = shared_1.responseSchema.partial().safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        await responses.updateOne({ _id: req.params.responseId }, { $set: { ...parsed.data, updatedAt: new Date() } });
        const updated = await responses.findOne({ _id: req.params.responseId });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=responses.js.map