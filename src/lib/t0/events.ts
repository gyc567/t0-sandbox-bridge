// SSE (Server-Sent Events) module for real-time event broadcasting.
// Provides pub/sub pattern for NetworkEvent notifications.

import type { NetworkEvent } from "./types";

type Subscriber = (event: NetworkEvent) => void;

const subscribers = new Set<Subscriber>();

/**
 * Subscribe to event broadcasts.
 * @returns unsubscribe function
 */
export function subscribeEvents(callback: Subscriber): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Broadcast an event to all subscribers.
 * Removes failed subscribers to prevent memory leaks.
 */
export function broadcastEvent(event: NetworkEvent): void {
  for (const sub of subscribers) {
    try {
      sub(event);
    } catch {
      // Remove failed subscriber
      subscribers.delete(sub);
    }
  }
}

/**
 * Get current number of active subscribers.
 */
export function getSubscriberCount(): number {
  return subscribers.size;
}

/**
 * Clear all subscribers (mainly for testing).
 */
export function clearSubscribers(): void {
  subscribers.clear();
}

/**
 * Format event as SSE message.
 */
export function formatSSEMessage(event: NetworkEvent): string {
  const data = JSON.stringify(event);
  return `data: ${data}\n\n`;
}
