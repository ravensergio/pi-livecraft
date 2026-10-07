import type { ServerResponse } from 'node:http'

/**
 * Writes a frame to every live SSE client, lazily dropping dead ones.
 *
 * A client whose socket died (e.g. browser AFK) is still in the set until its
 * close event is processed. Writing to it throws; an uncaught throw in the
 * manager event callback crashes the backend and drops every in-flight request.
 */
export function broadcastFrame(clients: Set<ServerResponse>, frame: string): void {
  for (const client of clients) {
    if (client.destroyed || !client.writable) {
      clients.delete(client)
      continue
    }
    try {
      client.write(frame)
    } catch {
      clients.delete(client)
    }
  }
}
