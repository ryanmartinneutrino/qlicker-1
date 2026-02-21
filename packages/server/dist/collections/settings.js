"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.initSettings = initSettings;
const db_1 = require("../db");
function getSettings() {
    return (0, db_1.getDB)().collection('settings');
}
async function initSettings() {
    return getSettings();
}
//# sourceMappingURL=settings.js.map