# Admin User Manual

Use this guide when configuring institution-wide settings, storage, SSO, user roles, and course-level support in the current Qlicker app.

## Quick start

1. Confirm the deployment environment is correct before changing app settings.
2. Review general settings, storage, SSO, and video before broad onboarding.
3. Use the Users and Courses tabs for day-to-day support and verification.

## Admin dashboard

The admin dashboard centralizes institution-wide configuration.

![Admin dashboard](../assets/manuals/admin-dashboard.png)

The current app exposes these major admin tabs:

- **Settings** for general platform defaults
- **Users** for role and account management
- **Courses** for broad course lookup and support
- **Storage** for image backends
- **SSO Configuration** for SAML settings
- **Video** for Jitsi configuration and availability

## General settings

Use the Settings tab to control defaults that affect every user.

Common settings include:

- allowed email domains
- whether verified email is required
- the administrative support email
- login token lifetime
- default locale
- default date format
- default time format

Because the dashboard autosaves after short pauses, review each field carefully before leaving the page.

## User management

The Users tab is your main support surface for accounts.

From there you can:

- search users by name or email
- create accounts directly
- change roles
- verify email status
- inspect or update per-user properties
- control whether local email login is allowed for SSO-created accounts

Use extra care when changing roles because the effect is immediate.

## Course support

The Courses tab helps admins support instructors without signing in as them.

Use it to:

- locate courses by code, title, or term
- verify who owns or teaches a course
- confirm whether a course appears active and ready for students
- reproduce support questions against the current course configuration

## Storage configuration

Qlicker supports multiple image-storage backends.

In the current app, storage configuration is managed from the Storage tab.

Supported modes include:

- local storage
- Amazon S3 or S3-compatible storage
- Azure Blob storage

When configuring storage:

1. Choose the provider.
2. Fill only the fields required by that provider.
3. Save the settings.
4. Upload a test image from the app to confirm read and write behavior.

Treat access keys, secret keys, and similar credentials as secrets.

## SSO configuration

The SSO Configuration tab manages SAML settings for institutional login.

Prepare the following before enabling SSO:

- IdP entry point URL
- logout URL
- entity ID / issuer values
- email, first-name, last-name, role, and student-number attribute mappings
- the IdP certificate
- the SP certificate and private key if your deployment requires them

After making SSO changes, always retest:

- sign-in
- callback handling
- logout
- professor and student role mapping

If SSO is wrong, it can prevent access for many users at once, so make changes during a maintenance window when possible.

## Video configuration

Qlicker can integrate Jitsi-based video workflows.

The Video tab is where you:

- enable or disable video globally
- define the Jitsi domain
- configure related Etherpad settings if used
- verify which courses should expose video options

After configuration, test with a real course before announcing the feature.

## Support workflow recommendations

When resolving user issues:

1. Confirm whether the problem is global, course-specific, or account-specific.
2. Check Settings, then the relevant Users or Courses tab.
3. Compare the workflow against the matching [Professor manual](professor.md) or [Student manual](student.md) so your answer matches what the user actually sees.
4. If the issue involves SSO or storage, retest the live configuration instead of relying on remembered values.

## Troubleshooting

### Users cannot sign in

Check:

- whether SSO is enabled unexpectedly
- whether SSO metadata and certificates are current
- whether local email login is allowed for the affected account
- whether the deployment URLs used by the server match the public environment

### Uploaded images fail

Check:

- the selected storage provider
- the provider credentials
- bucket or container existence and permissions
- whether a recent config change was saved incompletely

### Professors cannot access expected course features

Check:

- their role
- course instructor membership
- course settings such as video availability or question-submission permissions
- whether the feature depends on a global admin setting

## Related manuals

- [Professor user manual](professor.md)
- [Student user manual](student.md)
- [Production deployment guide](../../production_setup/README.md)
