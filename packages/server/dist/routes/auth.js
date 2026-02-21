"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const users_1 = require("../collections/users");
const settings_1 = require("../collections/settings");
const middleware_1 = require("../auth/middleware");
const rate_limit_1 = require("../middleware/rate-limit");
const shared_1 = require("@qlicker/shared");
const router = (0, express_1.Router)();
/** POST /api/auth/login — email/password login */
router.post('/login', rate_limit_1.authLimiter, (req, res, next) => {
    passport_1.default.authenticate('local', (err, user, info) => {
        if (err)
            return next(err);
        if (!user)
            return res.status(401).json({ error: info?.message || 'Login failed.' });
        req.logIn(user, (loginErr) => {
            if (loginErr)
                return next(loginErr);
            return res.json({ user: sanitizeUser(user) });
        });
    })(req, res, next);
});
/** POST /api/auth/logout */
router.post('/logout', middleware_1.requireAuth, (req, res, next) => {
    req.logout((err) => {
        if (err)
            return next(err);
        res.json({ success: true });
    });
});
/** GET /api/auth/me */
router.get('/me', middleware_1.requireAuth, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
});
/** POST /api/auth/register */
router.post('/register', rate_limit_1.authLimiter, async (req, res, next) => {
    try {
        const { email, password, firstname, lastname } = req.body;
        if (!email || !password || !firstname || !lastname) {
            return res.status(400).json({ error: 'All fields are required.' });
        }
        const settings = await (0, settings_1.getSettings)().findOne({});
        if (settings?.restrictDomain) {
            const domain = email.split('@')[1];
            if (!settings.allowedDomains.includes(domain)) {
                return res.status(403).json({ error: 'Email domain not allowed.' });
            }
        }
        const users = (0, users_1.getUsers)();
        const existing = await users.findOne({ 'emails.address': email });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered.' });
        }
        const hash = await bcrypt_1.default.hash(password, 10);
        const newUser = {
            emails: [{ address: email, verified: false }],
            profile: {
                firstname,
                lastname,
                roles: [shared_1.UserRole.student],
            },
            services: { password: { bcrypt: hash } },
            createdAt: new Date(),
        };
        const result = await users.insertOne(newUser);
        const created = await users.findOne({ _id: result.insertedId.toString() });
        if (!created)
            return res.status(500).json({ error: 'User creation failed.' });
        req.logIn(created, (err) => {
            if (err)
                return next(err);
            return res.status(201).json({ user: sanitizeUser(created) });
        });
    }
    catch (err) {
        next(err);
    }
});
/** GET /api/auth/saml — initiate SAML SSO login */
router.get('/saml', passport_1.default.authenticate('saml'));
/** POST /api/auth/saml/callback — SAML SSO callback */
router.post('/saml/callback', passport_1.default.authenticate('saml', { failureRedirect: '/login' }), (req, res) => {
    res.redirect('/');
});
/** GET /api/auth/saml/logout */
router.get('/saml/logout', middleware_1.requireAuth, (req, res, next) => {
    req.logout((err) => {
        if (err)
            return next(err);
        res.redirect('/');
    });
});
function sanitizeUser(user) {
    const { services: _services, ...safe } = user;
    return safe;
}
exports.default = router;
//# sourceMappingURL=auth.js.map