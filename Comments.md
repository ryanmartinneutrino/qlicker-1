# Comments based on user testing after PR #94
- In the course manage page, in the list of students/instructors, put the avatar on the far left. 

- If the user is logged-in in one tab, then the user should be considered logged-in in all tabs of a browser. Currently, if one is logged in and opens a new tab (e.g. localhost:3000), the user is shown a login screen and can log in as a separate user. We don't want that. A logged-in user that open a new tab should have it go straight to their dashboard.

- The list of students and instructors displayed in prof course management page needs to update if the database changes (say a student enrolls or drops), it needs to be reactive. 

- The create course modal should say "semester" instead of "season". If the user chooses Fall/Winter, then the year will be 2025/2026 (use the current year as the first year, update this option if the user chooses Fall/Winter) 

- The main web page needs to check if it's connected (to front and backend) and let user know if it's not (e.g. there should be some feedback on the webpage when the user has shutdown the app). 





 
