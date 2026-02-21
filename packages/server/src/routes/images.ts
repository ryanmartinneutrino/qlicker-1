import { Router } from 'express'
import multer from 'multer'
import { getImages } from '../collections/images'
import { requireAuth, requireAdmin } from '../auth/middleware'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

/** GET /api/images */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const images = getImages()
    const result = await images.find({}).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/images — upload an image.
 * Uses multer for multipart handling. Stores in S3/Azure/local depending on
 * settings. The actual cloud upload logic mirrors edgee:slingshot behavior.
 */
router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    // TODO: Integrate with S3/Azure based on Settings.storageType.
    // For now, return a stub URL — replace with actual upload logic.
    const uid = `${Date.now()}-${req.file.originalname}`
    const url = `/uploads/${uid}`

    const images = getImages()
    const result = await images.insertOne({ url, UID: uid })
    const created = await images.findOne({ _id: result.insertedId } as Parameters<typeof images.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/images/:imageId */
router.delete('/:imageId', requireAuth, async (req, res, next) => {
  try {
    const images = getImages()
    await images.deleteOne({ _id: req.params.imageId } as Parameters<typeof images.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
