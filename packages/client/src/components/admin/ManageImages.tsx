import type { Settings } from '@qlicker/shared'

type Props = {
  form: Partial<Settings>
  saving: boolean
  setField: (key: keyof Settings, value: unknown) => void
  save: (keys: (keyof Settings)[]) => Promise<void>
}

export default function ManageImages({ form, saving, setField, save }: Props) {
  return (
    <div className="ql-admin-form-box">
      <h4>Image Settings</h4>
      <input
        className="form-control"
        type="number"
        placeholder="Max image size (MB)"
        value={form.maxImageSize ?? 5}
        onChange={(e) => setField('maxImageSize', Number(e.target.value))}
      />
      <br />
      <input
        className="form-control"
        type="number"
        placeholder="Max image width (px)"
        value={form.maxImageWidth ?? 900}
        onChange={(e) => setField('maxImageWidth', Number(e.target.value))}
      />
      <br />
      <select
        className="form-control"
        value={form.storageType || 'None'}
        onChange={(e) => setField('storageType', e.target.value)}
      >
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
      <button
        className="btn btn-primary"
        disabled={saving}
        onClick={() =>
          save([
            'maxImageSize',
            'maxImageWidth',
            'storageType',
            'AWS_bucket',
            'AWS_region',
            'AWS_accessKey',
            'AWS_secret',
            'Azure_accountName',
            'Azure_accountKey',
            'Azure_containerName',
          ])
        }
      >
        Save Image Settings
      </button>
    </div>
  )
}
