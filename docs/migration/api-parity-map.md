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
| `courses.addStudentByEmail` | `POST /api/courses/:courseId/students` (`email`) |
| `courses.addTA` | `POST /api/courses/:courseId/instructors` (`email`) |
| `courses.removeTA` | `DELETE /api/courses/:courseId/instructors/:instructorId` |
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
| `questions.show/hide stats/correct/question` | `PUT /api/questions/:questionId` (`sessionOptions.*` toggles used by run-session controls) |
| `questions.copy/copyToLibrary` | `POST /api/questions/:questionId/copy` |
| `questions.copyToSession` | `POST /api/sessions/:sessionId/questions/:questionId/copy` |

### Responses
| Meteor method | New endpoint |
|---|---|
| `responses.add` | `POST /api/responses` |
| `responses.update` | `PUT /api/responses/:responseId` |
| `responses.makeUneditable` | implicit through quiz submit path |
| session response export | `GET /api/responses/session/:sessionId/export` |

### Grades
| Meteor method | New endpoint |
|---|---|
| `grades.calcSessionGrades` | `POST /api/grades/calc-session/:sessionId` |
| `grades.update` | `PUT /api/grades/:gradeId` |
| `grades.hide/showToStudents` | `PUT /api/grades/:gradeId/visible` and `PUT /api/grades/session/:sessionId/visible` |
| course grade export | `GET /api/grades/course/:courseId/export` |
| session grade export | `GET /api/grades/session/:sessionId/export` |

## Open parity work
- close remaining instructor run-session edge semantics
- finalize L6 video/Jitsi edge-matrix parity
