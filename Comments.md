# Comments based on user testing after PR #92

- The instructors part of the prof's course management page should list students and instructors in the course (including themselves). It just has "Unknown" for now, but maybe that's just because the corresponding component doesn't exist to display a name. When a user is removed from a course, the data from that user associated with the course (e.g responses for a student) should NOT be deleted, so that students and TAs that un-enroll by mistake don't lose their work.

- Eventually, when you implement the list of instructors and students, there should be a search bar (that autocompletes based on First name, Last name, and email). Clicking on a user displays their profile picture and name (not in thumbnail version, but limited to fit in the screen). There should be controls on the list elements to remove specific users from a course.

- Prof course management website should have a setting to choose that only users with verified email addresses can enroll. Check with the settings in the meteorjs version of the app to make sure that the possible settings are captured.  

- In both the student and prof dashboards that show the list of existing courses, make the title of the course clickable (instead of "view/manage course" links)

- The password reset doesn't work. It currently sends the email with a link, but then the link just opens a splash page about Qlicker (with a "get started button") instead of a dialog to update the password. Is this landing page necessary?

- Clicking on the link to verify email address also goes to the landing page that doesn't do anything (it should just login the user), but at least it correctly sends out the email.

- Note that if a user logs in by SSO, their email address is obtained from SAML and should be automatically marked as verified.

- In the admin interface, admin user should have a button to verify someone's email address. A column should show if the user is verified (and just make it clickable to verify an email address). There should also be a column that shows the last date a user was logged in (and sort by that by default, latest first), and a column that shows if a user is currently logged in. Clicking on a user should show their profile picture, what courses their enrolled in (or instructing - show the latest 5 by course creation date)

- In the create a course  modal, pre-fill the text boxes with some examples, e.g. Course Name: e.g. Calculus-based physics, Dept Code: e.g. PHYS, Course Number: e.g. 101, Section: e.g. 001, Semester (pre-fill with Fall/Winter/Summer 20XX) where XX depends on the current year, and the season is chosen as follows (and Spring is not suggested), between Nov and Feb it suggests Winter, between Feb and July is suggests Summer, and betwen July and November it suggests "Fall". Make it so that the user must select one of Fall, Winter, Fall/Winter, Spring, Summer, Spring/Summer as the season and a year. The admin interface can have a setting to allow additional semester labels (so add this functionality, fill it with the above for the default). Keep in mind that this app will have to work when restored from a database that doesn't have these properties in it, since it will be the database that the meteorjs app is currently using in production.    

 
