import { EventEmitter } from 'events';
import type { ChangeStreamDocument } from 'mongodb';
type RoutingKey = string;
/**
 * SharedChangeStream — one Change Stream per collection, fanning out to
 * multiple Socket.IO clients via EventEmitter routing keys.
 *
 * This avoids opening one Change Stream per connected client, which would
 * exhaust the MongoDB oplog cursor budget at high scale.
 */
export declare class SharedChangeStream extends EventEmitter {
    private collectionName;
    constructor(collectionName: string);
    /** Emit an event to all listeners subscribed to a routing key */
    publish(routingKey: RoutingKey, event: ChangeStreamDocument): void;
    subscribe(routingKey: RoutingKey, handler: (event: ChangeStreamDocument) => void): () => void;
}
export {};
