import type { Server as SocketIOServer } from 'socket.io';
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
export declare function setupRealtime(io: SocketIOServer): void;
