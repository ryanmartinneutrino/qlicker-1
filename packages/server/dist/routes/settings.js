"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settings_1 = require("../collections/settings");
const middleware_1 = require("../auth/middleware");
const shared_1 = require("@qlicker/shared");
const router = (0, express_1.Router)();
/** GET /api/settings */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const settings = await (0, settings_1.getSettings)().findOne({});
        if (!settings)
            return res.status(404).json({ error: 'Settings not found.' });
        // Redact sensitive keys for non-admins
        const user = req.user;
        if (!user.profile.roles.includes('admin')) {
            const { AWS_secret, Azure_accountKey, SSO_privKey, SSO_privCert, ...safe } = settings;
            return res.json(safe);
        }
        res.json(settings);
    }
    catch (err) {
        next(err);
    }
});
/** PUT /api/settings — update settings (admin only) */
router.put('/', middleware_1.requireAuth, middleware_1.requireAdmin, async (req, res, next) => {
    try {
        const parsed = shared_1.settingsSchema.partial().safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        const col = (0, settings_1.getSettings)();
        const existing = await col.findOne({});
        if (!existing) {
            await col.insertOne({ ...parsed.data });
        }
        else {
            await col.updateOne({ _id: existing._id }, { $set: parsed.data });
        }
        const updated = await col.findOne({});
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map