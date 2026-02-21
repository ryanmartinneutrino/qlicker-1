"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const connect_mongo_1 = __importDefault(require("connect-mongo"));
const csrf_csrf_1 = require("csrf-csrf");
const db_1 = require("./db");
const setup_1 = require("./auth/setup");
const realtime_manager_1 = require("./realtime/realtime-manager");
const rate_limit_1 = require("./middleware/rate-limit");
const auth_1 = __importDefault(require("./routes/auth"));
const courses_1 = __importDefault(require("./routes/courses"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const questions_1 = __importDefault(require("./routes/questions"));
const responses_1 = __importDefault(require("./routes/responses"));
const grades_1 = __importDefault(require("./routes/grades"));
const images_1 = __importDefault(require("./routes/images"));
const settings_1 = __importDefault(require("./routes/settings"));
const users_1 = __importDefault(require("./routes/users"));
const PORT = process.env.PORT ? (parseInt(process.env.PORT, 10) || 3001) : 3001;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/qlicker';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-prod';
const ROOT_URL = process.env.ROOT_URL || `http://localhost:${PORT}`;
async function main() {
    // 1. Connect to MongoDB
    await (0, db_1.connectDB)(MONGO_URL);
    // 2. Create Express app
    const app = (0, express_1.default)();
    const httpServer = (0, http_1.createServer)(app);
    // 3. Security middleware
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: ROOT_URL, credentials: true }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // 4. Session
    app.use((0, express_session_1.default)({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: connect_mongo_1.default.create({ mongoUrl: MONGO_URL }),
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
    }));
    // 5. Passport authentication
    (0, setup_1.setupPassport)();
    app.use(passport_1.default.initialize());
    app.use(passport_1.default.session());
    // 6. CSRF protection (double-submit cookie pattern)
    const { generateToken, doubleCsrfProtection } = (0, csrf_csrf_1.doubleCsrf)({
        getSecret: () => SESSION_SECRET,
        cookieName: '__Host-psifi.x-csrf-token',
        cookieOptions: {
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        },
    });
    // Expose CSRF token endpoint (GET /api/csrf-token) — clients must fetch this
    // before making state-changing requests and include the token in x-csrf-token header
    app.get('/api/csrf-token', (req, res) => {
        res.json({ csrfToken: generateToken(req, res) });
    });
    // Apply CSRF protection to all state-changing API routes
    app.use('/api', doubleCsrfProtection);
    // 7. Rate limiting
    app.use('/api', rate_limit_1.generalLimiter);
    // 8. Routes
    app.use('/api/auth', auth_1.default);
    app.use('/api/courses', courses_1.default);
    app.use('/api/sessions', sessions_1.default);
    app.use('/api/questions', questions_1.default);
    app.use('/api/responses', responses_1.default);
    app.use('/api/grades', grades_1.default);
    app.use('/api/images', images_1.default);
    app.use('/api/settings', settings_1.default);
    app.use('/api/users', users_1.default);
    // 9. Health check
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    // 10. Socket.IO + Change Streams
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: ROOT_URL, credentials: true },
    });
    (0, realtime_manager_1.setupRealtime)(io);
    httpServer.listen(PORT, () => {
        console.log(`Qlicker server running on port ${PORT}`);
    });
}
main().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map