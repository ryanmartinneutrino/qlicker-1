# Comments based on user testing after PR #89
- I allowed access to the websites you listed in case you want to be able test with mongo. Let me know what websites you want access to, you should be able to test with mongo and docker (likely fine to always have the mongo in a docker containter)
- General look is good. 
- The setup script should ask for MAIL_URL (or at least point out that it needs to be set)
- The email part does not seem to work (send an email so account can be verified, ask for a password reset link)
- The font size of the word Qlicker should be larger in the appbar. 
- The circle that goes around the user's initials (top right of app bar) should be a bit larger, it touches the edges of the letters. Maybe this is too small for the same reason as the word Qlicker?
- When clicking on the user icon, it gives the option to go to the current page - that option should be removed as applicable. 
- In the profile page for the admin or prof it should say "employee number" instead of student number. And eventually, there will be a profile pic that can be updated.  
- In the prof page, clicking the user icon does not give a way to get back to the dashboard. 
- I only tested with docker and it worked.
- The password 
- I think the scripts to seed the database (I tried ./scripts/seed-db-docker.sh --reset) have to read in the port numbers from the corresponding env files, they seem to hard code 207017 and the one I tested gave an error (Seed failed: Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/server/src/models/User.js' imported from /app/seed-db.js
)
- In the users table of the admin interface, ensure that when one enters search terms it searches the entire database (not just what it has already loaded)

