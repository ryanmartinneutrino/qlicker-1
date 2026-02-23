import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getCourses } from '../collections/courses'
import { getSettings } from '../collections/settings'
import { requireAuth, requireInstructor, requireProfOrAdmin } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { courseSchema } from '@qlicker/shared'

const router = Router()

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
    const parsed = courseSchema.omit({ _id: true, createdAt: true }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const courses = getCourses()
    const doc = {
      _id: generateStringId('course'),
      ...parsed.data,
      owner: user._id ?? '',
      instructors: [user._id ?? ''],
      createdAt: new Date(),
    }
    await courses.insertOne(doc as Parameters<typeof courses.insertOne>[0])
    const created = await courses.findOne({ _id: doc._id } as Parameters<typeof courses.findOne>[0])
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
    const { enrollmentCode } = req.body as { enrollmentCode: string }
    const courses = getCourses()
    const course = await courses.findOne({
      _id: req.params.courseId,
      enrollmentCode,
    } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Invalid enrollment code.' })

    if (course.students?.includes(user._id ?? '')) {
      return res.status(409).json({ error: 'Already enrolled.' })
    }

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $addToSet: { students: user._id } }
    )
    res.json({ success: true })
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
