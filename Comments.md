# Comments based on user testing after PR #91
- Email does not seem to be working. There is no "forgot password" button (which should send an email), and no email is sent upon registration. I think I gave it a valid MAIL_URL
- Profile picture upload does not seem to work. It doesn't complain, but it also doesn't seem to set a profile picture (which should show in the avatar and in the profile page)
- If a user has signed in with SSO, make sure they can't change their name, since those are obtained from the SAML login information
