# API Parity Map (Meteor -> React/Express)

## Publications to Realtime/REST

| Meteor publication | New equivalent |
|---|---|
| `sessions.single(sessionId)` | `GET /api/sessions/:sessionId` + `subscribe:session` |
| `sessions.forCourse(courseId)` | `GET /api/sessions?courseId=...` + `subscribe:sessions` |
| `questions.inSession(sessionId)` | `GET /api/questions?sessionId=...` + `subscribe:questions` |
| `questions.inCourse(courseId)` | `GET /api/questions?courseId=...` + `subscribe:questions-course` |
| `responses.forQuestion(questionId)` | `GET /api/responses?questionId=...` + `subscribe:responses` |
| `grades.forSession/session/course` | `GET /api/grades?...` + `subscribe:grades` |

## Methods to REST endpoints

### Courses
| Meteor method | New endpoint |
|---|---|
| `courses.insert` | `POST /api/courses` |
| `courses.edit` | `PUT /api/courses/:courseId` |
| `courses.delete` | `DELETE /api/courses/:courseId` |
| `courses.checkAndEnroll` | `POST /api/courses/enroll` |
| `courses.removeStudent` | `DELETE /api/courses/:courseId/students/:studentId` |
| `courses.toggleVideoChat` and related | `/api/courses/:courseId/video-chat/*` |

### Sessions
| Meteor method | New endpoint |
|---|---|
| `sessions.insert` | `POST /api/sessions` |
| `sessions.edit` | `PUT /api/sessions/:sessionId` |
| `sessions.delete` | `DELETE /api/sessions/:sessionId` |
| `sessions.startSession/endSession` | `PUT /api/sessions/:sessionId/status` |
| `sessions.setCurrent` | `PUT /api/sessions/:sessionId/current` |
| `sessions.join` | `POST /api/sessions/:sessionId/join` |
| `sessions.submitQuiz` | `POST /api/sessions/:sessionId/submit` |
| `sessions.updateQuizExtensions` | `PUT /api/sessions/:sessionId` (`quizExtensions`) |

### Questions
| Meteor method | New endpoint |
|---|---|
| `questions.insert` | `POST /api/questions` |
| `questions.update` | `PUT /api/questions/:questionId` |
| `questions.delete` | `DELETE /api/questions/:questionId` |
| `questions.show/hide stats/correct/question` | Open parity gap |
| `questions.copy/copyToSession/copyToLibrary` | Open parity gap |

### Responses
| Meteor method | New endpoint |
|---|---|
| `responses.add` | `POST /api/responses` |
| `responses.update` | `PUT /api/responses/:responseId` |
| `responses.makeUneditable` | implicit through quiz submit path |

### Grades
| Meteor method | New endpoint |
|---|---|
| `grades.calcSessionGrades` | `POST /api/grades/calc-session/:sessionId` |
| `grades.update` | `PUT /api/grades/:gradeId` |
| `grades.hide/showToStudents` | `PUT /api/grades/:gradeId/visible` and `PUT /api/grades/session/:sessionId/visible` |

## Open parity work
- course TA/student-by-email management endpoints
- session-question order/copy/remove operations
- CSV export endpoints (session/course/groups/responses)
