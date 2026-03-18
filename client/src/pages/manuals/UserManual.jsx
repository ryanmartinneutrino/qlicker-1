import { Fragment } from 'react';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  canAccessManualRole,
  getAvailableManualRoles,
  getManualPath,
  getPreferredManualRole,
  USER_MANUAL_ROLES,
} from '../../utils/userManuals';

function ManualScreenshot({ screenshot, figureId }) {
  const tabs = Array.isArray(screenshot?.tabs) ? screenshot.tabs : [];
  const sidebarItems = Array.isArray(screenshot?.sidebarItems) ? screenshot.sidebarItems : [];
  const cards = Array.isArray(screenshot?.cards) ? screenshot.cards : [];
  const chips = Array.isArray(screenshot?.chips) ? screenshot.chips : [];

  return (
    <Box component="figure" sx={{ m: 0 }} aria-labelledby={`${figureId}-title`}>
      <Paper
        variant="outlined"
        sx={{
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Chip label={screenshot.windowBadge} size="small" color="primary" variant="outlined" />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>{screenshot.windowTitle}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>{screenshot.windowNote}</Typography>
        </Box>

        <Box sx={{ p: { xs: 1.5, md: 2 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '200px minmax(0, 1fr)' } }}>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1, fontWeight: 700 }}>
              {screenshot.sidebarTitle}
            </Typography>
            <Stack spacing={1}>
              {sidebarItems.map((item) => (
                <Box
                  key={item}
                  sx={{
                    px: 1.25,
                    py: 0.9,
                    bgcolor: 'action.hover',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2">{item}</Typography>
                </Box>
              ))}
            </Stack>
          </Paper>

          <Stack spacing={1.5}>
            {!!tabs.length && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {tabs.map((tab) => (
                  <Chip key={tab} label={tab} color="primary" variant="outlined" size="small" />
                ))}
              </Stack>
            )}
            {!!chips.length && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {chips.map((chip) => (
                  <Chip key={chip} label={chip} size="small" variant="outlined" />
                ))}
              </Stack>
            )}
            <Stack spacing={1.5}>
              {cards.map((card) => (
                <Paper key={card.title} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{card.title}</Typography>
                    {Array.isArray(card.lines) && card.lines.map((line) => (
                      <Typography key={line} variant="body2" color="text.secondary">{line}</Typography>
                    ))}
                    {Array.isArray(card.metrics) && (
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {card.metrics.map((metric) => (
                          <Chip key={metric} label={metric} size="small" color="secondary" variant="outlined" />
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>
        </Box>
      </Paper>
      <Typography id={`${figureId}-title`} component="figcaption" variant="subtitle2" sx={{ mt: 1.5, fontWeight: 700 }}>
        {screenshot.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {screenshot.description}
      </Typography>
    </Box>
  );
}

function getScreenshotPreset(t, screenshot) {
  if (!screenshot?.variant) return null;

  const base = {
    title: screenshot.title,
    description: screenshot.description,
  };

  switch (screenshot.variant) {
    case 'adminOverview':
      return {
        ...base,
        windowBadge: t('manuals.shared.roles.admin'),
        windowTitle: t('admin.title'),
        windowNote: t('manuals.shared.screenshotAutosave'),
        sidebarTitle: t('manuals.shared.screenshotAreas'),
        sidebarItems: [
          t('admin.tabs.settings'),
          t('admin.tabs.users'),
          t('admin.tabs.courses'),
          t('admin.tabs.storage'),
          t('admin.tabs.sso'),
          t('admin.tabs.video'),
        ],
        tabs: [
          t('admin.tabs.settings'),
          t('admin.tabs.users'),
          t('admin.tabs.courses'),
        ],
        chips: [
          t('admin.settings.locale'),
          t('admin.settings.dateFormat'),
          t('admin.settings.timeFormat'),
        ],
        cards: [
          {
            title: t('manuals.shared.screenshotPolicies'),
            lines: [
              t('admin.settings.restrictDomain'),
              t('admin.settings.requireVerified'),
            ],
            metrics: [t('admin.users.role'), t('common.status'), t('common.actions')],
          },
          {
            title: t('manuals.shared.screenshotSupport'),
            lines: [
              t('admin.users.userPropertiesHelp'),
              t('manuals.shared.screenshotManualSwitcher'),
            ],
            metrics: [
              t('manuals.shared.roles.admin'),
              t('manuals.shared.roles.professor'),
              t('manuals.shared.roles.student'),
            ],
          },
        ],
      };
    case 'adminStorage':
      return {
        ...base,
        windowBadge: t('admin.tabs.storage'),
        windowTitle: t('admin.tabs.storage'),
        windowNote: t('manuals.shared.screenshotProviderFields'),
        sidebarTitle: t('manuals.shared.screenshotStorageModes'),
        sidebarItems: [
          t('admin.storage.local'),
          t('admin.storage.s3'),
          t('admin.storage.azure'),
        ],
        tabs: [
          t('admin.storage.bucket'),
          t('admin.storage.region'),
          t('admin.storage.storageContainer'),
        ],
        chips: [
          t('manuals.shared.screenshotSecretFields'),
          t('manuals.shared.screenshotEndpoint'),
          t('manuals.shared.screenshotVerification'),
        ],
        cards: [
          {
            title: t('admin.storage.s3'),
            lines: [
              t('admin.storage.bucket'),
              t('admin.storage.accessKeyId'),
            ],
            metrics: [
              t('admin.storage.region'),
              t('admin.storage.endpoint'),
              t('admin.storage.forcePathStyle'),
            ],
          },
          {
            title: t('admin.storage.azure'),
            lines: [
              t('admin.storage.storageAccount'),
              t('admin.storage.storageAccessKey'),
            ],
            metrics: [
              t('admin.storage.storageContainer'),
              t('manuals.shared.screenshotVerification'),
            ],
          },
        ],
      };
    case 'professorCourse':
      return {
        ...base,
        windowBadge: t('manuals.shared.roles.professor'),
        windowTitle: t('professor.dashboard.myCourses'),
        windowNote: t('manuals.shared.screenshotCourseSetup'),
        sidebarTitle: t('manuals.shared.screenshotCourseActions'),
        sidebarItems: [
          t('professor.dashboard.createCourse'),
          t('professor.course.settings'),
          t('professor.course.copySession'),
          t('professor.course.grades'),
          t('questionLibrary.title'),
        ],
        tabs: [
          t('professor.course.interactiveSessions'),
          t('professor.course.students'),
          t('professor.course.grades'),
        ],
        chips: [
          t('professor.course.topics'),
          t('professor.course.enrollmentCode'),
          t('professor.course.quizTimeFormat'),
        ],
        cards: [
          {
            title: t('manuals.shared.screenshotOrganization'),
            lines: [
              t('professor.course.topicsHelp', { count: 3 }),
              t('professor.course.semesterLegacyHelp'),
            ],
            metrics: [
              t('professor.dashboard.semester'),
              t('professor.dashboard.year'),
              t('professor.dashboard.sectionLabel'),
            ],
          },
          {
            title: t('manuals.shared.screenshotReuse'),
            lines: [
              t('professor.course.copySession'),
              t('questionLibrary.title'),
            ],
            metrics: [
              t('common.copy'),
              t('common.search'),
              t('common.view'),
            ],
          },
        ],
      };
    case 'professorSession':
      return {
        ...base,
        windowBadge: t('pageTitles.sessionEditor'),
        windowTitle: t('pageTitles.sessionEditor'),
        windowNote: t('manuals.shared.screenshotSessionFlow'),
        sidebarTitle: t('manuals.shared.screenshotEditorActions'),
        sidebarItems: [
          t('professor.sessionEditor.addQuestion'),
          t('questions.types.slide'),
          t('questionLibrary.title'),
          t('questionLibrary.import.title'),
          t('professor.sessionEditor.exportSession'),
        ],
        tabs: [
          t('professor.sessionEditor.sessionSettings'),
          t('manuals.shared.questionsLabel'),
          t('manuals.shared.screenshotQuizScheduling'),
        ],
        chips: [
          t('professor.sessionEditor.quiz'),
          t('professor.sessionEditor.reviewable'),
          t('professor.sessionEditor.requirePasscode'),
        ],
        cards: [
          {
            title: t('manuals.shared.screenshotOrdering'),
            lines: [
              t('professor.sessionEditor.addQuestion'),
              t('student.course.copyFromQuestionLibrary'),
            ],
            metrics: [
              t('questions.types.multipleChoice'),
              t('questions.types.shortAnswer'),
              t('questions.types.slide'),
            ],
          },
          {
            title: t('manuals.shared.screenshotQuizControls'),
            lines: [
              t('professor.sessionEditor.quizHelp'),
              t('professor.sessionEditor.reviewableHelp'),
            ],
            metrics: [
              t('professor.sessionEditor.quizStart'),
              t('professor.sessionEditor.quizEnd'),
              t('professor.sessionEditor.quizExtensions'),
            ],
          },
        ],
      };
    case 'studentCourse':
      return {
        ...base,
        windowBadge: t('manuals.shared.roles.student'),
        windowTitle: t('manuals.shared.screenshotStudentCourseDashboard'),
        windowNote: t('manuals.shared.screenshotChooseActivity'),
        sidebarTitle: t('manuals.shared.screenshotStudentActions'),
        sidebarItems: [
          t('student.course.lectures'),
          t('student.course.quizzes'),
          t('student.course.practiceSessions'),
          t('questionLibrary.title'),
          t('student.course.grades'),
        ],
        tabs: [
          t('student.course.lectures'),
          t('student.course.quizzes'),
          t('student.course.practiceSessions'),
        ],
        chips: [
          t('student.dashboard.enrollmentCode'),
          t('questionLibrary.title'),
          t('student.course.grades'),
        ],
        cards: [
          {
            title: t('manuals.shared.screenshotActivityTypes'),
            lines: [
              t('student.course.practice'),
              t('student.course.review'),
            ],
            metrics: [
              t('pageTitles.liveSession'),
              t('pageTitles.quiz'),
              t('pageTitles.sessionReview'),
            ],
          },
          {
            title: t('manuals.shared.screenshotStayOriented'),
            lines: [
              t('student.liveSession.loadingLiveSession'),
              t('student.liveSession.backToCourse'),
            ],
            metrics: [
              t('common.back'),
              t('common.next'),
              t('dashboard.liveSessions'),
            ],
          },
        ],
      };
    case 'studentReview':
      return {
        ...base,
        windowBadge: t('pageTitles.sessionReview'),
        windowTitle: t('pageTitles.sessionReview'),
        windowNote: t('manuals.shared.screenshotQuestionAtATime'),
        sidebarTitle: t('manuals.shared.screenshotReviewTools'),
        sidebarItems: [
          t('student.sessionReview.oneAtATime'),
          t('student.sessionReview.allQuestions'),
          t('student.sessionReview.showMyResponse'),
          t('student.sessionReview.hideMyResponse'),
          t('student.sessionReview.backToCourse'),
        ],
        tabs: [
          t('student.sessionReview.oneAtATime'),
          t('student.sessionReview.allQuestions'),
        ],
        chips: [
          t('student.sessionReview.instructorFeedback'),
          t('student.sessionReview.sessionGrade'),
          t('student.sessionReview.participation'),
        ],
        cards: [
          {
            title: t('manuals.shared.screenshotFeedback'),
            lines: [
              t('student.sessionReview.newFeedbackReceived'),
              t('student.sessionReview.dismiss'),
            ],
            metrics: [
              t('manuals.shared.screenshotCorrectAnswer'),
              t('common.points'),
              t('manuals.shared.screenshotAttempts'),
            ],
          },
          {
            title: t('manuals.shared.screenshotPracticeNext'),
            lines: [
              t('questionLibrary.title'),
              t('student.course.newPracticeSession'),
            ],
            metrics: [
              t('common.create'),
              t('student.course.review'),
              t('common.next'),
            ],
          },
        ],
      };
    default:
      return null;
  }
}

function Section({ section, index, t }) {
  const bullets = Array.isArray(section?.bullets) ? section.bullets : [];
  const paragraphs = Array.isArray(section?.paragraphs) ? section.paragraphs : [];
  const screenshot = getScreenshotPreset(t, section?.screenshot);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {index + 1}. {section.title}
          </Typography>
          {section.subtitle ? (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
              {section.subtitle}
            </Typography>
          ) : null}
        </Box>

        {paragraphs.map((paragraph) => (
          <Typography key={paragraph} variant="body1">{paragraph}</Typography>
        ))}

        {!!bullets.length && (
          <Box component="ul" sx={{ m: 0, pl: 3, display: 'grid', gap: 1 }}>
            {bullets.map((bullet) => (
              <Typography component="li" key={bullet} variant="body1">
                {bullet}
              </Typography>
            ))}
          </Box>
        )}

        {section.note ? <Alert severity="info">{section.note}</Alert> : null}
        {section.warning ? <Alert severity="warning">{section.warning}</Alert> : null}
        {section.success ? <Alert severity="success">{section.success}</Alert> : null}

        {screenshot ? <ManualScreenshot screenshot={screenshot} figureId={`manual-section-${index}`} /> : null}
      </Stack>
    </Paper>
  );
}

export default function UserManual() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { role: requestedRole } = useParams();
  const roles = user?.profile?.roles || [];
  const preferredRole = getPreferredManualRole(roles);
  const manualRole = USER_MANUAL_ROLES.includes(requestedRole) ? requestedRole : preferredRole;

  if (!USER_MANUAL_ROLES.includes(requestedRole || '')) {
    return <Navigate to={getManualPath(manualRole)} replace />;
  }

  const availableRoles = getAvailableManualRoles(roles);
  const canAccess = canAccessManualRole(roles, manualRole);
  const value = t(`manuals.${manualRole}`, { returnObjects: true });
  const manual = value && typeof value === 'object' ? value : {};

  if (!canAccess) {
    return (
      <Box sx={{ p: 3, maxWidth: 860, mx: 'auto' }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h4">{t('accessDenied.title')}</Typography>
            <Alert severity="warning">{t('manuals.shared.accessDenied', { manual: t(`manuals.shared.roles.${manualRole}`) })}</Alert>
            {!!availableRoles.length && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {availableRoles.map((role) => (
                  <Button key={role} component={RouterLink} to={getManualPath(role)} variant="outlined">
                    {t(`manuals.shared.openManualForRole`, { role: t(`manuals.shared.roles.${role}`) })}
                  </Button>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Box>
    );
  }

  const roleColor = manualRole === 'admin' ? 'error' : manualRole === 'student' ? 'success' : 'primary';
  const sections = Array.isArray(manual.sections) ? manual.sections : [];
  const relatedManualRoles = availableRoles;

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="h4" component="h1" gutterBottom>{manual.title}</Typography>
                <Typography variant="body1" color="text.secondary">
                  {manual.intro}
                </Typography>
              </Box>
              <Chip color={roleColor} label={t(`manuals.shared.roles.${manualRole}`)} />
            </Stack>

            <Alert severity="info">{manual.summary}</Alert>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('manuals.shared.quickStartTitle')}
                </Typography>
                <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.75 }}>
                  {(Array.isArray(manual.quickStart) ? manual.quickStart : []).map((step) => (
                    <Typography component="li" key={step} variant="body2" color="text.secondary">{step}</Typography>
                  ))}
                </Box>
              </Box>
              <Divider flexItem orientation="vertical" sx={{ display: { xs: 'none', md: 'block' } }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('manuals.shared.relatedManualsTitle')}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {relatedManualRoles.map((role) => (
                    <Tooltip
                      key={role}
                      title={t('manuals.shared.relatedManualTooltip', { role: t(`manuals.shared.roles.${role}`) })}
                      arrow
                    >
                      <Button component={RouterLink} to={getManualPath(role)} variant={role === manualRole ? 'contained' : 'outlined'}>
                        {t(`manuals.shared.roles.${role}`)}
                      </Button>
                    </Tooltip>
                  ))}
                </Stack>
              </Box>
            </Stack>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{t('manuals.shared.contentsTitle')}</Typography>
          <Stack spacing={1.25}>
            {sections.map((section, index) => (
              <Fragment key={section.title}>
                <Typography variant="body2" color="text.secondary">
                  {index + 1}. {section.title}
                </Typography>
              </Fragment>
            ))}
          </Stack>
        </Paper>

        <Stack spacing={2.5}>
          {sections.map((section, index) => (
            <Section key={section.title} section={section} index={index} t={t} />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
