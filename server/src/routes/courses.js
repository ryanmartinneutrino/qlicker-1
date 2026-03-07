import Course from '../models/Course.js';
import User from '../models/User.js';
import { escapeForRegex } from '../utils/regex.js';

function generateEnrollmentCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function generateUniqueEnrollmentCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateEnrollmentCode();
    const existing = await Course.findOne({ enrollmentCode: code });
    if (!existing) return code;
  }
  throw new Error('Failed to generate a unique enrollment code');
}

const createCourseSchema = {
  body: {
    type: 'object',
    required: ['name', 'deptCode', 'courseNumber', 'section', 'semester'],
    properties: {
      name: { type: 'string', minLength: 1 },
      deptCode: { type: 'string', minLength: 1 },
      courseNumber: { type: 'string', minLength: 1 },
      section: { type: 'string', minLength: 1 },
      semester: { type: 'string', minLength: 1 },
    },
  },
};

const updateCourseSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      deptCode: { type: 'string', minLength: 1 },
      courseNumber: { type: 'string', minLength: 1 },
      section: { type: 'string', minLength: 1 },
      semester: { type: 'string', minLength: 1 },
      inactive: { type: 'boolean' },
      requireVerified: { type: 'boolean' },
      allowStudentQuestions: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

export default async function courseRoutes(app) {
  const { authenticate, requireRole } = app;

  // POST / - Create a course (professor or admin only)
  app.post(
    '/',
    {
      preHandler: requireRole(['professor', 'admin']),
      schema: createCourseSchema,
    },
    async (request, reply) => {
      const { name, deptCode, courseNumber, section, semester } = request.body;
      const userId = request.user.userId;

      const enrollmentCode = await generateUniqueEnrollmentCode();

      const course = await Course.create({
        name,
        deptCode,
        courseNumber,
        section,
        semester,
        owner: userId,
        enrollmentCode,
        instructors: [userId],
      });

      await User.findByIdAndUpdate(userId, {
        $addToSet: { 'profile.courses': course._id },
      });

      return reply.code(201).send({ course });
    }
  );

  // GET / - List courses for current user
  app.get(
    '/',
    { preHandler: authenticate },
    async (request, reply) => {
      const { search, page: pageParam, limit: limitParam } = request.query;
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20));

      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const filter = {};
      if (!isAdmin) {
        if (roles.includes('professor')) {
          filter.instructors = userId;
        } else {
          filter.students = userId;
        }
      }

      if (search) {
        const regex = new RegExp(escapeForRegex(search), 'i');
        filter.$or = [
          { name: regex },
          { deptCode: regex },
          { courseNumber: regex },
        ];
      }

      const projection = { students: 0, groupCategories: 0 };

      const [courses, total] = await Promise.all([
        Course.find(filter, projection)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Course.countDocuments(filter),
      ]);

      return {
        courses,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    }
  );

  // GET /:id - Get a single course by ID
  app.get(
    '/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      const isInstructor = course.instructors.includes(userId);
      const isStudent = course.students.includes(userId);

      if (!isAdmin && !isInstructor && !isStudent) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not enrolled in this course' });
      }

      const obj = course.toObject();

      // Populate instructor data for any authenticated viewer
      if (obj.instructors && obj.instructors.length > 0) {
        const instructorUsers = await User.find({ _id: { $in: obj.instructors } })
          .select('_id profile emails').lean();
        obj.instructors = instructorUsers.map(u => ({ _id: u._id, profile: u.profile, emails: u.emails }));
      }

      // Students only see course info, not other students' details
      if (!isAdmin && !isInstructor) {
        delete obj.students;
        delete obj.groupCategories;
      } else if (obj.students && obj.students.length > 0) {
        // Populate student data for instructors and admins
        const studentUsers = await User.find({ _id: { $in: obj.students } })
          .select('_id profile emails').lean();
        obj.students = studentUsers.map(u => ({ _id: u._id, profile: u.profile, emails: u.emails }));
      }

      return { course: obj };
    }
  );

  // PATCH /:id - Update a course (instructor/admin only)
  app.patch(
    '/:id',
    {
      preHandler: authenticate,
      schema: updateCourseSchema,
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isAdmin && !course.instructors.includes(userId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const allowed = ['name', 'deptCode', 'courseNumber', 'section', 'semester', 'inactive', 'requireVerified', 'allowStudentQuestions'];
      const updates = {};
      for (const key of allowed) {
        if (request.body[key] !== undefined) {
          updates[key] = request.body[key];
        }
      }

      const updated = await Course.findByIdAndUpdate(
        request.params.id,
        { $set: updates },
        { new: true }
      );

      return { course: updated.toObject() };
    }
  );

  // DELETE /:id - Delete a course (owner or admin only)
  app.delete(
    '/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isAdmin && course.owner !== userId) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the course owner or an admin can delete this course' });
      }

      // Remove course from all users' profile.courses
      await User.updateMany(
        { 'profile.courses': course._id },
        { $pull: { 'profile.courses': course._id } }
      );

      await Course.findByIdAndDelete(request.params.id);

      return { success: true };
    }
  );

  // POST /enroll - Enroll by enrollment code
  app.post(
    '/enroll',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['enrollmentCode'],
          properties: {
            enrollmentCode: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { enrollmentCode } = request.body;
      const userId = request.user.userId;

      const course = await Course.findOne({ enrollmentCode });
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Invalid enrollment code' });
      }

      if (course.requireVerified) {
        const enrollingUser = await User.findById(userId);
        if (!enrollingUser?.emails?.[0]?.verified) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Email verification required to enroll in this course' });
        }
      }

      if (course.instructors.includes(userId)) {
        return reply.code(409).send({ error: 'Conflict', message: "Professors can't enroll as students in their own courses" });
      }

      if (course.students.includes(userId)) {
        return reply.code(409).send({ error: 'Conflict', message: 'Already enrolled in this course' });
      }

      await Course.findByIdAndUpdate(course._id, {
        $addToSet: { students: userId },
      });

      await User.findByIdAndUpdate(userId, {
        $addToSet: { 'profile.courses': course._id },
      });

      return { course: course.toObject() };
    }
  );

  // DELETE /:id/students/:studentId - Remove student from course (instructor/admin or self-unenroll)
  app.delete(
    '/:id/students/:studentId',
    { preHandler: authenticate },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');
      const { studentId } = request.params;

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      // Allow: admin, instructor, or the student removing themselves
      const isSelfUnenroll = studentId === userId && course.students.includes(userId);
      if (!isAdmin && !course.instructors.includes(userId) && !isSelfUnenroll) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      await Course.findByIdAndUpdate(course._id, {
        $pull: { students: studentId },
      });

      await User.findByIdAndUpdate(studentId, {
        $pull: { 'profile.courses': course._id },
      });

      return { success: true };
    }
  );

  // POST /:id/students - Add student to course by email (instructor/admin)
  app.post(
    '/:id/students',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
      },
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isAdmin && !course.instructors.includes(userId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const { email } = request.body;
      const student = await User.findOne({ 'emails.address': email.toLowerCase().trim() });
      if (!student) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found with that email' });
      }

      if (course.students.includes(student._id)) {
        return reply.code(409).send({ error: 'Conflict', message: 'Student already enrolled' });
      }

      await Course.findByIdAndUpdate(course._id, {
        $addToSet: { students: student._id },
      });

      await User.findByIdAndUpdate(student._id, {
        $addToSet: { 'profile.courses': course._id },
      });

      return { success: true };
    }
  );

  // POST /:id/instructors - Add instructor/TA (owner/admin only)
  app.post(
    '/:id/instructors',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const callerUserId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isAdmin && course.owner !== callerUserId) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the course owner or an admin can add instructors' });
      }

      const { userId: newInstructorId } = request.body;

      const instructor = await User.findById(newInstructorId);
      if (!instructor) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }

      await Course.findByIdAndUpdate(course._id, {
        $addToSet: { instructors: newInstructorId },
      });

      await User.findByIdAndUpdate(newInstructorId, {
        $addToSet: { 'profile.courses': course._id },
      });

      return { success: true };
    }
  );

  // DELETE /:id/instructors/:instructorId - Remove instructor (owner/admin only)
  app.delete(
    '/:id/instructors/:instructorId',
    { preHandler: authenticate },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const callerUserId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isAdmin && course.owner !== callerUserId) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the course owner or an admin can remove instructors' });
      }

      const { instructorId } = request.params;

      if (course.instructors.length <= 1 && course.instructors.includes(instructorId)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Cannot remove the last instructor from a course' });
      }

      await Course.findByIdAndUpdate(course._id, {
        $pull: { instructors: instructorId },
      });

      await User.findByIdAndUpdate(instructorId, {
        $pull: { 'profile.courses': course._id },
      });

      return { success: true };
    }
  );

  // POST /:id/regenerate-code - Regenerate enrollment code (instructor/admin)
  app.post(
    '/:id/regenerate-code',
    { preHandler: authenticate },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isAdmin && !course.instructors.includes(userId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const enrollmentCode = await generateUniqueEnrollmentCode();
      const updated = await Course.findByIdAndUpdate(
        course._id,
        { $set: { enrollmentCode } },
        { new: true }
      );

      return { enrollmentCode: updated.enrollmentCode };
    }
  );

  // PATCH /:id/active - Toggle active/inactive (instructor/admin)
  app.patch(
    '/:id/active',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['inactive'],
          properties: {
            inactive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const roles = request.user.roles || [];
      const userId = request.user.userId;
      const isAdmin = roles.includes('admin');

      const course = await Course.findById(request.params.id);
      if (!course) {
        return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
      }

      if (!isAdmin && !course.instructors.includes(userId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }

      const updated = await Course.findByIdAndUpdate(
        course._id,
        { $set: { inactive: request.body.inactive } },
        { new: true }
      );

      return { course: updated.toObject() };
    }
  );
}
