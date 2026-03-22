# Professor User Manual

Use this guide to create courses, organize content, build sessions, run live teaching or quizzes, review results, and grade student work in the current Qlicker app.

## At a glance

- **Best starting page:** professor dashboard
- **Best preparation habit:** add course topics before building lots of questions
- **Best review habit:** open review and grading immediately after an activity while the context is still fresh
- **Related guides:** [Student manual](student.md), [Admin manual](admin.md), [Grading guide](grading.md)

## Table of contents

1. [Professor dashboard](#professor-dashboard)
2. [Create and organize a course](#create-and-organize-a-course)
3. [Manage students, instructors, and groups](#manage-students-instructors-and-groups)
4. [Build sessions and quizzes](#build-sessions-and-quizzes)
5. [Use the question library and reuse tools](#use-the-question-library-and-reuse-tools)
6. [Run live sessions](#run-live-sessions)
7. [Review results and grade consistently](#review-results-and-grade-consistently)
8. [Troubleshooting checklist](#troubleshooting-checklist)

## Quick start checklist

1. Create the course with a clear title and a semester label you will reuse consistently.
2. Add course topics before you import or write many questions.
3. Confirm enrollment rules and share the current course code with students.
4. Set up groups before class if you will use them for organization or grading.
5. Build sessions from the course page and decide whether each one is live, quiz-based, or practice-oriented.
6. Review results and recalculate grades after the activity if scoring or manual marks changed.

## Professor dashboard

The professor dashboard is your command center for course setup and day-to-day teaching work.

![Professor dashboard](../assets/manuals/professor-dashboard.png)

From the dashboard you can:

- open existing courses
- create new courses
- search by code, title, section, or semester
- spot active or recent courses quickly
- return to the in-app manual without losing access to your course list

**Recommended habit:** keep a consistent semester naming scheme such as `Fall 2026` or `Winter 2027`. It makes searching, copying, and comparing courses much easier later.

## Create and organize a course

Most teaching work happens from the course page once the course exists.

![Professor course page](../assets/manuals/professor-course.png)

The course workspace combines:

- interactive session lists
- quiz lists
- review and grade access
- student and instructor management
- groups
- video settings when enabled
- course settings
- the course question library

### Recommended setup order

1. Confirm the title, code, section, and semester.
2. Add course topics so questions can be tagged consistently.
3. Review course settings such as enrollment rules, active state, and student question submission permissions.
4. Share the current enrollment code with students.
5. Add instructors or TAs before the term begins.

### Course settings to verify early

| Setting | Why it matters |
| --- | --- |
| Enrollment code | Students need it to join the correct course |
| Active state | Inactive courses confuse students and hide workflows you may expect to see |
| Student question submission | Changes what students can contribute to the library |
| Topic list | Affects tagging, search, and reuse across the course |
| Video availability | Controls whether Jitsi/video workflows appear in the course |

## Manage students, instructors, and groups

### Students

Students usually enroll themselves with the course code, but the Students tab is still important for support work.

Use it to:

- search students by name or email
- confirm whether a student is actually enrolled
- remove a student from the course when needed
- inspect details when troubleshooting access or grades

### Instructors and TAs

Use the Instructors tab to add other teaching staff. Shared teaching staff can help with course workflows, but course ownership and institution-level admin permissions still matter for some settings.

### Groups

Groups are course-specific and are easiest to manage before class begins.

Use the Groups tab to:

- create a group category
- choose how many groups it contains
- rename groups with meaningful labels
- move students between groups
- import or export group assignments as CSV

Groups are especially useful when:

- different TAs grade different student subsets
- you want breakout or discussion organization before class
- participation or review analysis depends on the same grouping later

## Build sessions and quizzes

Sessions in the current app are ordered teaching flows. They can mix slides and response-collecting questions.

![Session editor](../assets/manuals/session-editor.png)

From the session editor you can:

- set the session name and description
- choose whether the activity is interactive or quiz-based
- require a passcode or join code
- set quiz start and end dates
- add quiz extensions
- choose the multiple-select scoring method
- insert slides anywhere in the order
- add questions from the library or create them inline
- export and import session JSON
- open print and PDF-friendly views

### Question types supported in the current app

- multiple choice
- true / false
- multi-select
- short answer
- numerical
- slides (content-only items inside sessions)

### Strong session-building habits

- Use slides before or between questions when students need instructions, context, or worked examples.
- Keep tags aligned with course topics so search and reuse stay clean.
- Check visibility before copying questions into a new context.
- Before publishing a quiz, verify the dates, reviewability setting, and final ordering.
- If a question already has response data, expect some edits to be restricted to protect past results.

## Use the question library and reuse tools

The question library helps with both preparation and reuse.

Use it to:

- search by keyword, type, tags, or visibility
- copy questions into a session
- bulk update visibility for selected questions
- import or export JSON bundles
- review student-submitted material when that workflow is enabled

### Reuse checklist

Before reusing or copying content, verify that:

- the destination course topics still match the copied tags
- quiz dates are still valid
- session-specific visibility and review settings still make sense
- any passcode or release expectations match the new activity

## Run live sessions

Interactive sessions are designed for instructor-paced teaching.

### Typical live-session workflow

1. Launch the session from the course page.
2. Confirm whether join codes or passcodes are required.
3. Move between questions with the navigation controls.
4. Open or close responses for each attempt.
5. Reveal statistics or correct answers when ready.
6. Start a new attempt if students should answer again.
7. End the session when the activity is complete.

### Live teaching tips

- Watch for whether the active item is a **slide** or a **question**. Slides do not collect answers.
- Use the presenter and second-display windows when you need a cleaner classroom display.
- If students report that they can open the session but cannot answer, first check whether responses are currently enabled.
- If statistics are meant to stay hidden until discussion time, reveal them only after the class has committed to answers.

## Review results and grade consistently

After a session or quiz is complete, open the review page to inspect outcomes.

The review workflow helps you:

- inspect response counts and distributions
- review per-question outcomes
- move into grading workflows
- confirm that student participation matches expectations

Qlicker supports both automatic and manual grading.

Use the grading workflows to:

- recalculate grades for one session or many sessions
- inspect each student's marks
- resolve manual-vs-automatic grading conflicts
- edit feedback and point values
- export course grades to CSV

Short-answer questions typically require manual grading, while many objective question types can be autograded.

See also the dedicated [grading guide](grading.md).

## Troubleshooting checklist

### Students cannot join the course

Check:

- the current enrollment code
- whether verified email or SSO is required
- whether the student is already enrolled under another account
- whether the course is active and visible from the student workflow

### Students can open the session but cannot answer

Check:

- whether responses are currently allowed
- whether the active item is a slide rather than a question
- whether the join or passcode settings changed
- whether the session is still running

### Grades do not look correct

Check:

- the session scoring settings
- whether manual marks intentionally override autograding
- whether recalculation is needed after question edits or late grading work
- whether the multiple-select scoring method explains the result

## Related manuals

- [Student user manual](student.md)
- [Admin user manual](admin.md)
- [Grading guide](grading.md)
