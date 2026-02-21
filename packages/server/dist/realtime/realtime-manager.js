"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRealtime = setupRealtime;
const db_1 = require("../db");
const shared_streams_1 = require("./shared-streams");
const courses_1 = require("../collections/courses");
const sessions_1 = require("../collections/sessions");
const questions_1 = require("../collections/questions");
// One SharedChangeStream per collection
const streams = {};
/** Extract authenticated user ID from socket session */
function getUserIdFromSocket(socket) {
    return socket.request.session?.passport?.user;
}
/**
 * Initialize Socket.IO + MongoDB Change Streams.
 *
 * Architecture:
 * - One MongoDB Change Stream per collection (fan-out via EventEmitter).
 * - Clients subscribe to specific routing keys (e.g., "session:<id>").
 * - Proper authorization checks on each subscription.
 * - Change Stream events are routed to only the relevant clients.
 *
 * Requires MongoDB replica set (already required per Docker deployment).
 */
function setupRealtime(io) {
    const db = (0, db_1.getDB)();
    const collectionNames = ['courses', 'sessions', 'questions', 'responses', 'grades'];
    // Start one Change Stream per collection
    for (const name of collectionNames) {
        const stream = new shared_streams_1.SharedChangeStream(name);
        streams[name] = stream;
        const col = db.collection(name);
        const changeStream = col.watch([], { fullDocument: 'updateLookup' });
        changeStream.on('change', (event) => {
            // Route to appropriate keys
            const doc = event.fullDocument;
            if (!doc) {
                stream.publish(`${name}:*`, event);
                return;
            }
            // Collection-level wildcard
            stream.publish(`${name}:*`, event);
            // Document-level routing
            if (doc._id)
                stream.publish(`${name}:${doc._id}`, event);
            // Parent-level routing
            if (doc.sessionId)
                stream.publish(`${name}:session:${doc.sessionId}`, event);
            if (doc.courseId)
                stream.publish(`${name}:course:${doc.courseId}`, event);
            if (doc.questionId)
                stream.publish(`${name}:question:${doc.questionId}`, event);
        });
        changeStream.on('error', (err) => {
            console.error(`Change stream error for ${name}:`, err);
        });
    }
    // Socket.IO connection handler
    io.on('connection', (socket) => {
        const unsubscribers = [];
        /**
         * Subscribe to responses for a question.
         * Mirrors the responses.forQuestion publication in imports/api/responses.js.
         * Students see their own responses; if stats is enabled they see all but
         * without other students' IDs.
         */
        socket.on('subscribe:responses', async ({ questionId }) => {
            if (!questionId)
                return;
            const userId = getUserIdFromSocket(socket);
            if (!userId) {
                socket.emit('error', { message: 'Not authenticated.' });
                return;
            }
            const question = await (0, questions_1.getQuestions)().findOne({ _id: questionId });
            if (!question)
                return;
            let isInstructor = false;
            if (question.sessionId) {
                const session = await (0, sessions_1.getSessions)().findOne({ _id: question.sessionId });
                if (session) {
                    const course = await (0, courses_1.getCourses)().findOne({ _id: session.courseId });
                    if (course)
                        isInstructor = course.instructors?.includes(userId) ?? false;
                }
            }
            const unsub = streams['responses'].subscribe(`responses:question:${questionId}`, (event) => {
                const doc = event.fullDocument;
                if (isInstructor) {
                    socket.emit('responses:change', event);
                }
                else {
                    const statsEnabled = question.sessionOptions?.stats ?? false;
                    if (statsEnabled) {
                        // Omit studentUserId for other students (use destructuring, not undefined assignment)
                        if (doc?.studentUserId && doc.studentUserId !== userId) {
                            const { studentUserId: _omit, ...docRest } = doc;
                            const sanitized = { ...event, fullDocument: docRest };
                            socket.emit('responses:change', sanitized);
                        }
                        else {
                            socket.emit('responses:change', event);
                        }
                    }
                    else if (doc?.studentUserId === userId) {
                        socket.emit('responses:change', event);
                    }
                }
            });
            unsubscribers.push(unsub);
        });
        /** Subscribe to session updates */
        socket.on('subscribe:session', async ({ sessionId }) => {
            if (!sessionId)
                return;
            const unsub = streams['sessions'].subscribe(`sessions:${sessionId}`, (event) => {
                socket.emit('session:change', event);
            });
            unsubscribers.push(unsub);
        });
        /** Subscribe to question updates within a session */
        socket.on('subscribe:questions', async ({ sessionId }) => {
            if (!sessionId)
                return;
            const unsub = streams['questions'].subscribe(`questions:session:${sessionId}`, (event) => {
                socket.emit('questions:change', event);
            });
            unsubscribers.push(unsub);
        });
        /** Subscribe to grade updates for a user */
        socket.on('subscribe:grades', async ({ userId: targetUserId }) => {
            const requestingUserId = getUserIdFromSocket(socket);
            // Only allow users to subscribe to their own grades, or admins/instructors
            if (!requestingUserId || requestingUserId !== targetUserId)
                return;
            const unsub = streams['grades'].subscribe(`grades:*`, (event) => {
                const doc = event.fullDocument;
                if (doc?.userId === targetUserId) {
                    socket.emit('grades:change', event);
                }
            });
            unsubscribers.push(unsub);
        });
        // Unsubscribe from all on disconnect
        socket.on('disconnect', () => {
            unsubscribers.forEach((unsub) => unsub());
        });
    });
}
//# sourceMappingURL=realtime-manager.js.map