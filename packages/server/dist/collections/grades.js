"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGrades = getGrades;
exports.initGrades = initGrades;
const db_1 = require("../db");
function getGrades() {
    return (0, db_1.getDB)().collection('grades');
}
async function initGrades() {
    const col = getGrades();
    // Indexes migrated from server/main.js
    await col.createIndex({ userId: 1 });
    await col.createIndex({ courseId: 1 });
    await col.createIndex({ sessionId: 1 });
    await col.createIndex({ userId: 1, sessionId: 1 }); // compound for hot path
    return col;
}
//# sourceMappingURL=grades.js.map