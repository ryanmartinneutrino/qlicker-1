import { describe, expect, it } from 'vitest'
import { isEmailLoginAllowed, navigateByRole } from './Login'
import type { User } from '@qlicker/shared'

function makeUser(roles: string[]): User {
  return { profile: { firstname: 'A', lastname: 'B', roles } } as User
}

describe('isEmailLoginAllowed', () => {
  it('allows email login when forced by /login/email route', () => {
    expect(isEmailLoginAllowed(true, true)).toBe(true)
  })

  it('allows email login when SSO is disabled', () => {
    expect(isEmailLoginAllowed(false, false)).toBe(true)
  })

  it('hides email login by default when SSO is enabled', () => {
    expect(isEmailLoginAllowed(false, true)).toBe(false)
  })
})

describe('navigateByRole', () => {
  it('returns /admin for admin users', () => {
    expect(navigateByRole(makeUser(['admin']))).toBe('/admin')
  })

  it('returns /manage for professor users', () => {
    expect(navigateByRole(makeUser(['professor']))).toBe('/manage')
  })

  it('returns /student for student users', () => {
    expect(navigateByRole(makeUser(['student']))).toBe('/student')
  })

  it('returns /student when roles array is empty', () => {
    expect(navigateByRole(makeUser([]))).toBe('/student')
  })

  it('prioritizes admin over professor', () => {
    expect(navigateByRole(makeUser(['professor', 'admin']))).toBe('/admin')
  })
})
