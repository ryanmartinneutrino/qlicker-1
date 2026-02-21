"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessions = getSessions;
exports.initSessions = initSessions;
const db_1 = require("../db");
function getSessions() {
    return (0, db_1.getDB)().collection('sessions');
}
async function initSessions() {
    const col = getSessions();
    await col.createIndex({ courseId: 1 });
    await col.createIndex({ status: 1 });
    return col;
}
//# sourceMappingURL=sessions.js.map