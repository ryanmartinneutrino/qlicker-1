"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImages = getImages;
exports.initImages = initImages;
const db_1 = require("../db");
function getImages() {
    return (0, db_1.getDB)().collection('images');
}
async function initImages() {
    const col = getImages();
    // Index migrated from server/main.js
    await col.createIndex({ UID: 1 });
    return col;
}
//# sourceMappingURL=images.js.map