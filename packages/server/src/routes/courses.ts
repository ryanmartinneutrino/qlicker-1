import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getCourses } from '../collections/courses'
import { getSettings } from '../collections/settings'
import { getUsers } from '../collections/users'
import { requireAuth, requireInstructor, requireProfOrAdmin } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { courseSchema } from '@qlicker/shared'

const router = Router()

function generateEnrollmentCode(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  let code = ''
  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** GET /api/courses — list courses for the current user */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const courses = getCourses()
    const query = user.profile.roles.includes('admin')
      ? {}
      : {
          $or: [
            { instructors: user._id },
            { students: user._id },
            { owner: user._id },
          ],
        }
    const result = await courses.find(query).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/courses/:courseId */
router.get('/:courseId', requireAuth, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    res.json(course)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses — create a new course */
router.post('/', requireAuth, requireProfOrAdmin, async (req, res, next) => {
  try {
    const user = req.user as User
    const parsed = courseSchema
      .pick({
        name: true,
        deptCode: true,
        courseNumber: true,
        section: true,
        semester: true,
        requireVerified: true,
        allowStudentQuestions: true,
      })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const courses = getCourses()
    const userId = user._id ?? ''
    let docId = ''
    let inserted = false

    for (let attempts = 0; attempts < 5 && !inserted; attempts += 1) {
      docId = generateStringId('course')
      const doc = {
        _id: docId,
        ...parsed.data,
        deptCode: parsed.data.deptCode.toLowerCase(),
        courseNumber: parsed.data.courseNumber.toLowerCase(),
        semester: parsed.data.semester.toLowerCase(),
        owner: userId,
        enrollmentCode: generateEnrollmentCode(),
        instructors: [userId],
        students: [],
        createdAt: new Date(),
      }
      try {
        await courses.insertOne(doc as Parameters<typeof courses.insertOne>[0])
        inserted = true
      } catch (err) {
        const maybeDup = err as { code?: number }
        if (maybeDup.code !== 11000) throw err
      }
    }

    if (!inserted) return res.status(500).json({ error: 'Unable to create course. Please retry.' })

    const users = getUsers()
    await users.updateOne(
      { _id: userId } as Parameters<typeof users.updateOne>[0],
      { $addToSet: { 'profile.courses': docId } }
    )

    const created = await courses.findOne({ _id: docId } as Parameters<typeof courses.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/courses/:courseId — update a course */
router.put('/:courseId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const parsed = courseSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: parsed.data }
    )
    const updated = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/courses/:courseId — delete a course */
router.delete('/:courseId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    await courses.deleteOne({ _id: req.params.courseId } as Parameters<typeof courses.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/enroll — student self-enroll via enrollment code */
router.post('/:courseId/enroll', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const rawCode = typeof req.body?.enrollmentCode === 'string' ? req.body.enrollmentCode : ''
    const enrollmentCode = rawCode.trim().toLowerCase()
    if (!enrollmentCode) return res.status(400).json({ error: 'Enrollment code is required.' })
    const courses = getCourses()
    const course = await courses.findOne({
      _id: req.params.courseId,
      enrollmentCode,
    } as Parameters<typeof courses.findOne>[0])
    if (!course || course.inactive) return res.status(404).json({ error: "Couldn't enroll in course." })

    const userId = user._id ?? ''
    const isInstructor = course.instructors?.includes(userId) ?? false
    if (isInstructor) {
      return res.status(409).json({ error: 'Already an instructor.' })
    }

    if (course.requireVerified) {
      const hasVerified = (user.emails || []).some((email) => email.verified)
      if (!hasVerified) {
        return res.status(403).json({ error: 'Verified email required.' })
      }
    }

    const users = getUsers()
    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $addToSet: { students: userId } }
    )
    await users.updateOne(
      { _id: userId } as Parameters<typeof users.updateOne>[0],
      { $addToSet: { 'profile.courses': req.params.courseId } }
    )
    res.json(await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0]))
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/enroll — student self-enroll via enrollment code (legacy compatible) */
router.post('/enroll', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const rawCode = typeof req.body?.enrollmentCode === 'string' ? req.body.enrollmentCode : ''
    const enrollmentCode = rawCode.trim().toLowerCase()
    if (!enrollmentCode) return res.status(400).json({ error: 'Enrollment code is required.' })

    const courses = getCourses()
    const users = getUsers()
    const course = await courses.findOne({ enrollmentCode } as Parameters<typeof courses.findOne>[0])
    if (!course || course.inactive) {
      return res.status(404).json({ error: "Couldn't enroll in course." })
    }

    const userId = user._id ?? ''
    const isInstructor = course.instructors?.includes(userId) ?? false
    if (isInstructor) {
      return res.status(409).json({ error: 'Already an instructor.' })
    }

    if (course.requireVerified) {
      const hasVerified = (user.emails || []).some((email) => email.verified)
      if (!hasVerified) {
        return res.status(403).json({ error: 'Verified email required.' })
      }
    }

    await courses.updateOne(
      { _id: course._id } as Parameters<typeof courses.updateOne>[0],
      { $addToSet: { students: userId } }
    )
    await users.updateOne(
      { _id: userId } as Parameters<typeof users.updateOne>[0],
      { $addToSet: { 'profile.courses': course._id } }
    )

    const updated = await courses.findOne({ _id: course._id } as Parameters<typeof courses.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/courses/:courseId/students/:studentId — remove a student */
router.delete('/:courseId/students/:studentId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $pull: { students: req.params.studentId } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

/** GET /api/courses/:courseId/video-chat-config */
router.get('/:courseId/video-chat-config', requireAuth, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const settings = await getSettings().findOne({})
    const enabledCourseIds = new Set(settings?.Jitsi_EnabledCourses || [])
    res.json({
      enabled: Boolean(settings?.Jitsi_Enabled) && enabledCourseIds.has(req.params.courseId),
      domain: settings?.Jitsi_Domain || '',
      whiteboardDomain: settings?.Jitsi_WhiteboardDomain || '',
      etherpadDomain: settings?.Jitsi_EtherpadDomain || '',
      courseVideoChatOptions: course.videoChatOptions || null,
      groupCategories: course.groupCategories || [],
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/toggle */
router.post('/:courseId/video-chat/toggle', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const enabled = Boolean(req.body?.enabled)
    if (enabled) {
      const current = course.videoChatOptions || { urlId: generateStringId('video') }
      await courses.updateOne(
        { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
        { $set: { videoChatOptions: { ...current, joined: current.joined || [] } } }
      )
    } else {
      await courses.updateOne(
        { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
        { $unset: { videoChatOptions: '' } }
      )
    }

    const updated = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/join */
router.post('/:courseId/video-chat/join', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const courses = getCourses()
    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $addToSet: { 'videoChatOptions.joined': user._id } }
    )
    const updated = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/leave */
router.post('/:courseId/video-chat/leave', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const courses = getCourses()
    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $pull: { 'videoChatOptions.joined': user._id } }
    )
    const updated = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

export default router
