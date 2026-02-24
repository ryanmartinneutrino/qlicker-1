import { useMemo } from 'react'
import type { Course, Settings } from '@qlicker/shared'

type Props = {
  form: Partial<Settings>
  courses: Course[]
  saving: boolean
  setField: (key: keyof Settings, value: unknown) => void
  save: (keys: (keyof Settings)[]) => Promise<void>
}

export default function ManageJitsi({ form, courses, saving, setField, save }: Props) {
  const enabledCourseIds = useMemo(() => new Set(form.Jitsi_EnabledCourses || []), [form.Jitsi_EnabledCourses])

  return (
    <div className="ql-admin-form-box">
      <h4>Jitsi Settings</h4>
      <label>
        <input
          type="checkbox"
          checked={Boolean(form.Jitsi_Enabled)}
          onChange={(e) => setField('Jitsi_Enabled', e.target.checked)}
        />
        {' '}Enable video chat
      </label>
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
      <button
        className="btn btn-primary"
        disabled={saving}
        onClick={() =>
          save([
            'Jitsi_Enabled',
            'Jitsi_Domain',
            'Jitsi_WhiteboardDomain',
            'Jitsi_EtherpadDomain',
            'Jitsi_EnabledCourses',
          ])
        }
      >
        Save Video Settings
      </button>
    </div>
  )
}
