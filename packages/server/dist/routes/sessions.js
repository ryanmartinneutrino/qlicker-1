"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sessions_1 = require("../collections/sessions");
const courses_1 = require("../collections/courses");
const middleware_1 = require("../auth/middleware");
const shared_1 = require("@qlicker/shared");
const router = (0, express_1.Router)();
/** GET /api/sessions?courseId=... */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { courseId } = req.query;
        const user = req.user;
        const sessions = (0, sessions_1.getSessions)();
        const query = {};
        if (courseId)
            query.courseId = courseId;
        const result = await sessions.find(query).toArray();
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
/** GET /api/sessions/:sessionId */
router.get('/:sessionId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const sessions = (0, sessions_1.getSessions)();
        const session = await sessions.findOne({ _id: req.params.sessionId });
        if (!session)
            return res.status(404).json({ error: 'Session not found.' });
        res.json(session);
    }
    catch (err) {
        next(err);
    }
});
/** POST /api/sessions — create session */
router.post('/', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const user = req.user;
        const parsed = shared_1.sessionSchema.omit({ _id: true, createdAt: true }).safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        const sessions = (0, sessions_1.getSessions)();
        const doc = { ...parsed.data, createdAt: new Date() };
        const result = await sessions.insertOne(doc);
        const created = await sessions.findOne({ _id: result.insertedId });
        // Add session to course
        if (parsed.data.courseId) {
            const courses = (0, courses_1.getCourses)();
            await courses.updateOne({ _id: parsed.data.courseId }, { $addToSet: { sessions: result.insertedId.toString() } });
        }
        res.status(201).json(created);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/sessions/:sessionId — update session */
router.put('/:sessionId', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const sessions = (0, sessions_1.getSessions)();
        const parsed = shared_1.sessionSchema.partial().safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        await sessions.updateOne({ _id: req.params.sessionId }, { $set: parsed.data });
        const updated = await sessions.findOne({ _id: req.params.sessionId });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/** DELETE /api/sessions/:sessionId */
router.delete('/:sessionId', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const sessions = (0, sessions_1.getSessions)();
        await sessions.deleteOne({ _id: req.params.sessionId });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/sessions/:sessionId/status — change session status */
router.put('/:sessionId/status', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const { status } = req.body;
        const validStatuses = ['hidden', 'visible', 'running', 'done'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }
        const sessions = (0, sessions_1.getSessions)();
        await sessions.updateOne({ _id: req.params.sessionId }, { $set: { status } });
        res.json({ success: true, status });
    }
    catch (err) {
        next(err);
    }
});
/** POST /api/sessions/:sessionId/submit — student submits quiz */
router.post('/:sessionId/submit', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const sessions = (0, sessions_1.getSessions)();
        await sessions.updateOne({ _id: req.params.sessionId }, { $addToSet: { submittedQuiz: user._id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=sessions.js.map