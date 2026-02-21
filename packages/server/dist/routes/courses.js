"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const courses_1 = require("../collections/courses");
const middleware_1 = require("../auth/middleware");
const shared_1 = require("@qlicker/shared");
const router = (0, express_1.Router)();
/** GET /api/courses — list courses for the current user */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const courses = (0, courses_1.getCourses)();
        const query = user.profile.roles.includes('admin')
            ? {}
            : {
                $or: [
                    { instructors: user._id },
                    { students: user._id },
                    { owner: user._id },
                ],
            };
        const result = await courses.find(query).toArray();
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
/** GET /api/courses/:courseId */
router.get('/:courseId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const courses = (0, courses_1.getCourses)();
        const course = await courses.findOne({ _id: req.params.courseId });
        if (!course)
            return res.status(404).json({ error: 'Course not found.' });
        res.json(course);
    }
    catch (err) {
        next(err);
    }
});
/** POST /api/courses — create a new course */
router.post('/', middleware_1.requireAuth, middleware_1.requireProfOrAdmin, async (req, res, next) => {
    try {
        const user = req.user;
        const parsed = shared_1.courseSchema.omit({ _id: true, createdAt: true }).safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        const courses = (0, courses_1.getCourses)();
        const doc = {
            ...parsed.data,
            owner: user._id ?? '',
            instructors: [user._id ?? ''],
            createdAt: new Date(),
        };
        const result = await courses.insertOne(doc);
        const created = await courses.findOne({ _id: result.insertedId });
        res.status(201).json(created);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/courses/:courseId — update a course */
router.put('/:courseId', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const courses = (0, courses_1.getCourses)();
        const parsed = shared_1.courseSchema.partial().safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        await courses.updateOne({ _id: req.params.courseId }, { $set: parsed.data });
        const updated = await courses.findOne({ _id: req.params.courseId });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/** DELETE /api/courses/:courseId — delete a course */
router.delete('/:courseId', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const courses = (0, courses_1.getCourses)();
        await courses.deleteOne({ _id: req.params.courseId });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
/** POST /api/courses/:courseId/enroll — student self-enroll via enrollment code */
router.post('/:courseId/enroll', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const { enrollmentCode } = req.body;
        const courses = (0, courses_1.getCourses)();
        const course = await courses.findOne({
            _id: req.params.courseId,
            enrollmentCode,
        });
        if (!course)
            return res.status(404).json({ error: 'Invalid enrollment code.' });
        if (course.students?.includes(user._id ?? '')) {
            return res.status(409).json({ error: 'Already enrolled.' });
        }
        await courses.updateOne({ _id: req.params.courseId }, { $addToSet: { students: user._id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
/** DELETE /api/courses/:courseId/students/:studentId — remove a student */
router.delete('/:courseId/students/:studentId', middleware_1.requireAuth, middleware_1.requireInstructor, async (req, res, next) => {
    try {
        const courses = (0, courses_1.getCourses)();
        await courses.updateOne({ _id: req.params.courseId }, { $pull: { students: req.params.studentId } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=courses.js.map