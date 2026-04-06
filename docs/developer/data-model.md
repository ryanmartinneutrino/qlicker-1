# Database and Data Model

Qlicker stores its persistent application state in MongoDB through Mongoose models. The current app remains compatible with the legacy Meteor data model where required, while adding clearer route and service layers around that data.

## Primary models

### User

Represents students, professors, and admins.

Key concerns:

- email addresses and verification state
- profile names and roles
- SSO-created account flags
- password-login allowance for SSO users
- refresh token versioning
- failed-login counters and temporary lockout state
- per-user locale and profile image data

## Course

Represents a teachable course space.

Key concerns:

- course name, department code, number, section, semester
- enrollment code
- owner and instructors
- enrolled students
- course topics / tags
- whether the course is active
- video options and question-submission permissions

## Session

Represents an activity flow belonging to a course.

Key concerns:

- interactive session vs quiz vs practice quiz behavior
- ordered `questions` array, which can include slides
- current question during live delivery
- join code / passcode settings
- reviewability and visibility
- quiz windows and extensions
- submission and participation tracking

## Question

Represents a question or slide.

Key concerns:

- type, content, options, solution
- creator, owner, course linkage, session linkage
- visibility flags (private, course-visible, broader visibility)
- tags
- session-specific option data such as points, attempts, and scoring settings
- aggregate data such as word cloud or histogram data where applicable

## Response

Represents a student's response to a question.

Key concerns:

- who answered
- which question and session the response belongs to
- answer data structure by question type
- attempt handling
- quiz save vs live-response workflows

## Grade

Represents course/session/question grading state.

Key concerns:

- overall grade value
- per-question marks
- automatic vs manual override state
- feedback text
- grade visibility

## Group

Represents course group categories and memberships.

Key concerns:

- group category definitions
- named groups inside a category
- student membership within a category
- import and export workflows

## Current-model behavior that matters in development

### Session questions are copied

When a library question is added to a session, the session gets its own copied question document with a new `_id`. Code and tests must use the copied session-question id when interacting with session-specific APIs.

### Slides are first-class session items

Slides are represented as question documents with `type: 6`, which allows one ordered session flow containing both content-only and answerable items.

### Session-specific aggregates live with the question/session combination

Features such as word clouds and histograms are stored with question/session data so clients do not need to recompute expensive aggregates on every view.

## Indexing and performance notes

Performance-sensitive lookups are supported by indexes such as:

- Course indexes on owner, instructors, and students
- Session composite index on `courseId + status`

These matter because student dashboards, instructor course lookups, and live-session queries are frequent.

## Legacy compatibility

Legacy compatibility requirements are documented in [`../../meteorjs_migration/LEGACY_DB.md`](../../meteorjs_migration/LEGACY_DB.md). Use that document when a change risks reshaping existing MongoDB fields.
