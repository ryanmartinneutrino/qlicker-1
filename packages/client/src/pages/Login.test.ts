import { describe, expect, it } from 'vitest'
import { isEmailLoginAllowed } from './Login'

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
