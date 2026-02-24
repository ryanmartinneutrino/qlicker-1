import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { apiClient } from '../api/client'
import { ChangeEmailModal } from '../components/modals/ChangeEmailModal'
import { ChangePasswordModal } from '../components/modals/ChangePasswordModal'
import { DragAndDropArea } from '../components/DragAndDropArea'

export default function Profile() {
  const { user, loading } = useAuth()

  const [changingName, setChangingName] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const [changingSN, setChangingSN] = useState(false)
  const [studentNumber, setStudentNumber] = useState('')

  const [showResendLink, setShowResendLink] = useState(true)
  const [changingEmail, setChangingEmail] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadActive, setUploadActive] = useState(false)

  if (loading || !user) return <div className="ql-subs-loading">Loading…</div>

  const email = user.emails?.[0]?.address ?? ''
  const emailVerified = user.emails?.[0]?.verified ?? false
  const profileImage = user.profile?.profileImage
  const fullName = `${user.profile.firstname} ${user.profile.lastname}`
  const isSSOSession = Boolean(user.services?.sso)
  const isStudent = user.profile.roles.includes('student')
  const numberLabel = isStudent ? 'Student number' : 'Employee number'

  const startEditingName = () => {
    setFirstName(user.profile.firstname)
    setLastName(user.profile.lastname)
    setChangingName(true)
  }

  const saveName = async () => {
    try {
      await apiClient.put(`/users/${user._id}/profile`, {
        firstname: firstName,
        lastname: lastName,
      })
      window.location.reload()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Could not save name'))
    }
  }

  const startEditingSN = () => {
    setStudentNumber(user.profile.studentNumber ?? '')
    setChangingSN(true)
  }

  const saveStudentNumber = async () => {
    try {
      await apiClient.put(`/users/${user._id}/profile`, {
        studentNumber,
      })
      window.location.reload()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Could not save number'))
    }
  }

  const sendVerificationEmail = async () => {
    try {
      await apiClient.post('/users/verify-email', {})
      setShowResendLink(false)
    } catch {
      alert('Error sending verification email')
    }
  }

  const handleUploadImage = async (file: File) => {
    if (!file || !user._id) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const image = await apiClient.upload<{ _id: string; url: string; UID: string }>('/images', formData)
      await apiClient.put(`/users/${user._id}/profile`, {
        profileImage: image.url,
        profileThumbnail: image.url,
      })
      window.location.reload()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Could not upload image'))
    } finally {
      setUploadingImage(false)
    }
  }

  const spanVerified = emailVerified
    ? <span className="label label-success">Verified</span>
    : <span className="label label-warning">Un-verified</span>

  return (
    <div className="container ql-profile-page">
      <div className="messages">
        {!emailVerified && (
          <div className="alert alert-warning" role="alert">
            For access to certain courses, you may need to verify your email. &nbsp;&nbsp;&nbsp;
            {showResendLink
              ? <a href="#" onClick={(e) => { e.preventDefault(); sendVerificationEmail() }}>Resend Email</a>
              : 'Check your email'}
          </div>
        )}
      </div>

      <div className="row">
        <div className="col-md-4" />
        <div className="col-md-4">
          <div className="ql-profile-card ql-card">
            <div className="profile-header ql-header-bar">
              <h4>User Profile</h4>
            </div>

            <div className="ql-card-content">
              <div className="ql-profile-image-container">
                {!uploadActive ? (
                  <div>
                    <div
                      className="ql-profile-image"
                      style={{ backgroundImage: profileImage ? `url(${profileImage})` : undefined }}
                    >
                      &nbsp;
                      <div
                        className="ql-image-upload-new-button"
                        onClick={(e) => {
                          e.preventDefault()
                          setUploadActive(true)
                        }}
                      >
                        Upload new image
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <DragAndDropArea
                      onDrop={handleUploadImage}
                      acceptedFiles={['image/jpeg', 'image/png', 'image/gif']}
                      maxFiles={1}
                      disabled={uploadingImage}
                      className="ql-profile-image-droparea dropzone"
                    >
                      <div className="dz-default dz-message">
                        <span className="glyphicon glyphicon-camera" aria-hidden="true" />
                        {' '}
                        {uploadingImage ? 'Uploading...' : 'Drag and Drop an image to upload'}
                      </div>
                    </DragAndDropArea>
                    <div className="btn-group btn-group-justified" role="group">
                      <a
                        href="#"
                        className="btn btn-default"
                        onClick={(e) => {
                          e.preventDefault()
                          setUploadActive(false)
                        }}
                      >
                        Cancel
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {!isSSOSession && (
                <div className="btn-group btn-group-justified" role="group">
                  <a href="#" className="btn btn-default" onClick={(e) => { e.preventDefault(); setChangingEmail(true) }}>
                    Change Email
                  </a>
                  <a href="#" className="btn btn-default" onClick={(e) => { e.preventDefault(); setChangingPassword(true) }}>
                    Change Password
                  </a>
                </div>
              )}
              <br />

              <div>
                {changingName ? (
                  <div className="ql-profile-name-container">
                    <input type="text" placeholder="Last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    <input type="text" placeholder="First" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    <div className="ql-profile-name-little-button" onClick={() => setChangingName(false)}>cancel</div>
                    <div className="ql-profile-name-little-button" onClick={saveName}>save</div>
                  </div>
                ) : (
                  <div className="ql-profile-name-container">
                    <div className="ql-profile-name">{fullName}</div>
                    {!isSSOSession && (
                      <div className="ql-profile-name-little-button" onClick={startEditingName}>change name</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                {changingSN ? (
                  <div className="ql-profile-sn-container">
                    <input type="text" placeholder={numberLabel} value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} />
                    <div className="ql-profile-sn-little-button" onClick={() => setChangingSN(false)}>cancel</div>
                    <div className="ql-profile-sn-little-button" onClick={saveStudentNumber}>save</div>
                  </div>
                ) : (
                  <div className="ql-profile-sn-container">
                    <div className="ql-profile-sn">{numberLabel}: {user.profile.studentNumber ?? ''}</div>
                    {!isSSOSession && (
                      <div className="ql-profile-sn-little-button" onClick={startEditingSN}>update number</div>
                    )}
                  </div>
                )}
              </div>

              <div className="ql-profile-container">
                Email: {email} - {spanVerified}<br />
                Role: {user.profile.roles[0]}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4" />
      </div>

      {changingEmail && (
        <ChangeEmailModal
          userId={user._id!}
          oldEmail={email}
          done={() => setChangingEmail(false)}
        />
      )}
      {changingPassword && (
        <ChangePasswordModal
          userId={user._id!}
          done={() => setChangingPassword(false)}
        />
      )}
    </div>
  )
}
