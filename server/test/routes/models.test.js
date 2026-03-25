import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import Course from '../../src/models/Course.js';
import Session from '../../src/models/Session.js';
import Question from '../../src/models/Question.js';
import Response from '../../src/models/Response.js';
import Grade from '../../src/models/Grade.js';

// ---------- Course ----------
describe('Course model', () => {
  it('creates with required fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const course = await Course.create({
      name: 'Intro to CS',
      deptCode: 'CISC',
      courseNumber: '101',
      section: '001',
      owner: 'user123',
      enrollmentCode: 'ABC123',
      semester: 'F2024',
    });

    expect(course._id).toBeDefined();
    expect(course.name).toBe('Intro to CS');
    expect(course.deptCode).toBe('CISC');
    expect(course.courseNumber).toBe('101');
    expect(course.section).toBe('001');
    expect(course.owner).toBe('user123');
    expect(course.enrollmentCode).toBe('ABC123');
    expect(course.semester).toBe('F2024');
  });

  it('sets defaults correctly', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const course = await Course.create({
      name: 'Intro to CS',
      deptCode: 'CISC',
      courseNumber: '101',
      section: '001',
      owner: 'user123',
      enrollmentCode: 'ABC123',
      semester: 'F2024',
    });

    expect(course.inactive).toBe(false);
    expect(course.students).toEqual([]);
    expect(course.instructors).toEqual([]);
    expect(course.sessions).toEqual([]);
    expect(course.requireVerified).toBe(false);
    expect(course.allowStudentQuestions).toBe(false);
    expect(course.groupCategories).toEqual([]);
    expect(course.createdAt).toBeInstanceOf(Date);
  });
});

// ---------- Session ----------
describe('Session model', () => {
  it('creates with required fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const session = await Session.create({
      name: 'Lecture 1',
      courseId: 'course123',
      status: 'hidden',
    });

    expect(session._id).toBeDefined();
    expect(session.name).toBe('Lecture 1');
    expect(session.courseId).toBe('course123');
    expect(session.status).toBe('hidden');
  });

  it('sets defaults correctly', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const session = await Session.create({
      name: 'Lecture 1',
      courseId: 'course123',
      status: 'hidden',
    });

    expect(session.quiz).toBe(false);
    expect(session.practiceQuiz).toBe(false);
    expect(session.questions).toEqual([]);
    expect(session.description).toBe('');
    expect(session.currentQuestion).toBe('');
    expect(session.joined).toEqual([]);
    expect(session.submittedQuiz).toEqual([]);
    expect(session.tags).toEqual([]);
    expect(session.reviewable).toBe(false);
  });

  it('rejects invalid status enum value', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    await expect(
      Session.create({
        name: 'Bad Session',
        courseId: 'course123',
        status: 'invalid_status',
      })
    ).rejects.toThrow();
  });
});

// ---------- Question ----------
describe('Question model', () => {
  it('creates with required fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const question = await Question.create({
      type: 2,
      creator: 'user123',
    });

    expect(question._id).toBeDefined();
    expect(question.type).toBe(2);
    expect(question.creator).toBe('user123');
  });

  it('sets defaults correctly', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const question = await Question.create({
      type: 2,
      creator: 'user123',
    });

    expect(question.public).toBe(false);
    expect(question.approved).toBe(true);
    expect(question.plainText).toBe('');
    expect(question.content).toBe('');
    expect(question.options).toEqual([]);
    expect(question.owner).toBe('');
    expect(question.originalQuestion).toBe('');
    expect(question.sessionId).toBe('');
    expect(question.courseId).toBe('');
    expect(question.solution).toBe('');
    expect(question.imagePath).toBe('');
    expect(question.studentCopyOfPublic).toBe(false);
    expect(question.createdAt).toBeInstanceOf(Date);
  });
});

// ---------- Response ----------
describe('Response model', () => {
  it('creates with required fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const response = await Response.create({
      attempt: 1,
      questionId: 'q123',
      studentUserId: 'student123',
      answer: 'test',
    });

    expect(response._id).toBeDefined();
    expect(response.attempt).toBe(1);
    expect(response.questionId).toBe('q123');
    expect(response.studentUserId).toBe('student123');
    expect(response.answer).toBe('test');
  });

  it('sets defaults correctly', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const response = await Response.create({
      attempt: 1,
      questionId: 'q123',
      studentUserId: 'student123',
      answer: 'test',
    });

    expect(response.answerWysiwyg).toBe('');
    expect(response.submittedAt).toBeUndefined();
    expect(response.submittedIpAddress).toBe('');
    expect(response.editable).toBe(false);
    expect(response.createdAt).toBeInstanceOf(Date);
  });
});

// ---------- Grade ----------
describe('Grade model', () => {
  it('creates with required fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const grade = await Grade.create({
      userId: 'user123',
    });

    expect(grade._id).toBeDefined();
    expect(grade.userId).toBe('user123');
  });

  it('sets defaults correctly', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const grade = await Grade.create({
      userId: 'user123',
    });

    expect(grade.value).toBe(0);
    expect(grade.points).toBe(0);
    expect(grade.outOf).toBe(0);
    expect(grade.participation).toBe(0);
    expect(grade.numAnswered).toBe(0);
    expect(grade.numQuestions).toBe(0);
    expect(grade.numAnsweredTotal).toBe(0);
    expect(grade.numQuestionsTotal).toBe(0);
    expect(grade.joined).toBe(false);
    expect(grade.automatic).toBe(true);
    expect(grade.visibleToStudents).toBe(false);
    expect(grade.needsGrading).toBe(false);
    expect(grade.marks).toEqual([]);
    expect(grade.courseId).toBe('');
    expect(grade.sessionId).toBe('');
    expect(grade.name).toBe('');
  });
});
