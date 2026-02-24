import type { Settings } from '@qlicker/shared'

type Props = {
  form: Partial<Settings>
  saving: boolean
  setField: (key: keyof Settings, value: unknown) => void
  save: (keys: (keyof Settings)[]) => Promise<void>
}

export default function ManageSSO({ form, saving, setField, save }: Props) {
  return (
    <div className="ql-admin-form-box">
      <h4>SSO Settings</h4>
      <label>
        <input
          type="checkbox"
          checked={Boolean(form.SSO_enabled)}
          onChange={(e) => setField('SSO_enabled', e.target.checked)}
        />
        {' '}Enable SSO
      </label>
      <br /><br />
      <input className="form-control" placeholder="IDP Entry Point" value={form.SSO_entrypoint || ''} onChange={(e) => setField('SSO_entrypoint', e.target.value)} /><br />
      <input className="form-control" placeholder="IDP Logout URL" value={form.SSO_logoutUrl || ''} onChange={(e) => setField('SSO_logoutUrl', e.target.value)} /><br />
      <input className="form-control" placeholder="Entity ID" value={form.SSO_EntityId || ''} onChange={(e) => setField('SSO_EntityId', e.target.value)} /><br />
      <input className="form-control" placeholder="Institution Name" value={form.SSO_institutionName || ''} onChange={(e) => setField('SSO_institutionName', e.target.value)} /><br />
      <textarea className="form-control certificate" placeholder="IDP certificate" value={form.SSO_cert || ''} onChange={(e) => setField('SSO_cert', e.target.value)} /><br />
      <textarea className="form-control certificate" placeholder="SP certificate" value={form.SSO_privCert || ''} onChange={(e) => setField('SSO_privCert', e.target.value)} /><br />
      <textarea className="form-control certificate" placeholder="SP key" value={form.SSO_privKey || ''} onChange={(e) => setField('SSO_privKey', e.target.value)} /><br />
      <button
        className="btn btn-primary"
        disabled={saving}
        onClick={() =>
          save([
            'SSO_enabled',
            'SSO_entrypoint',
            'SSO_logoutUrl',
            'SSO_EntityId',
            'SSO_institutionName',
            'SSO_cert',
            'SSO_privCert',
            'SSO_privKey',
          ])
        }
      >
        Save SSO Settings
      </button>
    </div>
  )
}
