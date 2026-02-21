"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResponses = getResponses;
exports.initResponses = initResponses;
const db_1 = require("../db");
function getResponses() {
    return (0, db_1.getDB)().collection('responses');
}
async function initResponses() {
    const col = getResponses();
    // Indexes migrated from server/main.js
    await col.createIndex({ questionId: 1 });
    await col.createIndex({ studentUserId: 1 });
    await col.createIndex({ questionId: 1, studentUserId: 1 }); // compound for hot path
    return col;
}
//# sourceMappingURL=responses.js.map