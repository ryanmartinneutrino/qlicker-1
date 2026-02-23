import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getSettings } from '../collections/settings'
import { requireAuth, requireAdmin } from '../auth/middleware'
import { settingsSchema } from '@qlicker/shared'

const router = Router()

/** GET /api/settings */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const settings = await getSettings().findOne({})
    if (!settings) return res.status(404).json({ error: 'Settings not found.' })
    // Redact sensitive keys for non-admins
    const user = req.user as { profile: { roles: string[] } }
    if (!user.profile.roles.includes('admin')) {
      const { AWS_secret, Azure_accountKey, SSO_privKey, SSO_privCert, ...safe } = settings
      return res.json(safe)
    }
    res.json(settings)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/settings — update settings (admin only) */
router.put('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const parsed = settingsSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const col = getSettings()
    const existing = await col.findOne({})
    if (!existing) {
      await col.insertOne({ _id: generateStringId('settings'), ...parsed.data } as Parameters<typeof col.insertOne>[0])
    } else {
      await col.updateOne(
        { _id: existing._id } as Parameters<typeof col.updateOne>[0],
        { $set: parsed.data }
      )
    }
    const updated = await col.findOne({})
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

export default router
