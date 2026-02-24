import type { Settings } from '@qlicker/shared'

type Props = {
  form: Partial<Settings>
  saving: boolean
  setField: (key: keyof Settings, value: unknown) => void
  save: (keys: (keyof Settings)[]) => Promise<void>
}

export default function ManageMainSettings({ form, saving, setField, save }: Props) {
  return (
    <div className="ql-admin-form-box">
      <h4>Support email</h4>
      <input
        className="form-control"
        value={form.email || ''}
        onChange={(e) => setField('email', e.target.value)}
      />
      <br />
      <label>
        <input
          type="checkbox"
          checked={Boolean(form.requireVerified)}
          onChange={(e) => setField('requireVerified', e.target.checked)}
        />
        {' '}Require verified email to login
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={Boolean(form.restrictDomain)}
          onChange={(e) => setField('restrictDomain', e.target.checked)}
        />
        {' '}Restrict account creation to allowed domains
      </label>
      <br /><br />
      <button
        className="btn btn-primary"
        disabled={saving}
        onClick={() => save(['email', 'requireVerified', 'restrictDomain'])}
      >
        Save Main Settings
      </button>
    </div>
  )
}
