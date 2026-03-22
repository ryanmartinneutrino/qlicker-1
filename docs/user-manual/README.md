# Qlicker User Manuals

These guides describe the current Fastify + React version of Qlicker. They are intentionally role-specific so admins, professors, and students can each follow the workflow that matches the screens they actually see.

## Start here

| Role | Use this manual when you need to… | Main screenshots |
| --- | --- | --- |
| [Student](student.md) | join a course, take part in live sessions, complete quizzes, review feedback, and build practice sessions | course dashboard, review page |
| [Professor](professor.md) | create courses, organize content, run live sessions or quizzes, and interpret results | dashboard, course workspace, session editor |
| [Admin](admin.md) | configure platform-wide settings, storage, SSO, video, and user support workflows | admin dashboard, storage configuration |
| [Grading guide](grading.md) | understand reviewability, recalculation, manual grading, and grade visibility | cross-role workflow notes |

## In-app manual

The application also includes an in-app user manual at `/manual/:role`. It uses the same role split as the markdown manuals, but adds:

- role-aware access control
- a left-side navigation rail on larger screens
- direct links back into the relevant dashboard
- screenshot captions and manual switching without leaving the app

## Screenshot asset locations

Manual screenshots are kept in two places so that the markdown docs and the in-app manual stay aligned:

- `docs/assets/manuals/` — source images used in markdown documentation
- `client/public/manuals/` — public assets served by the React app

When you replace a screenshot, update both locations with the same file.

## Recommended reading order

1. Read the manual for your own role.
2. If you support another role, read that manual next so you can compare the two workflows.
3. Use the [grading guide](grading.md) when you need more detail about recalculation, feedback, or visibility rules.
4. For deployment or operational context, continue with the [production deployment guide](../../production_setup/README.md).
