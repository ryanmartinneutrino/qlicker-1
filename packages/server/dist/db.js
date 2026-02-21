"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = connectDB;
exports.getDB = getDB;
exports.getClient = getClient;
const mongodb_1 = require("mongodb");
let client = null;
let db = null;
async function connectDB(mongoUrl) {
    if (db)
        return db;
    client = new mongodb_1.MongoClient(mongoUrl, {
        // Connection pooling settings for high concurrency
        maxPoolSize: 50,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    });
    await client.connect();
    const url = new URL(mongoUrl);
    const dbName = url.pathname.slice(1).split('?')[0] || 'qlicker';
    db = client.db(dbName);
    console.log(`Connected to MongoDB: ${dbName}`);
    return db;
}
function getDB() {
    if (!db)
        throw new Error('Database not connected. Call connectDB() first.');
    return db;
}
function getClient() {
    if (!client)
        throw new Error('MongoDB client not initialized.');
    return client;
}
//# sourceMappingURL=db.js.map