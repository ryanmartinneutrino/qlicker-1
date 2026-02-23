import React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { apiClient } from '../api/client'
import type { Course, Settings, User } from '@qlicker/shared'

type AdminTab = 'main' | 'users' | 'images' | 'sso' | 'video'

type SettingsKey = keyof Settings

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'main', label: 'Main Settings' },
  { key: 'users', label: 'Users' },
  { key: 'images', label: 'Images' },
  { key: 'sso', label: 'SSO' },
  { key: 'video', label: 'Video Chat' },
]

function UsersPanel() {
  const { data: users, loading, execute: fetchUsers } = useApi<User[]>('GET', '/users')
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleRoleChange = async (userId: string, role: string) => {
    setRoleUpdating(userId)
    try {
      await apiClient.put(`/users/${userId}/role`, { role })
      fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setRoleUpdating(null)
    }
  }

  const handleDelete = async (userId: string, name: string) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try {
      await apiClient.delete(`/users/${userId}`)
      fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  if (loading && !users) return <div>Loading users...</div>

  return (
    <div>
      <h3>Users</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(users || []).map((u) => {
            const email = u.emails?.[0]?.address || '—'
            const name = `${u.profile.firstname} ${u.profile.lastname}`
            const role = u.profile.roles?.[0] || 'student'
            return (
              <tr key={u._id}>
                <td>{name}</td>
                <td>{email}</td>
                <td>
                  <select
                    className="form-control"
                    value={role}
                    disabled={roleUpdating === u._id}
                    onChange={(e) => handleRoleChange(u._id!, e.target.value)}
                  >
                    <option value="student">Student</option>
                    <option value="professor">Professor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u._id!, name)}>Delete</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SettingsEditor({ courses, activeTab }: { courses: Course[]; activeTab: AdminTab }) {
  const { data: settings, loading, execute: fetchSettings } = useApi<Settings>('GET', '/settings')
  const [form, setForm] = useState<Partial<Settings>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const setField = (key: SettingsKey, value: unknown) => {
    setForm((current: Partial<Settings>) => ({ ...current, [key]: value }))
  }

  const save = async (keys: SettingsKey[]) => {
    setSaving(true)
    try {
      const payload = keys.reduce((acc, key) => ({ ...acc, [key]: form[key] }), {})
      const updated = await apiClient.put<Settings>('/settings', payload)
      setForm(updated)
      alert('Settings updated')
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const enabledCourseIds = useMemo(() => new Set(form.Jitsi_EnabledCourses || []), [form.Jitsi_EnabledCourses])

  if (loading && !settings) return <div>Loading settings...</div>

  const panels: Partial<Record<AdminTab, React.JSX.Element>> = {
    main: (
      <div className="ql-admin-form-box">
        <h4>Support email</h4>
        <input className="form-control" value={form.email || ''} onChange={(e) => setField('email', e.target.value)} />
        <br />
        <label>
          <input type="checkbox" checked={Boolean(form.requireVerified)} onChange={(e) => setField('requireVerified', e.target.checked)} />
          {' '}Require verified email to login
        </label>
        <br /><br />
        <button className="btn btn-primary" disabled={saving} onClick={() => save(['email', 'requireVerified'])}>Save Main Settings</button>
      </div>
    ),
    images: (
      <div className="ql-admin-form-box">
        <h4>Image Settings</h4>
        <input className="form-control" type="number" placeholder="Max image size (MB)" value={form.maxImageSize ?? 5} onChange={(e) => setField('maxImageSize', Number(e.target.value))} />
        <br />
        <input className="form-control" type="number" placeholder="Max image width (px)" value={form.maxImageWidth ?? 900} onChange={(e) => setField('maxImageWidth', Number(e.target.value))} />
        <br />
        <select className="form-control" value={form.storageType || 'None'} onChange={(e) => setField('storageType', e.target.value)}>
          <option value="None">None</option>
          <option value="AWS">Amazon S3</option>
          <option value="Azure">Azure Blob</option>
          <option value="Local">Local</option>
        </select>
        <br />
        {form.storageType === 'AWS' && (
          <>
            <input className="form-control" placeholder="AWS Bucket" value={form.AWS_bucket || ''} onChange={(e) => setField('AWS_bucket', e.target.value)} /><br />
            <input className="form-control" placeholder="AWS Region" value={form.AWS_region || ''} onChange={(e) => setField('AWS_region', e.target.value)} /><br />
            <input className="form-control" placeholder="AWS Access Key" value={form.AWS_accessKey || ''} onChange={(e) => setField('AWS_accessKey', e.target.value)} /><br />
            <input className="form-control" placeholder="AWS Secret" value={form.AWS_secret || ''} onChange={(e) => setField('AWS_secret', e.target.value)} /><br />
          </>
        )}
        {form.storageType === 'Azure' && (
          <>
            <input className="form-control" placeholder="Azure Account Name" value={form.Azure_accountName || ''} onChange={(e) => setField('Azure_accountName', e.target.value)} /><br />
            <input className="form-control" placeholder="Azure Account Key" value={form.Azure_accountKey || ''} onChange={(e) => setField('Azure_accountKey', e.target.value)} /><br />
            <input className="form-control" placeholder="Azure Container Name" value={form.Azure_containerName || ''} onChange={(e) => setField('Azure_containerName', e.target.value)} /><br />
          </>
        )}
        <button className="btn btn-primary" disabled={saving} onClick={() => save(['maxImageSize', 'maxImageWidth', 'storageType', 'AWS_bucket', 'AWS_region', 'AWS_accessKey', 'AWS_secret', 'Azure_accountName', 'Azure_accountKey', 'Azure_containerName'])}>Save Image Settings</button>
      </div>
    ),
    sso: (
      <div className="ql-admin-form-box">
        <h4>SSO Settings</h4>
        <label><input type="checkbox" checked={Boolean(form.SSO_enabled)} onChange={(e) => setField('SSO_enabled', e.target.checked)} /> Enable SSO</label>
        <br /><br />
        <input className="form-control" placeholder="IDP Entry Point" value={form.SSO_entrypoint || ''} onChange={(e) => setField('SSO_entrypoint', e.target.value)} /><br />
        <input className="form-control" placeholder="IDP Logout URL" value={form.SSO_logoutUrl || ''} onChange={(e) => setField('SSO_logoutUrl', e.target.value)} /><br />
        <input className="form-control" placeholder="Entity ID" value={form.SSO_EntityId || ''} onChange={(e) => setField('SSO_EntityId', e.target.value)} /><br />
        <input className="form-control" placeholder="Institution Name" value={form.SSO_institutionName || ''} onChange={(e) => setField('SSO_institutionName', e.target.value)} /><br />
        <textarea className="form-control certificate" placeholder="IDP certificate" value={form.SSO_cert || ''} onChange={(e) => setField('SSO_cert', e.target.value)} /><br />
        <textarea className="form-control certificate" placeholder="SP certificate" value={form.SSO_privCert || ''} onChange={(e) => setField('SSO_privCert', e.target.value)} /><br />
        <textarea className="form-control certificate" placeholder="SP key" value={form.SSO_privKey || ''} onChange={(e) => setField('SSO_privKey', e.target.value)} /><br />
        <button className="btn btn-primary" disabled={saving} onClick={() => save(['SSO_enabled', 'SSO_entrypoint', 'SSO_logoutUrl', 'SSO_EntityId', 'SSO_institutionName', 'SSO_cert', 'SSO_privCert', 'SSO_privKey'])}>Save SSO Settings</button>
      </div>
    ),
    video: (
      <div className="ql-admin-form-box">
        <h4>Jitsi Settings</h4>
        <label><input type="checkbox" checked={Boolean(form.Jitsi_Enabled)} onChange={(e) => setField('Jitsi_Enabled', e.target.checked)} /> Enable video chat</label>
        <br /><br />
        <input className="form-control" placeholder="Jitsi domain" value={form.Jitsi_Domain || ''} onChange={(e) => setField('Jitsi_Domain', e.target.value)} /><br />
        <input className="form-control" placeholder="Whiteboard domain" value={form.Jitsi_WhiteboardDomain || ''} onChange={(e) => setField('Jitsi_WhiteboardDomain', e.target.value)} /><br />
        <input className="form-control" placeholder="Etherpad domain" value={form.Jitsi_EtherpadDomain || ''} onChange={(e) => setField('Jitsi_EtherpadDomain', e.target.value)} /><br />
        <h5>Enabled Courses</h5>
        <div className="ql-admin-courses-list">
          {courses.filter((course) => Boolean(course._id)).map((course) => (
            <label key={course._id} className="ql-admin-course-checkbox">
              <input
                type="checkbox"
                checked={enabledCourseIds.has(course._id!)}
                onChange={(e) => {
                  const current = new Set(form.Jitsi_EnabledCourses || [])
                  if (e.target.checked) current.add(course._id!)
                  else current.delete(course._id!)
                  setField('Jitsi_EnabledCourses', Array.from(current))
                }}
              />
              {' '}{course.name}
            </label>
          ))}
        </div>
        <br />
        <button className="btn btn-primary" disabled={saving} onClick={() => save(['Jitsi_Enabled', 'Jitsi_Domain', 'Jitsi_WhiteboardDomain', 'Jitsi_EtherpadDomain', 'Jitsi_EnabledCourses'])}>Save Video Settings</button>
      </div>
    ),
  }

  return <>{panels[activeTab] || null}</>
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState<AdminTab>('main')
  const { data: courses, execute: fetchCourses } = useApi<Course[]>('GET', '/courses')

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  return (
    <div className="ql-admin-page page">
      <div className="ql-admin-toolbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-default'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="ql-admin-settings">
        {activeTab === 'users' ? <UsersPanel /> : <SettingsEditor activeTab={activeTab} courses={courses || []} />}
      </div>
    </div>
  )
}
