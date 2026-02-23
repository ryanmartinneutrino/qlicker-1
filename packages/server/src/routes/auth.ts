import { Router } from 'express'
import { generateStringId } from '../utils/id'
import passport from 'passport'
import bcrypt from 'bcrypt'
import { getUsers } from '../collections/users'
import { getSettings } from '../collections/settings'
import { requireAuth } from '../auth/middleware'
import { authLimiter } from '../middleware/rate-limit'
import type { User } from '@qlicker/shared'
import { UserRole } from '@qlicker/shared'

const router = Router()

/** GET /api/auth/login-options — public login settings for UI parity */
router.get('/login-options', async (_req, res, next) => {
  try {
    const settings = await getSettings().findOne({})
    res.json({
      ssoEnabled: Boolean(settings?.SSO_enabled),
      ssoInstitution: settings?.SSO_institutionName || null,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/auth/login — email/password login */
router.post('/login', authLimiter, (req, res, next) => {
  passport.authenticate('local', (err: Error | null, user: User | false, info: { message: string } | undefined) => {
    if (err) return next(err)
    if (!user) return res.status(401).json({ error: info?.message || 'Login failed.' })
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr)
      return res.json({ user: sanitizeUser(user) })
    })
  })(req, res, next)
})

/** POST /api/auth/logout */
router.post('/logout', requireAuth, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err)
    res.json({ success: true })
  })
})

/** GET /api/auth/me */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user as User) })
})

/** POST /api/auth/register */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, firstname, lastname } = req.body as {
      email: string
      password: string
      firstname: string
      lastname: string
    }

    if (!email || !password || !firstname || !lastname) {
      return res.status(400).json({ error: 'All fields are required.' })
    }

    const settings = await getSettings().findOne({})
    if (settings?.restrictDomain) {
      const domain = email.split('@')[1]
      if (!settings.allowedDomains.includes(domain)) {
        return res.status(403).json({ error: 'Email domain not allowed.' })
      }
    }

    const users = getUsers()
    const existing = await users.findOne({ 'emails.address': email })
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' })
    }

    const hash = await bcrypt.hash(password, 10)
    const newUser: User = {
      _id: generateStringId('user'),
      emails: [{ address: email, verified: false }],
      profile: {
        firstname,
        lastname,
        roles: [UserRole.student],
      },
      services: { password: { bcrypt: hash } },
      createdAt: new Date(),
    }

    await users.insertOne(newUser as User)
    const created = await users.findOne({ _id: newUser._id } as Parameters<typeof users.findOne>[0])
    if (!created) return res.status(500).json({ error: 'User creation failed.' })

    req.logIn(created, (err) => {
      if (err) return next(err)
      return res.status(201).json({ user: sanitizeUser(created) })
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/auth/saml — initiate SAML SSO login */
router.get('/saml', passport.authenticate('saml'))

/** POST /api/auth/saml/callback — SAML SSO callback */
router.post('/saml/callback', passport.authenticate('saml', { failureRedirect: '/login' }), (req, res) => {
  res.redirect('/')
})

/** GET /api/auth/saml/logout */
router.get('/saml/logout', requireAuth, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err)
    res.redirect('/')
  })
})

function sanitizeUser(user: User) {
  const { services: _services, ...safe } = user
  return safe
}

export default router
