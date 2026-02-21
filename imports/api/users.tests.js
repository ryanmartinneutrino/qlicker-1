/* eslint-env mocha */

import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { expect } from 'meteor/practicalmeteor:chai'

import { createStubs, restoreStubs } from '../../stubs.tests.js'

import { Courses } from './courses.js'
import { ROLES } from '../configs'

import './users.js'

const TEST_PASSWORD = 'testPassword123'
const DEFAULT_STUDENT_NUMBER = 123456

const createUserWithRole = ({ email, role, canPromote = false, studentNumber = DEFAULT_STUDENT_NUMBER }) => {
  return Accounts.createUser({
    email,
    password: TEST_PASSWORD,
    profile: {
      firstname: 'test',
      lastname: 'user',
      roles: [role],
      canPromote,
      studentNumber
    }
  })
}

if (Meteor.isServer) {
  describe('Users', () => {
    beforeEach(() => {
      Courses.remove({})
      Meteor.users.remove({})
      restoreStubs()
    })

    it('can update own name (users.updateName)', () => {
      const userId = createUserWithRole({ email: 'student-name@email.com', role: ROLES.student })
      createStubs(userId)

      Meteor.call('users.updateName', 'New Last', 'New First')

      const user = Meteor.users.findOne({ _id: userId })
      expect(user.profile.lastname).to.equal('New Last')
      expect(user.profile.firstname).to.equal('New First')
    })

    it('can update own student number (users.updateStudentNumber)', () => {
      const userId = createUserWithRole({ email: 'student-number@email.com', role: ROLES.student })
      createStubs(userId)

      Meteor.call('users.updateStudentNumber', 999888777)

      const user = Meteor.users.findOne({ _id: userId })
      expect(user.profile.studentNumber).to.equal(999888777)
    })

    it('admin can change another user role (users.changeRole)', () => {
      const adminId = createUserWithRole({ email: 'admin-role@email.com', role: ROLES.admin })
      const targetId = createUserWithRole({ email: 'target-role@email.com', role: ROLES.student })
      createStubs(adminId)

      Meteor.call('users.changeRole', targetId, ROLES.prof)

      expect(Meteor.users.findOne(targetId).profile.roles[0]).to.equal(ROLES.prof)
    })

    it('does not allow demoting the last admin (users.changeRole)', () => {
      const adminId = createUserWithRole({ email: 'single-admin@email.com', role: ROLES.admin })
      createStubs(adminId)

      expect(() => {
        Meteor.call('users.changeRole', adminId, ROLES.prof)
      }).to.throw('keep-single-admin')
      expect(Meteor.users.findOne(adminId).profile.roles[0]).to.equal(ROLES.admin)
    })

    it('can toggle canPromote as admin (users.toggleCanPromote)', () => {
      const adminId = createUserWithRole({ email: 'admin-toggle@email.com', role: ROLES.admin })
      const profId = createUserWithRole({ email: 'prof-toggle@email.com', role: ROLES.prof, canPromote: false })
      createStubs(adminId)

      Meteor.call('users.toggleCanPromote', profId)
      expect(Meteor.users.findOne(profId).profile.canPromote).to.equal(true)

      Meteor.call('users.toggleCanPromote', profId)
      expect(Meteor.users.findOne(profId).profile.canPromote).to.equal(false)
    })

    it('can promote user to professor when caller can promote (users.promote)', () => {
      const promoterId = createUserWithRole({ email: 'promoter@email.com', role: ROLES.prof, canPromote: true })
      const studentId = createUserWithRole({ email: 'to-promote@email.com', role: ROLES.student })
      createStubs(promoterId)

      Meteor.call('users.promote', 'to-promote@email.com')

      expect(Meteor.users.findOne(studentId).profile.roles[0]).to.equal(ROLES.prof)
    })

    it('returns the total users count (users.count)', () => {
      const adminId = createUserWithRole({ email: 'admin-count@email.com', role: ROLES.admin })
      createUserWithRole({ email: 'student-count@email.com', role: ROLES.student })
      createStubs(adminId)

      expect(Meteor.call('users.count')).to.equal(2)
    })
  })
}
