import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { apiClient } from '../api/client'

export default function Profile() {
  const { user, loading } = useAuth()

  const [changingName, setChangingName] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const [changingSN, setChangingSN] = useState(false)
  const [studentNumber, setStudentNumber] = useState('')

  const [showResendLink, setShowResendLink] = useState(true)

  if (loading || !user) {
    return <div className="ql-subs-loading">Loading…</div>
  }

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
      // Reload to reflect changes
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

  const handleChangeEmail = async () => {
    const newEmail = window.prompt('Enter new email address:')
    if (!newEmail) return
    try {
      await apiClient.put(`/users/${user._id}/email`, { email: newEmail })
      window.location.reload()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Could not change email'))
    }
  }

  const handleChangePassword = async () => {
    const currentPassword = window.prompt('Enter current password:')
    if (currentPassword === null) return
    const newPassword = window.prompt('Enter new password (minimum 8 characters):')
    if (!newPassword) return
    try {
      await apiClient.put(`/users/${user._id}/password`, { currentPassword, newPassword })
      alert('Password updated')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Could not change password'))
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
              {/* Profile image placeholder */}
              <div className="ql-profile-image-container">
                <div
                  className="ql-profile-image"
                  style={{ backgroundImage: profileImage ? `url(${profileImage})` : undefined }}
                >
                  &nbsp;
                </div>
              </div>

              {/* Change email / password buttons */}
              {!isSSOSession && (
                <div className="btn-group btn-group-justified" role="group">
                  <a href="#" className="btn btn-default" onClick={(e) => { e.preventDefault(); handleChangeEmail() }}>
                    Change Email
                  </a>
                  <a href="#" className="btn btn-default" onClick={(e) => { e.preventDefault(); handleChangePassword() }}>
                    Change Password
                  </a>
                </div>
              )}
              <br />

              {/* Name editing */}
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

              {/* Student number editing */}
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

              {/* Email and role display */}
              <div className="ql-profile-container">
                Email: {email} - {spanVerified}<br />
                Role: {user.profile.roles[0]}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4" />
      </div>
    </div>
  )
}
