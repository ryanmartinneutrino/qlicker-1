import { EventEmitter } from 'events'
import type { ChangeStreamDocument } from 'mongodb'

type RoutingKey = string

/**
 * SharedChangeStream — one Change Stream per collection, fanning out to
 * multiple Socket.IO clients via EventEmitter routing keys.
 *
 * This avoids opening one Change Stream per connected client, which would
 * exhaust the MongoDB oplog cursor budget at high scale.
 */
export class SharedChangeStream extends EventEmitter {
  private collectionName: string

  constructor(collectionName: string) {
    super()
    this.setMaxListeners(0) // unlimited listeners (one per subscription)
    this.collectionName = collectionName
  }

  /** Emit an event to all listeners subscribed to a routing key */
  publish(routingKey: RoutingKey, event: ChangeStreamDocument): void {
    this.emit(routingKey, event)
    // Also emit to wildcard subscribers for this collection
    this.emit(`${this.collectionName}:*`, event)
  }

  subscribe(routingKey: RoutingKey, handler: (event: ChangeStreamDocument) => void): () => void {
    this.on(routingKey, handler)
    return () => this.off(routingKey, handler)
  }
}
