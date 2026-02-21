"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAllCollections = initAllCollections;
// Centralized index creation — mirrors the _ensureIndex calls in server/main.js
// plus additional compound indexes for performance.
const courses_1 = require("./courses");
const sessions_1 = require("./sessions");
const questions_1 = require("./questions");
const responses_1 = require("./responses");
const grades_1 = require("./grades");
const images_1 = require("./images");
const settings_1 = require("./settings");
const users_1 = require("./users");
async function initAllCollections() {
    await Promise.all([
        (0, courses_1.initCourses)(),
        (0, sessions_1.initSessions)(),
        (0, questions_1.initQuestions)(),
        (0, responses_1.initResponses)(),
        (0, grades_1.initGrades)(),
        (0, images_1.initImages)(),
        (0, settings_1.initSettings)(),
        (0, users_1.initUsers)(),
    ]);
    console.log('All collection indexes ensured.');
}
//# sourceMappingURL=indexes.js.map