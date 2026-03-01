# Comments based on user testing after PR #93
- Make sure that the fields that you added, such as lastLogin won't be an issue when starting up from the legacy database, where users may not have this property (refer to the meteorjs version of the app, in meteorjs_version/ to double check expected fields in the existing database). In general, make sure that requirements have not drifted in terms of being able to start with a legacy database and read the correct fields. 

- Write instructions for a local agent to read the folder legacydb/ (which cannot be uploaded to github) and discover the structure of the legacy database from a mongodump. From that, it should update the seed-db scripts to give the user the possibility to restore the db from such a mongodump (even in dev mode). In particular, the script should search the legacydb/ directory  and propose the directory therein from which to read the mongodump (in case there are several). The script should never have explicit filenames in it, the contents of legacydb/ including names of files are never to be uploaded to github. The instructions for the agent should also have it update, if applicable, the details about the legacy database organization so that future work remains aligned with it. Put those instructions in the top level of the repository.

- The modal for sending a password reset should have a way to close it and should close by itself after it confirms sending an email (and warns user to check spam).

- It should not be possible for the admin to change their own role, guaranteeing that there is always at least one admin user!

- If the user is logged-in in one tab, then the user should be considered logged-in in all tabs of a browser. Currently, if one is logged in and opens a new tab (e.g. localhost:3000), the user is shown a login screen and can log in as a separate user. We don't want that. A logged-in user that open a new tab should have it go straight to their dashboard.

- In the profs page to manage a course, list of people (students, instructors) should have the avatar at the far right (clickable for a full size version of the picture that was uploaded). The button to remove a student or instructor must have the user confirm. Also, check that when uploading pictures both a thumbnail and full size version are saved.

- The list of students and instructors displayed in prof course management page needs to update if the database changes (say a student enrolls or drops).

- If a student tries to unenroll themselves, they get an error "Insufficient permissions"

- The create course modal should say "semester" instead of "season". If the user chooses Fall/Winter, then the year will be 2025/2026 (use the current year as the first year, update this option if the user chooses Fall/Winter) 

- The tiles that show different courses (in dashboards) should have a uniform size, currently, they are wider if the course has a longer title. Wrap the title if needed. Make the dept and course number the big bold part (so that it's always the same size), then put in the semester and year, then write in the course name, then another line that says Section: 001 (as applicable).





 
