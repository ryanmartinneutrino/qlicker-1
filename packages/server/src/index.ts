import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import fs from 'fs'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import MongoStore from 'connect-mongo'
import { doubleCsrf } from 'csrf-csrf'

import { connectDB } from './db'
import { setupPassport } from './auth/setup'
import { setupRealtime } from './realtime/realtime-manager'
import { generalLimiter } from './middleware/rate-limit'

import authRouter from './routes/auth'
import coursesRouter from './routes/courses'
import sessionsRouter from './routes/sessions'
import questionsRouter from './routes/questions'
import responsesRouter from './routes/responses'
import gradesRouter from './routes/grades'
import imagesRouter from './routes/images'
import settingsRouter from './routes/settings'
import usersRouter from './routes/users'
import { resolveUploadsDir } from './utils/image-storage'
import { initAllCollections } from './collections/indexes'

const PORT = process.env.PORT ? (parseInt(process.env.PORT, 10) || 3001) : 3001
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/qlicker'
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-prod'
const ROOT_URL = process.env.ROOT_URL || `http://localhost:${PORT}`
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.NODE_ENV === 'production' && ROOT_URL.startsWith('https://'))
const CSRF_COOKIE_NAME = COOKIE_SECURE ? '__Host-qlicker.x-csrf-token' : 'qlicker.x-csrf-token'
const CSRF_ENABLED = process.env.DISABLE_CSRF !== 'true'

async function main() {
  // 1. Connect to MongoDB
  await connectDB(MONGO_URL)

  // 1b. Ensure indexes for all collections
  await initAllCollections()

  // 2. Create Express app
  const app = express()
  const httpServer = createServer(app)

  // 3. Security middleware
  app.use(helmet())
  app.use(cors({ origin: ROOT_URL, credentials: true }))
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))
  const uploadsDir = resolveUploadsDir()
  fs.mkdirSync(uploadsDir, { recursive: true })
  app.use('/uploads', express.static(uploadsDir))

  // 4. Session
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: MONGO_URL }),
      cookie: {
        secure: COOKIE_SECURE,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  )

  // 5. Passport authentication
  setupPassport()
  app.use(passport.initialize())
  app.use(passport.session())

  // 6. CSRF protection (double-submit cookie pattern)
  if (CSRF_ENABLED) {
    const { generateToken, doubleCsrfProtection } = doubleCsrf({
      getSecret: () => SESSION_SECRET,
      cookieName: CSRF_COOKIE_NAME,
      cookieOptions: {
        secure: COOKIE_SECURE,
        sameSite: 'strict',
        path: '/',
      },
    })
    // Expose CSRF token endpoint (GET /api/csrf-token) — clients must fetch this
    // before making state-changing requests and include the token in x-csrf-token header
    app.get('/api/csrf-token', (req, res) => {
      try {
        res.json({ csrfToken: generateToken(req, res) })
      } catch (err) {
        console.error('Failed to generate CSRF token:', err)
        res.status(500).json({ error: 'Failed to generate CSRF token.' })
      }
    })
    // Apply CSRF protection to all state-changing API routes
    app.use('/api', doubleCsrfProtection)
  } else {
    console.warn('CSRF protection is disabled via DISABLE_CSRF=true')
    app.get('/api/csrf-token', (_req, res) => {
      res.json({ csrfToken: 'csrf-disabled' })
    })
  }

  // 7. Rate limiting
  app.use('/api', generalLimiter)

  // 8. Routes
  app.use('/api/auth', authRouter)
  app.use('/api/courses', coursesRouter)
  app.use('/api/sessions', sessionsRouter)
  app.use('/api/questions', questionsRouter)
  app.use('/api/responses', responsesRouter)
  app.use('/api/grades', gradesRouter)
  app.use('/api/images', imagesRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/users', usersRouter)

  // 9. Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  // 10. Socket.IO + Change Streams
  const io = new SocketIOServer(httpServer, {
    cors: { origin: ROOT_URL, credentials: true },
  })
  setupRealtime(io)

  httpServer.listen(PORT, () => {
    console.log(`Qlicker server running on port ${PORT}`)
  })
}

main().catch((err) => {
  console.error('Fatal error starting server:', err)
  process.exit(1)
})
