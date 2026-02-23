import { Router } from 'express'
import bcrypt from 'bcrypt'
import { getUsers } from '../collections/users'
import { requireAuth, requireAdmin } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { userSchema } from '@qlicker/shared'

const router = Router()

/** GET /api/users — list all users (admin only) */
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const users = getUsers()
    const result = await users.find({}).project({ 'services.password': 0 }).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/users/:userId */
router.get('/:userId', requireAuth, async (req, res, next) => {
  try {
    const currentUser = req.user as User
    const isAdmin = currentUser.profile.roles.includes('admin')
    if (!isAdmin && currentUser._id !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    const users = getUsers()
    const user = await users.findOne(
      { _id: req.params.userId } as Parameters<typeof users.findOne>[0],
      { projection: { 'services.password': 0 } }
    )
    if (!user) return res.status(404).json({ error: 'User not found.' })
    res.json(user)
  } catch (err) {
    next(err)
  }
})


/** POST /api/users/verify-email — compatibility stub for migration */
router.post('/verify-email', requireAuth, async (_req, res) => {
  // Email transport flow is not fully migrated yet; keep endpoint for UI parity.
  res.json({ success: true })
})

/** PUT /api/users/:userId/email — change own email */
router.put('/:userId/email', requireAuth, async (req, res, next) => {
  try {
    const currentUser = req.user as User
    if (currentUser._id !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    const { email } = req.body as { email?: string }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required.' })
    }

    const users = getUsers()
    const duplicate = await users.findOne({ 'emails.address': email } as Parameters<typeof users.findOne>[0])
    if (duplicate && duplicate._id !== req.params.userId) {
      return res.status(409).json({ error: 'Email already in use.' })
    }

    await users.updateOne(
      { _id: req.params.userId } as Parameters<typeof users.updateOne>[0],
      { $set: { emails: [{ address: email, verified: false }] } }
    )

    const updated = await users.findOne(
      { _id: req.params.userId } as Parameters<typeof users.findOne>[0],
      { projection: { 'services.password': 0 } }
    )
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/users/:userId/profile — update own profile */
router.put('/:userId/profile', requireAuth, async (req, res, next) => {
  try {
    const currentUser = req.user as User
    const isAdmin = currentUser.profile.roles.includes('admin')
    if (!isAdmin && currentUser._id !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    const { firstname, lastname, profileImage, profileThumbnail, studentNumber } = req.body as Partial<{
      firstname: string
      lastname: string
      profileImage: string
      profileThumbnail: string
      studentNumber: string
    }>

    const update: Record<string, unknown> = {}
    if (firstname !== undefined) update['profile.firstname'] = firstname
    if (lastname !== undefined) update['profile.lastname'] = lastname
    if (profileImage !== undefined) update['profile.profileImage'] = profileImage
    if (profileThumbnail !== undefined) update['profile.profileThumbnail'] = profileThumbnail
    if (studentNumber !== undefined) update['profile.studentNumber'] = studentNumber

    const users = getUsers()
    await users.updateOne(
      { _id: req.params.userId } as Parameters<typeof users.updateOne>[0],
      { $set: update }
    )
    const updated = await users.findOne(
      { _id: req.params.userId } as Parameters<typeof users.findOne>[0],
      { projection: { 'services.password': 0 } }
    )
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/users/:userId/role — change user role (admin only) */
router.put('/:userId/role', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { role } = req.body as { role: string }
    const validRoles = ['student', 'professor', 'admin']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' })
    }
    const users = getUsers()
    await users.updateOne(
      { _id: req.params.userId } as Parameters<typeof users.updateOne>[0],
      { $set: { 'profile.roles': [role] } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/users/:userId/password — change password */
router.put('/:userId/password', requireAuth, async (req, res, next) => {
  try {
    const currentUser = req.user as User
    if (currentUser._id !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    const { currentPassword, newPassword, password } = req.body as { currentPassword?: string; newPassword?: string; password?: string }
    const targetPassword = newPassword || password
    if (!targetPassword || targetPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    const users = getUsers()
    const user = await users.findOne({ _id: req.params.userId } as Parameters<typeof users.findOne>[0])
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const hash = user.services?.password?.bcrypt
    if (hash) {
      const valid = await bcrypt.compare(currentPassword || '', hash)
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' })
    }

    const newHash = await bcrypt.hash(targetPassword, 10)
    await users.updateOne(
      { _id: req.params.userId } as Parameters<typeof users.updateOne>[0],
      { $set: { 'services.password.bcrypt': newHash } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/users/:userId — delete user (admin only) */
router.delete('/:userId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const users = getUsers()
    await users.deleteOne({ _id: req.params.userId } as Parameters<typeof users.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
