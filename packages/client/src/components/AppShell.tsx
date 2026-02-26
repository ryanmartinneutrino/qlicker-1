import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Course, Settings } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { PromoteAccountModal } from './modals/PromoteAccountModal'

const USER_GUIDE_URL = 'https://qlicker.github.io'

type ShellSettings = Partial<Pick<Settings, 'SSO_logoutUrl' | 'SSO_institutionName'>>

function fullCourseCode(course: Course): string {
  return `${course.deptCode} ${course.courseNumber}-${course.section}`.trim()
}

function parseCourseId(pathname: string): string {
  const match = pathname.match(/^\/course\/([^/]+)/)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function defaultCoursesPath(roles: string[]): string {
  if (roles.includes('student') && !roles.includes('professor') && !roles.includes('admin')) {
    return '/student'
  }
  return '/courses'
}

function closeOpenMenus() {
  const menus = document.querySelectorAll('details.ql-app-menu[open]')
  menus.forEach((menu) => menu.removeAttribute('open'))
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [courses, setCourses] = useState<Course[]>([])
  const [settings, setSettings] = useState<ShellSettings>({})
  const [promotingAccount, setPromotingAccount] = useState(false)

  const roleList = user?.profile.roles || []
  const currentCourseId = parseCourseId(location.pathname)

  useEffect(() => {
    if (!user?._id) {
      setCourses([])
      return
    }
    let active = true
    apiClient
      .get<Course[]>('/courses')
      .then((rows) => {
        if (active) setCourses(rows || [])
      })
      .catch(() => {
        if (active) setCourses([])
      })
    return () => {
      active = false
    }
  }, [user?._id])

  useEffect(() => {
    if (!user?._id) {
      setSettings({})
      return
    }
    let active = true
    apiClient
      .get<ShellSettings>('/settings')
      .then((value) => {
        if (active) setSettings(value || {})
      })
      .catch(() => {
        if (active) setSettings({})
      })
    return () => {
      active = false
    }
  }, [user?._id])

  const currentCourse = useMemo(
    () => courses.find((course) => course._id === currentCourseId) || null,
    [courses, currentCourseId]
  )

  if (!user) return <>{children}</>

  const canPromote = roleList.includes('admin') || Boolean(user.profile.canPromote)
  const coursesPath = defaultCoursesPath(roleList)

  const navigateAndClose = (path: string) => {
    closeOpenMenus()
    navigate(path)
  }

  const switchCourse = (courseId: string) => {
    closeOpenMenus()
    navigate(`/course/${courseId}`)
  }

  const logoutQlicker = async () => {
    closeOpenMenus()
    await logout().catch(() => undefined)
    navigate('/login', { replace: true })
  }

  const logoutWithSso = async () => {
    closeOpenMenus()
    await logout().catch(() => undefined)
    if (settings.SSO_logoutUrl) {
      window.location.href = settings.SSO_logoutUrl
      return
    }
    navigate('/login', { replace: true })
  }

  const currentCourseLabel = currentCourse ? fullCourseCode(currentCourse) : 'Courses'
  const sortedCourses = [...courses]
    .filter((course) => !course.inactive)
    .sort((left, right) =>
    fullCourseCode(left).localeCompare(fullCourseCode(right))
    )
  const showCourseActions = Boolean(currentCourseId)
  const showVideoAction = Boolean(currentCourse?.videoChatOptions?.urlId)

  return (
    <div className="ql-app-shell">
      <header className="ql-app-nav">
        <button className="ql-app-logo" onClick={() => navigateAndClose(coursesPath)}>
          Qlicker
        </button>

        <div className="ql-app-nav-links">
          {roleList.includes('admin') && (
            <button className="btn btn-link ql-app-link" onClick={() => navigateAndClose('/admin')}>
              Settings
            </button>
          )}
          {showCourseActions && (
            <button className="btn btn-link ql-app-link" onClick={() => navigateAndClose(`/course/${currentCourseId}`)}>
              Course Home
            </button>
          )}
          {showCourseActions && (
            <button className="btn btn-link ql-app-link" onClick={() => navigateAndClose(`/course/${currentCourseId}/grades`)}>
              Grades
            </button>
          )}
          {showCourseActions && (
            <button className="btn btn-link ql-app-link" onClick={() => navigateAndClose(`/course/${currentCourseId}/questions`)}>
              Question Library
            </button>
          )}
          {showCourseActions && showVideoAction && (
            <button className="btn btn-link ql-app-link" onClick={() => navigateAndClose(`/course/${currentCourseId}/videochat`)}>
              Video Chat
            </button>
          )}
        </div>

        <div className="ql-app-nav-spacer" />

        <details className="ql-app-menu">
          <summary>{currentCourseLabel}</summary>
          <div className="ql-app-menu-panel">
            <button className="btn btn-link ql-app-link" onClick={() => navigateAndClose(coursesPath)}>
              All Courses
            </button>
            {sortedCourses
              .filter((course) => Boolean(course._id))
              .map((course) => (
                <button
                  key={course._id}
                  className="btn btn-link ql-app-link"
                  onClick={() => switchCourse(course._id || '')}
                >
                  {fullCourseCode(course)}
                </button>
              ))}
          </div>
        </details>

        <details className="ql-app-menu">
          <summary>{`${user.profile.firstname} ${user.profile.lastname}`}</summary>
          <div className="ql-app-menu-panel">
            <button className="btn btn-link ql-app-link" onClick={() => navigateAndClose('/profile')}>
              User Profile
            </button>
            {canPromote && (
              <button className="btn btn-link ql-app-link" onClick={() => { closeOpenMenus(); setPromotingAccount(true) }}>
                Promote an account to professor
              </button>
            )}
            <button
              className="btn btn-link ql-app-link"
              onClick={() => {
                closeOpenMenus()
                window.location.href = USER_GUIDE_URL
              }}
            >
              Visit user guide
            </button>
            {settings.SSO_logoutUrl ? (
              <button className="btn btn-link ql-app-link" onClick={() => void logoutWithSso()}>
                Logout from Qlicker and {settings.SSO_institutionName || 'SSO'}
              </button>
            ) : (
              <button className="btn btn-link ql-app-link" onClick={() => void logoutQlicker()}>
                Logout from Qlicker
              </button>
            )}
          </div>
        </details>
      </header>

      <div className="ql-app-content">{children}</div>

      {canPromote && promotingAccount && <PromoteAccountModal done={() => setPromotingAccount(false)} />}
    </div>
  )
}
