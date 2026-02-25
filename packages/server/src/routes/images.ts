import { Router } from 'express'
import { generateStringId } from '../utils/id'
import multer from 'multer'
import { getImages } from '../collections/images'
import { getSettings } from '../collections/settings'
import { requireAuth } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { deleteStoredImage, storeImage } from '../utils/image-storage'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

/** GET /api/images */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const images = getImages()
    const isAdmin = user.profile.roles.includes('admin')
    const query = isAdmin
      ? {}
      : ({ owner: user._id } as Parameters<typeof images.find>[0])
    const result = await images.find(query).toArray()
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
    const user = req.user as User
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed.' })
    }

    const settings = await getSettings().findOne({})
    const maxImageSizeMb = settings?.maxImageSize ?? 10
    if (req.file.size > maxImageSizeMb * 1024 * 1024) {
      return res.status(400).json({ error: `Image exceeds ${maxImageSizeMb}MB limit.` })
    }
    const { uid, url } = await storeImage(req.file, settings)

    const images = getImages()
    const doc = { _id: generateStringId('image'), url, UID: uid, owner: user._id }
    await images.insertOne(doc)
    const created = await images.findOne({ _id: doc._id } as Parameters<typeof images.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/images/:imageId */
router.delete('/:imageId', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const isAdmin = user.profile.roles.includes('admin')
    const images = getImages()
    const existing = await images.findOne({ _id: req.params.imageId } as Parameters<typeof images.findOne>[0])
    if (existing && !isAdmin) {
      if (!existing.owner || existing.owner !== user._id) {
        return res.status(403).json({ error: 'Forbidden.' })
      }
    }
    if (existing) {
      const settings = await getSettings().findOne({})
      await deleteStoredImage(existing.UID, settings)
    }
    await images.deleteOne({ _id: req.params.imageId } as Parameters<typeof images.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
