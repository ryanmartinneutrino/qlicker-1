"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const questions_1 = require("../collections/questions");
const middleware_1 = require("../auth/middleware");
const shared_1 = require("@qlicker/shared");
const router = (0, express_1.Router)();
/** GET /api/questions?sessionId=...&courseId=... */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { sessionId, courseId, owner } = req.query;
        const questions = (0, questions_1.getQuestions)();
        const query = {};
        if (sessionId)
            query.sessionId = sessionId;
        if (courseId)
            query.courseId = courseId;
        if (owner)
            query.owner = owner;
        const result = await questions.find(query).toArray();
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
/** GET /api/questions/:questionId */
router.get('/:questionId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const questions = (0, questions_1.getQuestions)();
        const q = await questions.findOne({ _id: req.params.questionId });
        if (!q)
            return res.status(404).json({ error: 'Question not found.' });
        res.json(q);
    }
    catch (err) {
        next(err);
    }
});
/** POST /api/questions — create question */
router.post('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const parsed = shared_1.questionSchema.omit({ _id: true, createdAt: true }).safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        const questions = (0, questions_1.getQuestions)();
        const doc = {
            ...parsed.data,
            creator: user._id ?? '',
            createdAt: new Date(),
        };
        const result = await questions.insertOne(doc);
        const created = await questions.findOne({ _id: result.insertedId });
        res.status(201).json(created);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/questions/:questionId — update question */
router.put('/:questionId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const questions = (0, questions_1.getQuestions)();
        const parsed = shared_1.questionSchema.partial().safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        await questions.updateOne({ _id: req.params.questionId }, { $set: parsed.data });
        const updated = await questions.findOne({ _id: req.params.questionId });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/** DELETE /api/questions/:questionId */
router.delete('/:questionId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const questions = (0, questions_1.getQuestions)();
        await questions.deleteOne({ _id: req.params.questionId });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=questions.js.map