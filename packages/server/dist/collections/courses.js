"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourses = getCourses;
exports.initCourses = initCourses;
const db_1 = require("../db");
function getCourses() {
    return (0, db_1.getDB)().collection('courses');
}
async function initCourses() {
    const col = getCourses();
    await col.createIndex({ owner: 1 });
    await col.createIndex({ students: 1 });
    await col.createIndex({ instructors: 1 });
    await col.createIndex({ enrollmentCode: 1 }, { unique: true, sparse: true });
    return col;
}
//# sourceMappingURL=courses.js.map