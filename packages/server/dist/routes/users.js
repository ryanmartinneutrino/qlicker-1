"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const users_1 = require("../collections/users");
const middleware_1 = require("../auth/middleware");
const router = (0, express_1.Router)();
/** GET /api/users — list all users (admin only) */
router.get('/', middleware_1.requireAuth, middleware_1.requireAdmin, async (req, res, next) => {
    try {
        const users = (0, users_1.getUsers)();
        const result = await users.find({}).project({ 'services.password': 0 }).toArray();
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
/** GET /api/users/:userId */
router.get('/:userId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const currentUser = req.user;
        const isAdmin = currentUser.profile.roles.includes('admin');
        if (!isAdmin && currentUser._id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        const users = (0, users_1.getUsers)();
        const user = await users.findOne({ _id: req.params.userId }, { projection: { 'services.password': 0 } });
        if (!user)
            return res.status(404).json({ error: 'User not found.' });
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/users/:userId/profile — update own profile */
router.put('/:userId/profile', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const currentUser = req.user;
        const isAdmin = currentUser.profile.roles.includes('admin');
        if (!isAdmin && currentUser._id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        const { firstname, lastname, profileImage, profileThumbnail, studentNumber } = req.body;
        const update = {};
        if (firstname !== undefined)
            update['profile.firstname'] = firstname;
        if (lastname !== undefined)
            update['profile.lastname'] = lastname;
        if (profileImage !== undefined)
            update['profile.profileImage'] = profileImage;
        if (profileThumbnail !== undefined)
            update['profile.profileThumbnail'] = profileThumbnail;
        if (studentNumber !== undefined)
            update['profile.studentNumber'] = studentNumber;
        const users = (0, users_1.getUsers)();
        await users.updateOne({ _id: req.params.userId }, { $set: update });
        const updated = await users.findOne({ _id: req.params.userId }, { projection: { 'services.password': 0 } });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/users/:userId/role — change user role (admin only) */
router.put('/:userId/role', middleware_1.requireAuth, middleware_1.requireAdmin, async (req, res, next) => {
    try {
        const { role } = req.body;
        const validRoles = ['student', 'professor', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role.' });
        }
        const users = (0, users_1.getUsers)();
        await users.updateOne({ _id: req.params.userId }, { $set: { 'profile.roles': [role] } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/users/:userId/password — change password */
router.put('/:userId/password', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const currentUser = req.user;
        if (currentUser._id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        const users = (0, users_1.getUsers)();
        const user = await users.findOne({ _id: req.params.userId });
        if (!user)
            return res.status(404).json({ error: 'User not found.' });
        const hash = user.services?.password?.bcrypt;
        if (hash) {
            const valid = await bcrypt_1.default.compare(currentPassword, hash);
            if (!valid)
                return res.status(401).json({ error: 'Current password is incorrect.' });
        }
        const newHash = await bcrypt_1.default.hash(newPassword, 10);
        await users.updateOne({ _id: req.params.userId }, { $set: { 'services.password.bcrypt': newHash } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
/** DELETE /api/users/:userId — delete user (admin only) */
router.delete('/:userId', middleware_1.requireAuth, middleware_1.requireAdmin, async (req, res, next) => {
    try {
        const users = (0, users_1.getUsers)();
        await users.deleteOne({ _id: req.params.userId });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map