"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const images_1 = require("../collections/images");
const middleware_1 = require("../auth/middleware");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
/** GET /api/images */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const images = (0, images_1.getImages)();
        const result = await images.find({}).toArray();
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/images — upload an image.
 * Uses multer for multipart handling. Stores in S3/Azure/local depending on
 * settings. The actual cloud upload logic mirrors edgee:slingshot behavior.
 */
router.post('/', middleware_1.requireAuth, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file uploaded.' });
        // TODO: Integrate with S3/Azure based on Settings.storageType.
        // For now, return a stub URL — replace with actual upload logic.
        const uid = `${Date.now()}-${req.file.originalname}`;
        const url = `/uploads/${uid}`;
        const images = (0, images_1.getImages)();
        const result = await images.insertOne({ url, UID: uid });
        const created = await images.findOne({ _id: result.insertedId });
        res.status(201).json(created);
    }
    catch (err) {
        next(err);
    }
});
/** DELETE /api/images/:imageId */
router.delete('/:imageId', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const images = (0, images_1.getImages)();
        await images.deleteOne({ _id: req.params.imageId });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=images.js.map