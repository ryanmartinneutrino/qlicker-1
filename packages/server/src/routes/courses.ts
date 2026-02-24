import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getCourses } from '../collections/courses'
import { getSettings } from '../collections/settings'
import { getUsers } from '../collections/users'
import { requireAuth, requireInstructor, requireProfOrAdmin } from '../auth/middleware'
import type { Course, Group, GroupCategory, User, VideoOptions } from '@qlicker/shared'
import { courseSchema, UserRole } from '@qlicker/shared'

const router = Router()
const defaultVideoChatApiOptions = {
  startAudioMuted: true,
  startVideoMuted: true,
  startTileView: true,
}

const defaultJitsiConfigOverwrite = {
  disableSimulcast: false,
  enableClosePage: false,
  disableThirdPartyRequests: true,
}

const defaultJitsiInterfaceConfigOverwrite = {
  filmStripOnly: false,
  HIDE_INVITE_MORE_HEADER: true,
  SHOW_JITSI_WATERMARK: false,
  SHOW_WATERMARK_FOR_GUESTS: false,
  DEFAULT_REMOTE_DISPLAY_NAME: 'Classmate',
  TOOLBAR_BUTTONS: [
    'microphone', 'camera', 'desktop', 'fullscreen',
    'fodeviceselection', 'hangup', 'chat',
    'etherpad', 'raisehand', 'participants-pane',
    'videoquality', 'filmstrip', 'settings', 'select-background',
    'tileview', 'mute-everyone', 'shareaudio', 'sharedvideo',
  ],
}

function isCourseInstructor(user: User, course: Course): boolean {
  if (user.profile.roles.includes(UserRole.admin)) return true
  const userId = user._id ?? ''
  return Boolean(course.owner === userId || course.instructors?.includes(userId))
}

function isCourseStudent(user: User, course: Course): boolean {
  return Boolean(user._id && course.students?.includes(user._id))
}

function isCourseMember(user: User, course: Course): boolean {
  return isCourseInstructor(user, course) || isCourseStudent(user, course)
}

function toDisplayName(user: User): string {
  const first = user.profile.firstname || ''
  const last = user.profile.lastname || ''
  return `${first} ${last}`.trim() || 'Qlicker User'
}

function findCategory(course: Course, categoryNumber: number): GroupCategory | null {
  const categories = course.groupCategories || []
  return categories.find((category) => Number(category.categoryNumber) === categoryNumber) || null
}

function findGroup(category: GroupCategory, groupNumber: number): Group | null {
  const groups = category.groups || []
  return groups.find((group) => Number(group.groupNumber) === groupNumber) || null
}

function getJitsiCourseRoomName(course: Course): string | null {
  if (!course._id || !course.videoChatOptions?.urlId) return null
  return `${course._id}Qlicker${course.videoChatOptions.urlId}all`
}

function getJitsiGroupRoomName(course: Course, category: GroupCategory, group: Group): string | null {
  if (!course._id || !category.categoryName || !group.groupName || !category.catVideoChatOptions?.urlId) return null
  return `Ql_C_${course._id}cat_${category.categoryName}${category.catVideoChatOptions.urlId}grp_${group.groupName}`
}

function parsePositiveInteger(value: unknown, defaultValue = 1): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return defaultValue
  const normalized = Math.floor(parsed)
  return normalized >= 1 ? normalized : defaultValue
}

function nextCategoryNumber(categories: GroupCategory[]): number {
  const existing = categories
    .map((category) => Number(category.categoryNumber))
    .filter((number) => Number.isFinite(number) && number > 0)
  if (existing.length < 1) return 1
  return Math.max(...existing) + 1
}

function nextGroupNumber(groups: Group[]): number {
  const existing = groups
    .map((group) => Number(group.groupNumber))
    .filter((number) => Number.isFinite(number) && number > 0)
  if (existing.length < 1) return 1
  return Math.max(...existing) + 1
}

function createDefaultGroup(groupNumber: number): Group {
  return {
    groupNumber,
    groupName: `Group${groupNumber}`,
    students: [],
  }
}

function getFilteredGroupCategories(course: Course, user: User, isInstructor: boolean): GroupCategory[] {
  const categories = course.groupCategories || []
  if (isInstructor) return categories

  const userId = user._id || ''
  const filtered: GroupCategory[] = []
  for (const category of categories) {
    const groups = (category.groups || []).filter((group) => (group.students || []).includes(userId))
    if (groups.length < 1) continue
    filtered.push({
      categoryNumber: category.categoryNumber,
      categoryName: category.categoryName,
      catVideoChatOptions: category.catVideoChatOptions,
      groups,
    })
  }
  return filtered
}

async function getCourseById(courseId: string): Promise<Course | null> {
  const courses = getCourses()
  return courses.findOne({ _id: courseId } as Parameters<typeof courses.findOne>[0]) as Promise<Course | null>
}

function ensureVideoOptions(videoChatOptions?: VideoOptions | null): VideoOptions {
  return {
    urlId: videoChatOptions?.urlId || generateStringId('video'),
    joined: videoChatOptions?.joined || [],
    apiOptions: {
      ...defaultVideoChatApiOptions,
      ...(videoChatOptions?.apiOptions || {}),
    },
  }
}

function parseApiOptions(raw: unknown): VideoOptions['apiOptions'] {
  const options = (raw || {}) as Record<string, unknown>
  return {
    startAudioMuted: Boolean(options.startAudioMuted),
    startVideoMuted: Boolean(options.startVideoMuted),
    startTileView: Boolean(options.startTileView),
  }
}

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
    const user = req.user as User
    const courses = getCourses()
    const course = await courses.findOne({ _id: req.params.courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
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
    const users = getUsers()
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

/** GET /api/courses/:courseId/groups/manage */
router.get('/:courseId/groups/manage', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const studentIds = (course.students || []).filter((studentId): studentId is string => typeof studentId === 'string' && studentId.length > 0)
    const users = getUsers()
    const studentDocs = studentIds.length > 0
      ? await users
          .find(
            { _id: { $in: studentIds } } as Parameters<typeof users.find>[0],
            { projection: { _id: 1, emails: 1, 'profile.firstname': 1, 'profile.lastname': 1 } }
          )
          .toArray()
      : []

    const students = studentDocs
      .map((student) => ({
        _id: student._id,
        firstname: student.profile.firstname || '',
        lastname: student.profile.lastname || '',
        email: student.emails?.[0]?.address || '',
      }))
      .sort((a, b) => {
        const byLast = a.lastname.localeCompare(b.lastname)
        if (byLast !== 0) return byLast
        return a.firstname.localeCompare(b.firstname)
      })

    res.json({
      courseId: req.params.courseId,
      groupCategories: course.groupCategories || [],
      students,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/groups/categories */
router.post('/:courseId/groups/categories', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const categoryName = String(req.body?.categoryName || '').trim()
    if (!categoryName) return res.status(400).json({ error: 'categoryName required.' })

    const nGroups = parsePositiveInteger(req.body?.nGroups, 1)
    const categories = [...(course.groupCategories || [])]
    let category = categories.find((entry) => entry.categoryName === categoryName)
    if (!category) {
      category = {
        categoryNumber: nextCategoryNumber(categories),
        categoryName,
        groups: [],
      }
      categories.push(category)
    }

    const groups = category.groups || []
    let groupNumber = nextGroupNumber(groups)
    for (let index = 0; index < nGroups; index += 1) {
      groups.push(createDefaultGroup(groupNumber))
      groupNumber += 1
    }
    category.groups = groups

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )

    res.json({ groupCategories: categories })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/courses/:courseId/groups/categories/:categoryNumber */
router.delete('/:courseId/groups/categories/:categoryNumber', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const categoryNumber = Number(req.params.categoryNumber)
    if (!Number.isFinite(categoryNumber) || categoryNumber < 1) {
      return res.status(400).json({ error: 'Invalid category number.' })
    }

    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const categories = [...(course.groupCategories || [])]
    const nextCategories = categories.filter((category) => Number(category.categoryNumber) !== categoryNumber)
    if (nextCategories.length === categories.length) {
      return res.status(404).json({ error: 'Category not found.' })
    }

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: nextCategories } }
    )

    res.json({ groupCategories: nextCategories })
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/groups/categories/:categoryNumber/groups */
router.post('/:courseId/groups/categories/:categoryNumber/groups', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const categoryNumber = Number(req.params.categoryNumber)
    if (!Number.isFinite(categoryNumber) || categoryNumber < 1) {
      return res.status(400).json({ error: 'Invalid category number.' })
    }

    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const categories = [...(course.groupCategories || [])]
    const category = categories.find((entry) => Number(entry.categoryNumber) === categoryNumber)
    if (!category) return res.status(404).json({ error: 'Category not found.' })

    const nGroups = parsePositiveInteger(req.body?.nGroups, 1)
    const groups = category.groups || []
    let groupNumber = nextGroupNumber(groups)
    for (let index = 0; index < nGroups; index += 1) {
      groups.push(createDefaultGroup(groupNumber))
      groupNumber += 1
    }
    category.groups = groups

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )

    res.json({ groupCategories: categories })
  } catch (err) {
    next(err)
  }
})

/** PATCH /api/courses/:courseId/groups/categories/:categoryNumber/groups/:groupNumber */
router.patch('/:courseId/groups/categories/:categoryNumber/groups/:groupNumber', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const categoryNumber = Number(req.params.categoryNumber)
    const groupNumber = Number(req.params.groupNumber)
    if (!Number.isFinite(categoryNumber) || categoryNumber < 1) {
      return res.status(400).json({ error: 'Invalid category number.' })
    }
    if (!Number.isFinite(groupNumber) || groupNumber < 1) {
      return res.status(400).json({ error: 'Invalid group number.' })
    }

    const groupName = String(req.body?.groupName || '').trim()
    if (!groupName) return res.status(400).json({ error: 'groupName required.' })

    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const categories = [...(course.groupCategories || [])]
    const category = categories.find((entry) => Number(entry.categoryNumber) === categoryNumber)
    if (!category) return res.status(404).json({ error: 'Category not found.' })

    const groups = category.groups || []
    const group = groups.find((entry) => Number(entry.groupNumber) === groupNumber)
    if (!group) return res.status(404).json({ error: 'Group not found.' })

    group.groupName = groupName
    category.groups = groups

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )

    res.json({ groupCategories: categories })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/courses/:courseId/groups/categories/:categoryNumber/groups/:groupNumber */
router.delete('/:courseId/groups/categories/:categoryNumber/groups/:groupNumber', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const categoryNumber = Number(req.params.categoryNumber)
    const groupNumber = Number(req.params.groupNumber)
    if (!Number.isFinite(categoryNumber) || categoryNumber < 1) {
      return res.status(400).json({ error: 'Invalid category number.' })
    }
    if (!Number.isFinite(groupNumber) || groupNumber < 1) {
      return res.status(400).json({ error: 'Invalid group number.' })
    }

    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const categories = [...(course.groupCategories || [])]
    const category = categories.find((entry) => Number(entry.categoryNumber) === categoryNumber)
    if (!category) return res.status(404).json({ error: 'Category not found.' })

    const groups = [...(category.groups || [])]
    if (groups.length < 2) {
      return res.status(400).json({ error: 'Must have at least one group in category.' })
    }

    const nextGroups = groups.filter((entry) => Number(entry.groupNumber) !== groupNumber)
    if (nextGroups.length === groups.length) {
      return res.status(404).json({ error: 'Group not found.' })
    }
    category.groups = nextGroups

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )

    res.json({ groupCategories: categories })
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/groups/categories/:categoryNumber/groups/:groupNumber/students/:studentId/toggle */
router.post('/:courseId/groups/categories/:categoryNumber/groups/:groupNumber/students/:studentId/toggle', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const categoryNumber = Number(req.params.categoryNumber)
    const groupNumber = Number(req.params.groupNumber)
    const studentId = String(req.params.studentId || '')

    if (!Number.isFinite(categoryNumber) || categoryNumber < 1) {
      return res.status(400).json({ error: 'Invalid category number.' })
    }
    if (!Number.isFinite(groupNumber) || groupNumber < 1) {
      return res.status(400).json({ error: 'Invalid group number.' })
    }
    if (!studentId) {
      return res.status(400).json({ error: 'studentId required.' })
    }

    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!(course.students || []).includes(studentId)) {
      return res.status(404).json({ error: 'Student is not enrolled in this course.' })
    }

    const categories = [...(course.groupCategories || [])]
    const category = categories.find((entry) => Number(entry.categoryNumber) === categoryNumber)
    if (!category) return res.status(404).json({ error: 'Category not found.' })

    const groups = category.groups || []
    const group = groups.find((entry) => Number(entry.groupNumber) === groupNumber)
    if (!group) return res.status(404).json({ error: 'Group not found.' })

    const currentStudents = [...(group.students || [])]
    const studentIndex = currentStudents.indexOf(studentId)
    if (studentIndex >= 0) {
      currentStudents.splice(studentIndex, 1)
    } else {
      currentStudents.push(studentId)
    }
    group.students = currentStudents
    category.groups = groups

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )

    res.json({ groupCategories: categories })
  } catch (err) {
    next(err)
  }
})

/** GET /api/courses/:courseId/video-chat-config */
router.get('/:courseId/video-chat-config', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })

    const settings = await getSettings().findOne({})
    const enabledCourseIds = new Set(settings?.Jitsi_EnabledCourses || [])
    const isInstructor = isCourseInstructor(user, course)
    const users = getUsers()
    const participantIds = course.videoChatOptions?.joined || []
    const participantUsers = participantIds.length > 0
      ? await users.find({ _id: { $in: participantIds } } as Parameters<typeof users.find>[0]).toArray()
      : []
    res.json({
      enabled: Boolean(settings?.Jitsi_Enabled) && enabledCourseIds.has(req.params.courseId),
      domain: settings?.Jitsi_Domain || '',
      whiteboardDomain: settings?.Jitsi_WhiteboardDomain || '',
      etherpadDomain: settings?.Jitsi_EtherpadDomain || '',
      courseVideoChatOptions: course.videoChatOptions || null,
      courseParticipants: participantUsers.map((participant) => ({
        _id: participant._id,
        firstname: participant.profile.firstname,
        lastname: participant.profile.lastname,
      })),
      groupCategories: getFilteredGroupCategories(course, user, isInstructor),
      isInstructor,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/toggle */
router.post('/:courseId/video-chat/toggle', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const enabled = Boolean(req.body?.enabled)
    if (enabled) {
      const current = ensureVideoOptions(course.videoChatOptions)
      await courses.updateOne(
        { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
        { $set: { videoChatOptions: current } }
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

/** POST /api/courses/:courseId/video-chat/options */
router.post('/:courseId/video-chat/options', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!course.videoChatOptions) return res.status(400).json({ error: 'Course video chat is not enabled.' })

    const apiOptions = parseApiOptions(req.body?.apiOptions)
    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { 'videoChatOptions.apiOptions': apiOptions } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/clear */
router.post('/:courseId/video-chat/clear', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { 'videoChatOptions.joined': [] } }
    )
    const updated = await getCourseById(req.params.courseId)
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
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
    if (!course.videoChatOptions) return res.status(400).json({ error: 'Course video chat is not enabled.' })

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
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })

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

/** POST /api/courses/:courseId/video-chat/categories/:categoryNumber/toggle */
router.post('/:courseId/video-chat/categories/:categoryNumber/toggle', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    const categoryNumber = Number(req.params.categoryNumber)
    const categories = [...(course.groupCategories || [])]
    const category = categories.find((cat) => Number(cat.categoryNumber) === categoryNumber)
    if (!category) return res.status(404).json({ error: 'Category not found.' })

    const enabled = Boolean(req.body?.enabled)
    if (enabled) {
      category.catVideoChatOptions = ensureVideoOptions(category.catVideoChatOptions)
      category.groups = (category.groups || []).map((group) => ({
        ...group,
        joinedVideoChat: [],
        helpVideoChat: false,
      }))
    } else {
      delete category.catVideoChatOptions
    }

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/categories/:categoryNumber/options */
router.post('/:courseId/video-chat/categories/:categoryNumber/options', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    const categoryNumber = Number(req.params.categoryNumber)
    const categories = [...(course.groupCategories || [])]
    const category = categories.find((cat) => Number(cat.categoryNumber) === categoryNumber)
    if (!category) return res.status(404).json({ error: 'Category not found.' })
    if (!category.catVideoChatOptions) return res.status(400).json({ error: 'Category video chat is not enabled.' })

    category.catVideoChatOptions = {
      ...category.catVideoChatOptions,
      apiOptions: parseApiOptions(req.body?.apiOptions),
    }

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/categories/:categoryNumber/clear */
router.post('/:courseId/video-chat/categories/:categoryNumber/clear', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    const categoryNumber = Number(req.params.categoryNumber)
    const categories = [...(course.groupCategories || [])]
    const category = categories.find((cat) => Number(cat.categoryNumber) === categoryNumber)
    if (!category) return res.status(404).json({ error: 'Category not found.' })

    category.groups = (category.groups || []).map((group) => ({
      ...group,
      joinedVideoChat: [],
      helpVideoChat: false,
    }))

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: categories } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/join */
router.post('/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/join', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })

    const category = findCategory(course, Number(req.params.categoryNumber))
    if (!category) return res.status(404).json({ error: 'Category not found.' })
    if (!category.catVideoChatOptions) return res.status(400).json({ error: 'Category video chat is not enabled.' })

    const group = findGroup(category, Number(req.params.groupNumber))
    if (!group) return res.status(404).json({ error: 'Group not found.' })

    const instructor = isCourseInstructor(user, course)
    const userId = user._id || ''
    if (!instructor && !(group.students || []).includes(userId)) {
      return res.status(403).json({ error: 'Not in group.' })
    }

    const joined = new Set(group.joinedVideoChat || [])
    joined.add(userId)
    group.joinedVideoChat = Array.from(joined)
    if (instructor) group.helpVideoChat = false

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: course.groupCategories || [] } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/leave */
router.post('/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/leave', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })

    const category = findCategory(course, Number(req.params.categoryNumber))
    if (!category) return res.status(404).json({ error: 'Category not found.' })
    const group = findGroup(category, Number(req.params.groupNumber))
    if (!group) return res.status(404).json({ error: 'Group not found.' })

    const userId = user._id || ''
    group.joinedVideoChat = (group.joinedVideoChat || []).filter((joinedId) => joinedId !== userId)
    if ((group.joinedVideoChat || []).length < 1) group.helpVideoChat = false

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: course.groupCategories || [] } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/help/toggle */
router.post('/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/help/toggle', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (isCourseInstructor(user, course)) return res.status(403).json({ error: 'Only students can use help call.' })
    if (!isCourseStudent(user, course)) return res.status(403).json({ error: 'Forbidden.' })

    const category = findCategory(course, Number(req.params.categoryNumber))
    if (!category) return res.status(404).json({ error: 'Category not found.' })
    const group = findGroup(category, Number(req.params.groupNumber))
    if (!group) return res.status(404).json({ error: 'Group not found.' })
    if (!(group.students || []).includes(user._id || '')) return res.status(403).json({ error: 'Not in group.' })

    group.helpVideoChat = !group.helpVideoChat

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: course.groupCategories || [] } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/courses/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/clear */
router.post('/:courseId/video-chat/categories/:categoryNumber/groups/:groupNumber/clear', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const courses = getCourses()
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const category = findCategory(course, Number(req.params.categoryNumber))
    if (!category) return res.status(404).json({ error: 'Category not found.' })
    const group = findGroup(category, Number(req.params.groupNumber))
    if (!group) return res.status(404).json({ error: 'Group not found.' })
    group.joinedVideoChat = []
    group.helpVideoChat = false

    await courses.updateOne(
      { _id: req.params.courseId } as Parameters<typeof courses.updateOne>[0],
      { $set: { groupCategories: course.groupCategories || [] } }
    )
    const updated = await getCourseById(req.params.courseId)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** GET /api/courses/:courseId/video-chat/connection */
router.get('/:courseId/video-chat/connection', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
    if (!course.videoChatOptions) return res.status(400).json({ error: 'Course video chat is not enabled.' })

    const settings = await getSettings().findOne({})
    const roomName = getJitsiCourseRoomName(course)
    if (!roomName) return res.status(400).json({ error: 'Invalid course room configuration.' })
    const apiOptions = {
      ...defaultVideoChatApiOptions,
      ...(course.videoChatOptions.apiOptions || {}),
      subjectTitle: 'Course chat',
    }
    const configOverwrite = {
      ...defaultJitsiConfigOverwrite,
      startWithAudioMuted: apiOptions.startAudioMuted,
      startWithVideoMuted: apiOptions.startVideoMuted,
    }

    res.json({
      domain: settings?.Jitsi_Domain || '',
      whiteboardDomain: settings?.Jitsi_WhiteboardDomain || '',
      etherpadDomain: settings?.Jitsi_EtherpadDomain || '',
      connectionInfo: {
        options: {
          roomName,
          userInfo: { displayName: toDisplayName(user) },
          interfaceConfigOverwrite: defaultJitsiInterfaceConfigOverwrite,
          configOverwrite,
        },
        apiOptions,
        courseId: req.params.courseId,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/courses/:courseId/video-chat/categories/:categoryNumber/connection */
router.get('/:courseId/video-chat/categories/:categoryNumber/connection', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const course = await getCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })

    const category = findCategory(course, Number(req.params.categoryNumber))
    if (!category) return res.status(404).json({ error: 'Category not found.' })
    if (!category.catVideoChatOptions) return res.status(400).json({ error: 'Category video chat is not enabled.' })
    const groups = category.groups || []
    const instructor = isCourseInstructor(user, course)
    const requestedGroupNumber = Number(req.query.groupNumber || req.params.groupNumber)
    const userId = user._id || ''
    let group: Group | null = null
    if (instructor && Number.isFinite(requestedGroupNumber)) {
      group = groups.find((g) => Number(g.groupNumber) === requestedGroupNumber) || null
    } else {
      group = groups.find((g) => (g.students || []).includes(userId)) || null
    }
    if (!group) return res.status(404).json({ error: 'Group not found.' })

    const roomName = getJitsiGroupRoomName(course, category, group)
    if (!roomName) return res.status(400).json({ error: 'Invalid group room configuration.' })
    const settings = await getSettings().findOne({})
    const apiOptions = {
      ...defaultVideoChatApiOptions,
      ...(category.catVideoChatOptions.apiOptions || {}),
      subjectTitle: `${category.categoryName || 'Category'}: ${group.groupName || 'Group'}`,
    }
    const configOverwrite = {
      ...defaultJitsiConfigOverwrite,
      startWithAudioMuted: apiOptions.startAudioMuted,
      startWithVideoMuted: apiOptions.startVideoMuted,
    }

    res.json({
      domain: settings?.Jitsi_Domain || '',
      whiteboardDomain: settings?.Jitsi_WhiteboardDomain || '',
      etherpadDomain: settings?.Jitsi_EtherpadDomain || '',
      connectionInfo: {
        options: {
          roomName,
          userInfo: { displayName: toDisplayName(user) },
          interfaceConfigOverwrite: defaultJitsiInterfaceConfigOverwrite,
          configOverwrite,
        },
        apiOptions,
        courseId: req.params.courseId,
        categoryNumber: Number(category.categoryNumber),
        groupNumber: Number(group.groupNumber),
        helpVideoChat: Boolean(group.helpVideoChat),
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
