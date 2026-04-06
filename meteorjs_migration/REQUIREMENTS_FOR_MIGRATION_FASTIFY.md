# Migration guidelines from MeteorJS to Fastify/React
This document outlines the high level goals for the migration of the Qlicker app from MeteorJS to a new version that uses Fastify and React. Refer to this document throughout the migration to keep work aligned with the goals described herein. The migrated app must provide the same functionality as the meteorjs one but should be redesigned from the ground up. However, it will have to run with the same database that is currently in use.

## Overview of repository structure and work plan:
The meteorjs version of the app can be found in meteorjs_qlicker/. 

The repository needs a README, .gitignore, etc. 

All PRs should be merged into ryanmartinneutrino/qlicker-1:master. Periodically, PRs will be submitted to summarize the work and progress which must be merged by a human. Otherwise, PRs should be merged by the agents. A set of proposed milestones are detailed below.

Work should be planned for up to 8 agents running in parallel. Developing this plan is the first task. There are some milestones below to help develop the plan.

On the local copy of the repository, there is directory legacydb/ - leave that untouched (it has a mongodb backup for testing compatability and should never be synched to github as it contains sensitive information). Filenames in that directory should not appear anywhere in the repository.

This requirements file (REQUIREMENTS_FOR_MIGRATION_FASTIFY) should be referred to regularly to ensure work is aligned with the goals described here.

## The big picture:
- We want to modernize the app making it easier to keep updated and secure. We want to depend on as few external packages as possible. Extneral dependencies should be from well-maintained repositories with expected long term updates.
  
- The app must be fast and support thousands of connected users. Currently it benefits from meteorjs' reactive subscriptions.

- We want to simplify the code as much as possible, there are likely many redundant snippets of code in both the backend and the frontend. We want to make it easy to maintain and to add features in the future.

- The new app will eventually replace the meteorjs version in production. It must be compatible with the existing mongodb database and support the SAML-based SSO login being used in production. It must have the same functionality as the meteorjs version.

- We will build this from the ground up and gradually restore functionality by meeting milestones. We have the opportunity to make the architecture more flexible and future proof. We will want api endpoints so that we can also control the app outside of the UI. For now, focus on a UI that interacts through an api.

## Some technical requirements:

- The local copy of the repository has a backup (mongodump) of the production database inside the directory legacydb/. That data should never be uploaded to github, and the filenames therein should never be refered to explicitly for anything that gets uploaded (for example in any testing code that is developed). The legacy database should be used for testing backward compatability.
    
- The new frontend should look clean and uniform, I suggest adopting material design (keep the same colour scheme and fonts as much as possible for now, but make this flexible). I recommend looking at the existing React components in the meteorjs version and either updating them or use fresh ones to reproduce the functionality. We want a uniform look that can easily be changed and propagated through the entire app, so try to have some sort of inheritance in the stylistic elements. We want to use the most up to date React stuff.
  
- The meteorjs subscription system make the UI reactive to changes in the database. While we don't need to maintain this everywhere in the updated app, there are several spots where this is a critical functionality Think of the best way to implement this securely (websockets?). The most important part that needs to be reactive is when using the interactive sessions (where profs cycles through questions which must be updated in the student view, prof can choose to show stats or correct, or new attempt - prof also sees responses coming in through their interface). The other critical location is the course pages (for prof or student), these need have up to date lists of sessions (showing status) and the prof course page needs up to date list of people in the course. 

- The App should be able to run both natively and from a docker-compose file. In production, it will run in a docker compose stack with multiple instances to allow for load balancing (consider this in the design stage).

- Maintain a script that can be run by the user to setup the docker stack. The script generates a file with environment variables used by docker compose, setups up the build files and allows one to run the stack with docker compose up -d. The script should ask which ports to use (and suggest defaults that it has confirmed are free, ideally 3000 for the app, 3001 for the api, and 27017 for mongo). Maybe there is also a separate script to build the docker images?

- Maintain a script thac can be run by the user to setup the app to run natively (in particular, it should offer to install all dependencies (node, npm, fastify - run any npm installs, it should ask for which ports to use, etc - assume a flavour of mint/ubuntu/debian). It should generate any required .env files (use openssl for tokens).

- You should maintain scripts to seed the database with a couple of users, for both docker and native versions, with the option of resetting the database to be empty.
  
- You should maintain a script to start/stop/restart/status the native version of the app.

- All scripts and their use should be documented in the README. 

- If the app starts up with an empty database, the login page should allow a user to be created. The first user has admin access. Any other user after that is student by default. Admin can change users to prof and some profs can then promote others to prof account (as in the existing meteorjs app). 

- Prioritize making batches of work that lead to a stable version of the app that can be tested through UI by a human (and let them know which features/flows should now work).

## Some suggested steps before making a detailed plan
- Go through the meteorjs version of the app to generate a complete list of:
  - mongo collections and properties
  - react components
  - pages
  - routes
  - meteor methods
    
- Make a map of how these interact with each other, which componet uses what method, which routes use which methods, which components require responsive changes to the data, etc. Use this map to generate the detailed list of tasks that need to be accomplished to make sure that nothing gets missed. This list can be kept up to date by the various agents as the work progresses and referred back to in order to ensure that work has not drifted.

- Group the work in logical ways so that agents can execute it in parallel. Plan how to maintain documenation on the migration, at a high level and at a detailed level. Generage AGENT.md files as needed. Each agent likely has sub tasks and documentation that they update. There must be an agent that regularly cross checks that everything is following the master plan derived from this requirements file. 

## Things to ensure:
- Image uploads still need to work (Amazon S3, Azure, local)

- SSO SAML connections need to work as before. I also want to explore the possibilty of using some sort of Microsoft-based login (active directory?)

- Needs to be able to send emails as it does now (for password resets)

- Keep detailed documentation up to date. The main README should have up to date instructions on how to test the app, natively and with docker compose. 

- Keep detailed documentation on the migration up to date. It should show the original plan, progress, future works and details.
  
## Some milestones to aim for (that are testable by a human using the UI):

1) Login works - user on an empty database can create an account, becomes admin and has access to the admin panel. Other users can create accounts, and admins can change them to prof and allow profs to promote other accounts. The admin interface generally works and all required "settings" for the app can be set. Users can login, change their password, logout. They can request a password reset by email and it works. 

2) Users can log in and update their profile pics. The admin interface correctly connects the app to an upload service and works for Azure, S3, and local storage for pictures. Preliminary testing of SAML indicate that it works. The app can load users from the legacy database and login correctly works (for those that have password-based emails, the mongodump has most users connecting through SAML).

3) Prof users can create a course with all its properties. Students can join the course based on the enrollment code. Profs and students can un-enroll. Guards in place to prevent courses having no profs. TA roles exist. 

4) Prof can create interactive sessions and quizzes. The session editor works and can be used to add questions. The status of a quiz can be set (draft, live, etc.). Questions can be edited, including with attachments and MathJax equations. Quizes can have their dates set, and it's possible to give extensions to specific students. The course page correctly shows the list of sessions and which ones are active. 
  
6) Interactive sessions and quizzes now work, students can answer questions in interactive sessions and profs can see the answers update in real time. They can choose to show the distribution of responses (stats) and/or the correct answer. They can create a new attempt. All responses are being recorded in the database. Students can see non interactive quizzes and, based on the time where the server is running (not the student's computer time zone!), student can access those quizes that are live based on the dates. Once they submit a quiz, they can no longer access it. Every answer they put in is recorded, even if they don't click submit. 

7) Grading works. Profs and TAs can open the session grading pages and modals. The grade table works and correctly calculates grades. The data can be downloaded in CSV. One can also review sessions, and download the CSV data for a specific session. Students can review sessions and see their grades (and only their grades). The interface for reviewing sessions is much better than before. 

8) Grouping and video chat work. SSO login with SAML is confirmed to work and roles can be assigned based on the SAML login information. Everything works and the documentation, in particular user and developer manuals, are up to date. Robust testing is in place. All packages are up to date and there are no known security vulnerabilities.

9) Any remaining functionality is restored. The app works as before when restored from the existing data base. It also looks better and is snappier. The app is ready to be deployed in a load-balanced collection of servers started with a docker compose file. Robust utilities are in place to help set things up and keep regular backups. The documentation is up to date.

## Things to change compared to the meteorjs app:
1) The admin interface in the meteorjs version is slow because it loads all the users (when there are thousands). It also looks super clunky. It should be revamped using modern/new react components. Retain functionality, but the look should be updated (and remain consistent with the rest of the app).

2) There should be api access to the backend

3) The look should be cleaner and more uniform. Set some stylistic guidelines to refer to,

## Testing:
- Unit tests should be included from the onset. Introduce tests of any added functionality following best practices. Tests should be required to pass before submitted PRs. 

- We want to test several "flows" through automated interactions with the UI. For example, the "login flow" would involve a user going to the main website, being shown the /login endpoint, then clicking to create an account, then loggin in and updating their profile pic and password (for example, or some other interaction). Then logging back out and back in. These flow tests should be designed with the various milestones in mind. 

## Next steps:
- Once you understand this document and the existing meteorjs version of the app in detail, start mapping out a plan for the work to be carried out in multiple parallel lanes (aim for 7-8 agents in parallel) with the goal of meeting the milestones. Divide this up into small manageable sets of instructions so that agents can focus on well-defined sub tasks, merge a PR, and move to the next sub task. 

- Keep a master document, MIGRATION.md, up to date with the current migration plan and a current status. It should refer to more detailed plans for the individual tasks to be run by parallel agents, and it should refer to this requirements file as well to ensure continued alignment. 

- Work on the migration will be initiated by telling an agent to look at MIGRATION.md and resume the work, so MIGRATION.md has to have all of the required information to resume the work (including pointing towards more detailed plans), as well as ensure that it aligns with what is described in this requirements file. It should be explicit in MIGRATION.md to cross-check this requirements file regularly to ensure alignment. The requirements file should only be updated by a human user.

