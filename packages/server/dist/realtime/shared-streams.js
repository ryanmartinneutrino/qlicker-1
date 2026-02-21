"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedChangeStream = void 0;
const events_1 = require("events");
/**
 * SharedChangeStream — one Change Stream per collection, fanning out to
 * multiple Socket.IO clients via EventEmitter routing keys.
 *
 * This avoids opening one Change Stream per connected client, which would
 * exhaust the MongoDB oplog cursor budget at high scale.
 */
class SharedChangeStream extends events_1.EventEmitter {
    constructor(collectionName) {
        super();
        this.setMaxListeners(0); // unlimited listeners (one per subscription)
        this.collectionName = collectionName;
    }
    /** Emit an event to all listeners subscribed to a routing key */
    publish(routingKey, event) {
        this.emit(routingKey, event);
        // Also emit to wildcard subscribers for this collection
        this.emit(`${this.collectionName}:*`, event);
    }
    subscribe(routingKey, handler) {
        this.on(routingKey, handler);
        return () => this.off(routingKey, handler);
    }
}
exports.SharedChangeStream = SharedChangeStream;
//# sourceMappingURL=shared-streams.js.map