/**
 * Login page — stub placeholder.
 * TODO: Migrate from imports/ui/pages/ in the Meteor app.
 */
export default function Login({ allowEmail }: { allowEmail?: boolean }) {
  return <div className="page">Login{allowEmail ? ' (email)' : ''}</div>
}
