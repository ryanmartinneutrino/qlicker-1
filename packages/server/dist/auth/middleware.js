"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProfOrAdmin = exports.requireAdmin = void 0;
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.requireInstructor = requireInstructor;
const courses_1 = require("../collections/courses");
const shared_1 = require("@qlicker/shared");
/** Require authenticated session */
function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        next();
    }
    else {
        res.status(401).json({ error: 'Authentication required.' });
    }
}
/** Require user to have the given role */
function requireRole(role) {
    return (req, res, next) => {
        const user = req.user;
        if (!user || !user.profile.roles.includes(role)) {
            res.status(403).json({ error: 'Forbidden.' });
            return;
        }
        next();
    };
}
/** Require admin role */
exports.requireAdmin = requireRole(shared_1.UserRole.admin);
/** Require professor or admin role */
const requireProfOrAdmin = (req, res, next) => {
    const user = req.user;
    if (!user ||
        (!user.profile.roles.includes(shared_1.UserRole.prof) &&
            !user.profile.roles.includes(shared_1.UserRole.admin))) {
        res.status(403).json({ error: 'Forbidden.' });
        return;
    }
    next();
};
exports.requireProfOrAdmin = requireProfOrAdmin;
/** Require user to be an instructor of the given course (param: courseId) */
async function requireInstructor(req, res, next) {
    const user = req.user;
    const courseId = req.params.courseId || req.body.courseId;
    if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
    }
    if (user.profile.roles.includes(shared_1.UserRole.admin)) {
        next();
        return;
    }
    if (!courseId) {
        res.status(400).json({ error: 'courseId required.' });
        return;
    }
    try {
        const courses = (0, courses_1.getCourses)();
        const course = await courses.findOne({ _id: courseId });
        if (!course) {
            res.status(404).json({ error: 'Course not found.' });
            return;
        }
        const isInstructor = course.instructors?.includes(user._id ?? '') ?? false;
        if (!isInstructor) {
            res.status(403).json({ error: 'Forbidden.' });
            return;
        }
        next();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=middleware.js.map