import passport from 'passport'
import { Strategy as LocalStrategy } from 'passport-local'
import bcrypt from 'bcrypt'
import { getUsers } from '../collections/users'
import { getSettings } from '../collections/settings'
import type { User } from '@qlicker/shared'

export function setupPassport(): void {
  // ── Local Strategy ────────────────────────────────────────────────────────
  // Verifies against existing Meteor bcrypt hashes stored in
  // user.services.password.bcrypt — backwards compatible with the Meteor app.
  passport.use(
    new LocalStrategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const users = getUsers()
          const user = await users.findOne({ 'emails.address': email })
          if (!user) {
            return done(null, false, { message: 'Invalid email or password.' })
          }

          const hash = user.services?.password?.bcrypt
          if (!hash) {
            return done(null, false, { message: 'No password set for this account.' })
          }

          const valid = await bcrypt.compare(password, hash)
          if (!valid) {
            return done(null, false, { message: 'Invalid email or password.' })
          }

          return done(null, user)
        } catch (err) {
          return done(err)
        }
      }
    )
  )

  // ── SAML Strategy ─────────────────────────────────────────────────────────
  // Lazily configured based on Settings collection values, mirroring the
  // setup in server/saml_server.js.
  setupSamlStrategy()

  // ── Serialization ─────────────────────────────────────────────────────────
  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as User)._id)
  })

  passport.deserializeUser(async (id: string, done) => {
    try {
      const users = getUsers()
      const user = await users.findOne({ _id: id } as Parameters<typeof users.findOne>[0])
      done(null, user ?? false)
    } catch (err) {
      done(err)
    }
  })
}

export async function setupSamlStrategy(): Promise<void> {
  try {
    const settings = await getSettings().findOne({})
    if (
      !settings?.SSO_enabled ||
      !settings.SSO_emailIdentifier ||
      !settings.SSO_entrypoint ||
      !settings.SSO_identifierFormat ||
      !settings.SSO_EntityId
    ) {
      return // SSO not configured
    }

    // Dynamic import to avoid hard dependency when SAML is not used
    const { Strategy: SamlStrategy } = await import('passport-saml')
    const rootUrl = process.env.ROOT_URL || 'http://localhost:3001'

    passport.use(
      'saml',
      new SamlStrategy(
        {
          callbackUrl: `${rootUrl}/api/auth/saml/callback`,
          logoutCallbackUrl: `${rootUrl}/api/auth/saml/logout`,
          entryPoint: settings.SSO_entrypoint,
          cert: settings.SSO_cert || '',
          identifierFormat: settings.SSO_identifierFormat,
          logoutUrl: settings.SSO_logoutUrl || '',
          decryptionPvk: settings.SSO_privKey || '',
          issuer: settings.SSO_EntityId,
          disableRequestedAuthnContext: true,
        },
        (
          _profile: unknown,
          done: (err: Error | null, user?: Record<string, unknown>) => void
        ) => {
          done(null, _profile as Record<string, unknown>)
        }
      )
    )
  } catch (err) {
    console.warn('SAML strategy setup skipped:', (err as Error).message)
  }
}
