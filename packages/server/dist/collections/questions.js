"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuestions = getQuestions;
exports.initQuestions = initQuestions;
const db_1 = require("../db");
function getQuestions() {
    return (0, db_1.getDB)().collection('questions');
}
async function initQuestions() {
    const col = getQuestions();
    // Indexes migrated from server/main.js
    await col.createIndex({ sessionId: 1 });
    await col.createIndex({ courseId: 1 });
    await col.createIndex({ owner: 1 });
    await col.createIndex({ creator: 1 });
    await col.createIndex({ sessionId: 1, courseId: 1 }); // compound for hot path
    return col;
}
//# sourceMappingURL=questions.js.map