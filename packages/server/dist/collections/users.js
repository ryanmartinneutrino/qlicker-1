"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = getUsers;
exports.initUsers = initUsers;
const db_1 = require("../db");
function getUsers() {
    return (0, db_1.getDB)().collection('users');
}
async function initUsers() {
    const col = getUsers();
    await col.createIndex({ 'emails.address': 1 }, { unique: true, sparse: true });
    await col.createIndex({ 'profile.roles': 1 });
    return col;
}
//# sourceMappingURL=users.js.map