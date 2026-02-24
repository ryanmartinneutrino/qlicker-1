import { useEffect, useState } from 'react'
import type { Course, Settings } from '@qlicker/shared'
import { useApi } from '../hooks/useApi'
import { apiClient } from '../api/client'
import ManageUsers from '../components/admin/ManageUsers'
import ManageMainSettings from '../components/admin/ManageMainSettings'
import ManageImages from '../components/admin/ManageImages'
import ManageSSO from '../components/admin/ManageSSO'
import ManageJitsi from '../components/admin/ManageJitsi'

type AdminTab = 'main' | 'users' | 'images' | 'sso' | 'video'
type SettingsKey = keyof Settings

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'main', label: 'Main Settings' },
  { key: 'users', label: 'Users' },
  { key: 'images', label: 'Images' },
  { key: 'sso', label: 'SSO' },
  { key: 'video', label: 'Video Chat' },
]

function SettingsPanels({ courses, activeTab }: { courses: Course[]; activeTab: AdminTab }) {
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
    setForm((current) => ({ ...current, [key]: value }))
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

  if (loading && !settings) return <div>Loading settings...</div>

  if (activeTab === 'main') return <ManageMainSettings form={form} saving={saving} setField={setField} save={save} />
  if (activeTab === 'images') return <ManageImages form={form} saving={saving} setField={setField} save={save} />
  if (activeTab === 'sso') return <ManageSSO form={form} saving={saving} setField={setField} save={save} />
  if (activeTab === 'video') return <ManageJitsi form={form} courses={courses} saving={saving} setField={setField} save={save} />

  return null
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
        {activeTab === 'users' ? <ManageUsers /> : <SettingsPanels activeTab={activeTab} courses={courses || []} />}
      </div>
    </div>
  )
}
