# Migration guidelines from MeteorJS to Fastify/React
This document outlines the high level goals for the migration and should be referred to continuously during the migration.

## Overview of repository structure:

We are going to migrate the MeteorJS version of the app to a new version that uses Fastify and React. I've moved the meteorjs version of the app to the folder meteorjs_qlicker/ for you to refer to. Build the new version of the app in top level of the repository

All of our changes will go into ryanmartinneutrino/qlicker-1:master, so PRs should ultimately go against that branch. We should have up to 8 parallel lanes running, submitting PRs, including one lane that manages the process, merges PRs and periodically submits a summary PRs that has to be approved before merging. The first large task is to make this plan and setup the repository for multiple agents to work on it.

On the local copy of the repository, there is directory legacydb/ - leave that untouched (it has a mongodb backup for testing compatability and should never be synched to github as it contains sensitive information).

You should also keep a copy of this file (REQUIREMENTS_FOR_MIGRATION_FASTIFY) in the repository, so that detailed migration plans can refer back to this file and avoid any drift.


## The big picture:
- We want to modernize the app and make it easier to keep up to date and secure. Working with meteorjs has become annoying since its stack has to be kept up to date in addition to all of the node pacakges. Generally, we want to depend on as few external packages as possible (both backend and frontend). We want to stick to well-maintained dependencies that should have good long term support and be secure.

- We want to ensure that the app is fast, it can have thousands of users connected. That's one reason we decided to host the images on S3, so that the app server would not need to serve up many pictures all at once. At the same time, we want to depend on as few external sites as possible, ideally none, since we don't want the app to go down if those website go down. You might consider copying over the MathJax stuff, as we did for the CKEditor, if that is reasonable. 

- We want to simplify the code as much as possible, there are likely many redundant snippets of code in both the backend and the frontend. We want to make it easy to maintain and to add features in the future. 

- We also want to make it easy to backup and restore the data. 

- At the end of the migration, we want to be able to switch from the meteorjs version now in production to the new version in a seemless way for the users. The new app thus needs to be compatible with the mongo database that is currently used in production by the meteorjs version and the SSO SAML login has to work. It must have the same functionality and general look as the meteorjs app (try to match the colour and fonts, but don't worry about depending on bootstrap if that's not a good idea). I provide an example of the existing mongo database (from a mongodump) in the legacydb/ local directory, make sure that never gets uploaded. 

## Some technical requirements:

- For the frontend we want it to be clean and uniform, it likely makes sense to update many of the existing react components, perhaps to swap in elements of material design. There is a mess of CSS and SCSS that should be cleaned-up. Re-use components as much as possible to make things clean and uniform. Also, think ahead, so that we can change the look of the UI (e.g. fonts, buttons, labels) that are easily propagated everywhere. However, make sure to maintain the current functionality for all aspects of the app.

- The app benefits from meteorjs subscription system that makes it reactive to changes in the database. We must absolutely retain this functionality so that pages update immediately if something changes in the database. This is particularly important in the context of "interactive sessions", where the professor chooses which questions to show, the responses update in the prof interface, etc. But in general, anywhere in the UI where the data is reactive to the database, it needs to stay that way. Remember that it needs to be fast, so we're looking for speed improvements over meteor, not loss in efficiency!

- It seems like the best way to do this is to migrate to fastify and run an api on the backend. The front-end would still be react, but significantly updated. 

- We want to run this both natively and from a docker-compose file. In production, it will run in a docker compose stack with multiple instances running to make it fast through load balancing (so think about that in the design). There should be a script that can be run by the user to setup the docker stack (basically generate a file with environment variables used by docker) that should allow the app to run natively for testing and then for production. The script should ask which ports to use (and suggest defaults that it has confirmed are free, ideally 3000 for the app, 3001 for the api, and 27017 for mongo - but those are taken on the local dev system so some logic is needed). 

- There should also be a script run by the user to setup the app to run natively (in particular, it should offer to install all dependencies (node, npm, fastify - run any npm installs, it should ask for which ports to use, etc). Both the native and docker setup script ultimately save env files that are used by the app, including to choose which ports to listen on. There should also be scripts to seed the database with a couple of users, for both docker and native versions, with the option of resetting the database to be empty. There should be a single script to start/stop/restart/status the native version of the app. All of these scripts and their use should be documented in the README. 

- The local copy of the repository has a backup (mongodump) of the production database inside the directory legacydb/. That data should never be uploaded to github, and the filename should never be refered to explicitly for anything that gets uploaded (for example in any testing code that is developed). The legacy database should be used for testing backward compatability and completeness of the migration, eventually, we will launch using a similar database.

- If the app starts up with an empty database, the login page should allow a user to be created, that first user then has admin access. Any other user after that is student by default. Admin can change users to prof and some profs can then promote others to prof account (as in the existing meteorjs app). If SSO is enabled for login (which it wouldn't be on an empty database), then the assignment to student or prof account can be obtained by information in the SAML login logic. 

- Prioritize making batches of work that lead to a stable version of the app that can be tested through UI by a human (and let them know which features/flows should now work).

## Some suggested steps before making a detailed plan
- Generate a complete list of all of the React components, all of the pages, all of the routes, all of the meteor methods and the Mongo collections. Make a map of how these interact with each other, which componet uses what method, which routes use which methods, which components require responsive changes to the data, etc. Use this to generate the detailed list of tasks that need to be accomplished to make sure that nothing gets missed. This list can be kept up to date by the various agents as the work progresses and referred back to in order to ensure that work has not drifted.

- Organize the work into a larger framework that allows you to make detailed plans for every lane of work. As much as possible, plan on this work being done by multiple agents that you launch in parallel. Each agent would have sub tasks and documentation that they update. The main lane always cross checks that everything is following the master plan derived from this file. 

## Things to ensure:
- Image uploads still need to work (Amazon S3, Azure, local)

- SSO SAML connections need to work as before

- Needs to be able to send emails as it does now (for password resets)

- Keep detailed documentation up to date. The main README should have up to date instructions on how to test the app, natively and with docker compose. 

- Keep detailed documentation on the migration up to date. It should show the original plan, progress, future works and details. The migration should be done in multiple parallel lanes to speed it up. 

## Some milestones to aim for (that are testable by a human using the UI):

1) Login works - user on an empty database can create an account, becomes admin and has access to the admin panel. Other users can create accounts, and admins can change them to prof and allow profs to promote other accounts. Users can login, change their password, logout. They can request a password reset by email that works. 

2) Users can log in and update their profile pics. The admin interface correctly connects the app to an upload service and works for Azure, S3, and local storage. Preliminary testing of SAML indicate that it works. 

3) Prof users can create a course with all its properties. Students can join the course based on the enrollment code. Profs and students can un-enroll. Guards in place to prevent courses having no profs. TA roles exist. 

4) Prof can create interactive sessions and quizzes, the editors work as before. The status of a quiz can be set (draft, live, etc.). Questions can be edited as before, including with graphics and MathJax equations. The Question library and all question types work. 

5) Interactive sessions and quizzes now work, students can answer questions in interactive sessions and profs can see the answers update in real time. They can choose to show the distribution of responses (stats) and/or the correct answer. They can create a new attempt. All responses are being recorded in the database. 

6) Grading works. Profs and TAs can open the session grading pages and modals. The grade table works and correctly calculates grades. The data can be downloaded in CSV. One can also review sessions, and download the CSV data for a specific session. 

7) Grouping and video chat work. SSO login with SAML is confirmed to work and roles can be assigned based on the SAML login information. Everything works and the documentation, in particular user and develop manuals, are up to date. Robust testing is in place. All packages are up to date and there are no known security vulnerabilities.

8) Any remaining functionality is restored. The app works as before when restored from the existing data base. It also looks better and is snappier. The app is ready to be deployed in a load-balanced collection of servers started with a docker compose file. Robust utilities are in place to help set things up and keep regular backups. The documentation is up to date.

## Things to change compared to the meteorjs app:
1) The admin interface in the meteorjs version is super slow because it loads all the users. It also looks super clunky, you can revamp that using modern/new react components. Retain functionality, but the look should be updated (and remain consistent with the rest of the app).

## Testing:
- I want to have unit tests from the onset. Introduce tests to make sure that everything works (e.g. api routes) based on best practices every time you introduce new functionality. You should develop a series of tests that have to pass on each PR and gradually implement them as the code gets updated. In general, when features are added, tests are also added for those features.

- I want to have several tests that test various "flows". For example, the "login flow" would involve a user going to the main website, being shown the /login endpoint, then clicking to create and account, then loggin in and updating their profile pic and password (for example, or some other interaction). Then logging back out and back in. These tests should be done from the frontend (which will also test the backend). On a page, for example, one should simulate that every button that is clicked has the expected behaviour. It would be costly to run these at each PR during the migration, these should only run at big milestones in the migrationm, unlike tests of the backend and api which should pass at each PR. Develop such "flow tests" and describe them in the documentation in plain english. 


## Next steps:
- Once you understand this document and the existing meteorjs version of the app in detail, start mapping out a plan for the work that can be carried out in multiple parallel lanes (aim for 7-8 parallel agents working at once). Divide this up into small manageable sets of instructions so that agents can focus on well-defined tasks. First task is to setup the repository with a README, .gitignore, etc. 

- Keep a master document, MIGRATION.md, up to date with the current migration plan and a current status. It should refer to more detailed plans for the individual tasks to be run by parallel agents, and it should refer to this document as well. 

- Work on the migration will be initiated by telling an agent to look at MIGRATION.md and resume the work, so MIGRATION.md has to have all of the required information to resume the work (including pointing towards more detailed plans), as well as ensure that it aligns with what is described here. It should be explicit in MIGRATION.md to cross-check this file regularly to ensure alignment. This file should only be updated by a human user.

