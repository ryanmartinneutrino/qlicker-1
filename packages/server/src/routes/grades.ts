import { Router } from 'express'
import { getGrades } from '../collections/grades'
import { requireAuth, requireInstructor } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { gradeSchema } from '@qlicker/shared'

const router = Router()

/** GET /api/grades?courseId=...&sessionId=...&userId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const { courseId, sessionId, userId } = req.query as Record<string, string | undefined>
    const grades = getGrades()
    const query: Record<string, unknown> = {}
    if (courseId) query.courseId = courseId
    if (sessionId) query.sessionId = sessionId

    const isInstructor = user.profile.roles.includes('professor') || user.profile.roles.includes('admin')
    if (userId && isInstructor) {
      query.userId = userId
    } else if (!isInstructor) {
      // Meteor parity: students can only see their own visible grades.
      query.userId = user._id
      query.visibleToStudents = true
    }

    const result = await grades.find(query).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/grades/:gradeId */
router.get('/:gradeId', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const grades = getGrades()
    const grade = await grades.findOne({ _id: req.params.gradeId } as Parameters<typeof grades.findOne>[0])
    if (!grade) return res.status(404).json({ error: 'Grade not found.' })

    const isInstructor = user.profile.roles.includes('professor') || user.profile.roles.includes('admin')
    if (!isInstructor && (grade.userId !== user._id || !grade.visibleToStudents)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    res.json(grade)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/grades/:gradeId — update a grade (instructor only) */
router.put('/:gradeId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const grades = getGrades()
    const parsed = gradeSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    await grades.updateOne(
      { _id: req.params.gradeId } as Parameters<typeof grades.updateOne>[0],
      { $set: parsed.data }
    )
    const updated = await grades.findOne({ _id: req.params.gradeId } as Parameters<typeof grades.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/grades/:gradeId/visible — toggle student visibility */
router.put('/:gradeId/visible', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const { visible } = req.body as { visible: boolean }
    const grades = getGrades()
    await grades.updateOne(
      { _id: req.params.gradeId } as Parameters<typeof grades.updateOne>[0],
      { $set: { visibleToStudents: visible } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
