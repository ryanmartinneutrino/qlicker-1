+Overview:

We are going to migrate the MeteorJS version of the app to a new version that uses Fastify and React. 

We started an earlier migration using Express, but I've changed my mind and want to use Fastify as it's faster and will be better in the long term, I think. So we are going to start the migration from scratch. 

You should start by stashing all of the changes that happened to ryanmartinneutrino/qlicker-1 since PR#6 (included) into some branch called something like failed-express-migration. You should then resync ryanmartinneutrino/qlicker-1:master so that it's the same as qlicker/qlicker:master (the original repository we forked from) and we will start from there.

All of our changes will go into ryanmartinneutrino/qlicker-1:master, so PRs should ultimately go against that branch. We should have up to 8 parallel lanes running, submitting PRs, including one lane that manages the process, merges PRs and periodically submits a summary PRs that has to be approved before merging.

I would recommend that the first step (after stashing the failed migration and reverting to the upstream repository) is to move all of the meteorjs stuff (so the whole existing repository) into a qlicker_meteor/ subfolder that remains there for you to consult and compare compatability, and essentially start the repository from scratch. After that, you can start developing a detailed plan following the guidelines in this file.

On the local copy of the repository, there is directory legacydb/ - leave that untouched (it has a db backup for testing compatability and should never be synched to github as it contains sensitive information). You should also keep a copy of this file in the repository, so that detailed migration plans can refer back to this file and avoid any drift.


+ What we're trying to do:
- We want to modernize the app and make it easier to keep up to date and secure. Working with meteor has become annoying since its stack has to be kept up to date in additiona to all of the node pacakges that are being used. Generally, we want to depend on as few external packages  as possible (both backend and frontend). We want to stick to well-maintained dependencies that should have good long term support and be secure.

- We want to ensure that the app is fast, it can have thousands of users connected.

- We want to simplify the code as much as possible, there are likely many redudant snippets of code in both the backend and the frontend. We want to make it easy to maintain and to add features in the future. 

+Some technical requirements:

- For the frontend we want it to be clean and uniform, it likely makes sense to update many of the existing react components, perhaps to swap in elements of material design. There is a mess of CSS and SCSS that can likely be cleaned-up. Re-uses components as much as possible to make things clean and uniform. Also, think ahead, so that we can make changes to the look of the UI (e.g. fonts) that are easily propagated everywhere. However, make sure to maintain the current functionality for all aspects of the app.

- At the end of the migration, we want to be able to switch from the meteorjs version now in production to the new version in an seemless way for the users. The new app thus needs to be compatible with the mongo database that is currently used in production by the meteorjs version. It must have the same functionality and general look. I provide an example of the existing mongo database in the legacydb/ directory

- The app benefits from meteorjs subscription system that makes it reactive to changes in the database. We must absolutely retain this functionality so that pages update immediately if something changes in the database. This is particularly important in the context of "interactive sessions", where the professor chooses which questions to show, the responses update in the prof interface, etc. But in general, anywhere where the data is reactive to the database, it needs to stay that way. Remember that it needs to be fast, so we're looking for speed improvements over meteor!

- It seems like the best way to do this is to migrate to fastify and run an api on the backend. The front-end would still be react, but significantly updated. 

- We want to run this both natively and in docker-compose file. In production, it will run in a docker compose stack with multiple instances running to make it fast (so think about that in the design). There should be a script that can be run by the user to setup the docker stack (basically generate a file with environment variables used by docker) that should allow the app to run natively for testing and then for production. The script should ask which ports to use (and suggest defaults that it has confirmed are free). 

- There should also be a script run by the user to setup the app to run natively (in particular, it should offer to install all dependencies (node, npm, fastify - run any npm installs, it should ask for which ports to use, etc). Both the native and docker setup script ultimately save env files that are used by the app, including to choose which ports to listen on. There should also be scripts to seed the database with a couple of users, for both docker and native versions, with the option of resetting the database to be empty. There should be a single script to start/stop/restart/status the native version of the app.

- The local copy of the repository has a backup (mongodump) of the production database inside the directory legacydb/. That data should never be uploaded to github, and the filename should never be refered to explicitly for anything that gets uploaded. However, the legacy database should be used for testing backward compatability and completeness of the migration.

- If the app starts up with an empty database, the login page should allow a user to be created, that first user then has admin access. Any other user after that is student by default (unless they log in by SSO and the SSO sets them as professor - see options in the admin pages)


+ Things to watch out for:
- Image uploads still need to work (Amazon S3, Azure, local)

- SSO SAML connections need to work as before

- Needs to be able to send emails as it does now

- Keep detailed documentation up to date. The main README should have up to date instructions on how to test the app, natively and with docker compose. 

- Keep detailed documentation on the migration up to date. It should show the original plan, progress, future works and details. The migration should be done in multiple parallel lanes to speed it up. 

+ Obvious things to clean up:

- The admin interface is super slow because it loads all the users. It also looks super clunky, you can revamp that using modern/new react components. Retain functionality, but the look should be updated (and remain consistent with the rest of the app)


+ Testing:
- I want to have unit tests from the onset. You can think of introducing tests to make sure that everything works (e.g. api routes) based on best practices. You should develop a series of tests that have to pass on each PR and gradually implement them as the code gets updated. In general, when features are added, tests are also added for thos features.  

- I want to have several tests that test various "flows". For example, the "login flow" would involve a user going to the main website, being shown the /login endpoint, then clicking to create and account, then loggin in and updating their profile pic and password (for example, or some other interaction). Then logging back out and back in. Develop a list of such "flows" (in plain english), and tests that correspond to these.

+ Next steps:
- Once you understand this document and the existing meteorjs version of the app in detail, start mapping out a plan for the work. That plan will involve multiple parallel lanes and one control lane to manage the work and report back. The status of the migration is always kept up to date (e.g. in detailed plans for the multiple parallel lanes), and checks are regularly performed against this file to ensure that the work is still aligned. It should be explicit in the main migration file to cross-check this file. This file might be updated from time to time, but only by a human user.

