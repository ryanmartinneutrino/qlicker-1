Overview:

We are going to migrate the MeteorJS version of the app to a new version that uses Fastify and React. 

We started an earlier migration using Express, but I've changed my mind and want to use Fastify as it's faster and will be better in the long term, I think. So we are going to start the migration from scratch. You should start by stashing all of the changes that happened to ryanmartinneutrino/qlicker-1 since PR#6 (inlcuded) into some branch called something like failed-express-migration. You should then resync ryanmartinneutrino/qlicker-1:master so that it's the same as qlicker/qlicker:master (the original repository we forked from).

All of our changes will go into ryanmartinneutrino/qlicker-1:master, so PRs should ultimately go against that branch. We should have up to 8 parallel lanes running, submitted PRs, including one lane that manages the process and submits summary PRs that have to be approved before merging. I would recommend that the first step is to move all of the meteorjs stuff (so the whole existing repository) into a qlicker_meteor subfolder that remains there for you to consult and compare compatability, and essentially start the repository from scratch.

What we're trying to do:
- We want to modernize the app and make it easier to keep up to date and secure. Working with meteor has become annoying since its stack has be updated as well as all of the node stuff and node modules. Generally, we want to depend on as few external packages  as possible (both backend and frontend). We want to stick to well-maintained dependencies that should have good long term support and be secure.

- We also want to ensure that the app is fast, it can have thousands of users connected.

- We want to simplify the code as much as possible, there are likely many redudant snippets of code in both the backend and the frontend. 

Some technical requirements:

- For the frontend we want it to be clean and uniform, it likely makes sense to change some of the existing react components, perhaps to swap in elements of material design. There is a mess of CSS and SCSS that can likely be cleaned-up. Re-uses components as much as possible to make things clean and uniform. Also, think ahead, so that we can make changes to the look of the UI (e.g. fonts) that are easily propagated everywhere. 

- At the end of the migration, we want to be able to switch from the meteorjs version now in production to the new version in an seemless way for the users. The new app thus needs to be compatible with the mongo database that is currently used in production by the meteorjs version. It must have the same functionality and general look.

- The app benefits from meteorjs subscription system that makes it reactive to changes in the database. We must absolutely retain this functionality so that pages update immediately if something changes in the database. This is particularly important in the context of "interactive sessions", where the professor chooses which questions to show, the responses update in the prof interface, etc. But in general, anywhere where the data is reactive to the database, it needs to stay that way. Remember that it needs to be fast, so we're looking for speed improvements over meteor!

- It seems like the best way to do this is to migrate to fastify and run an api on the backend. The front-end would still be react, but significantly updated. 

- We want to run this both natively and in docker-compose file. In production, it will run in a docker compose stack with multiple instances running to make it fast (so think about that in the design). There should be a script run by the user to setup the docker stack (basically generate a file with environment variables used by docker) that should allow the app to run natively for testing and then for production. The script should ask which ports to use (and suggest defaults that it has confirmed are free). There should also be a script run by the user to setup the app to run natively (in particular, it should offer to install all dependencies (node, npm, fastify - run any npm installs, it should ask for which ports to use, etc). Both the native and docker setup script ultimately save env files that are used by the app, including to choose which ports to listen on. There should also be scripts to seed the database with a couple of users, for both docker and native versions, with the option of resetting the database to be empty. There should be a single script to start/stop/restart/status the native version of the app.

- The local copy of the repository has a backup (mongodump) of the production database inside the directory legacydb. That data should never be uploaded to github, and the filename should never be refered to explicitly for anything that gets uploaded. However, the legacy database should be used for testing backward compatability and completeness of the migration.

- If the app starts up with an empty database, the login page should allow a user to be created, that first user then has admin access. Any other user after that is student by default (unless they log in by SSO and the SSO sets them as professor - see options in the admin pages)


Things to watch out for:
- Image uploads still need to work
- SSO SAML connections need to work as before

Obvious things to clean up
- The admin interface is super slow because it loads all the users. It also looks super clunky, you can revamp that using modern/new react components. Retain functionality, but the look should be updated (and remain consistent with the rest of the app)


Flow and tests:


