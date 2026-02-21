"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const grades_1 = require("../collections/grades");
const middleware_1 = require("../auth/middleware");
const shared_1 = require("@qlicker/shared");
const router = (0, express_1.Router)();
/** GET /api/grades?courseId=...&sessionId=...&userId=... */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const { courseId, sessionId, userId } = req.query;
        const grades = (0, grades_1.getGrades)();
        const query = {};
        if (courseId)
            query.courseId = courseId;
        if (sessionId)
            query.sessionId = sessionId;
        const isInstructor = user.profile.roles.includes('professor') || user.profile.roles.includes('admin');
        if (userId && isInstructor) {
            query.userId = userId;
        }
        else if (!isInstructor) {
            // Students can only see their own grades
            query.userId = user._id;
        }
        const result = await grades.find(query).toArray();
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
/** GET /api/grades/:gradeId */
router.get('/:gradeId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const grades = (0, grades_1.getGrades)();
        const grade = await grades.findOne({ _id: req.params.gradeId });
        if (!grade)
            return res.status(404).json({ error: 'Grade not found.' });
        const isInstructor = user.profile.roles.includes('professor') || user.profile.roles.includes('admin');
        if (!isInstructor && grade.userId !== user._id) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        res.json(grade);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/grades/:gradeId — update a grade (instructor only) */
router.put('/:gradeId', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const grades = (0, grades_1.getGrades)();
        const parsed = shared_1.gradeSchema.partial().safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        await grades.updateOne({ _id: req.params.gradeId }, { $set: parsed.data });
        const updated = await grades.findOne({ _id: req.params.gradeId });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/grades/:gradeId/visible — toggle student visibility */
router.put('/:gradeId/visible', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const { visible } = req.body;
        const grades = (0, grades_1.getGrades)();
        await grades.updateOne({ _id: req.params.gradeId }, { $set: { visibleToStudents: visible } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=grades.js.map