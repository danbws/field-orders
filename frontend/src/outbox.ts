/**
 * The outbox: orders born on the device, waiting for a connection.
 *
 * Persistence is localStorage to keep the demo readable end to end — in the
 * production app this pattern came from, it's IndexedDB (more space, async,
 * survives bigger queues). The pattern is identical:
 *
 *   save → enqueue locally (instant, works offline) → flush when online →
 *   server acks created/duplicate → remove from queue.
 *
 * The client_id (UUID minted here, offline) is what makes retries safe:
 * the server treats replays as duplicates, so flushing twice never double-books.
 */

export interface OutboxItem {
  client_id: string;
  customer: string;
  rep_name: string;
  created_offline_at: string;
  items: {
    product_sku: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
}

const KEY = "field-orders-outbox";

export function loadOutbox(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveOutbox(items: OutboxItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueue(order: Omit<OutboxItem, "client_id" | "created_offline_at">): OutboxItem {
  const item: OutboxItem = {
    ...order,
    client_id: crypto.randomUUID(),
    created_offline_at: new Date().toISOString(),
  };
  saveOutbox([...loadOutbox(), item]);
  return item;
}

/** Drop a queued order that hasn't synced yet — e.g. the rep saved it by
 * mistake. Safe because it only lives on the device until the server acks it;
 * once synced it leaves the outbox and can no longer be removed here. */
export function removeFromOutbox(clientId: string): void {
  saveOutbox(loadOutbox().filter((o) => o.client_id !== clientId));
}

/** Push the queue to the server. Returns how many were acknowledged. */
export async function flushOutbox(): Promise<number> {
  const pending = loadOutbox();
  if (pending.length === 0) return 0;

  const resp = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orders: pending }),
  });
  if (!resp.ok) throw new Error(`Sync failed: ${resp.status}`);

  const { results } = (await resp.json()) as {
    results: { client_id: string; result: "created" | "duplicate" | "rejected"; reason?: string }[];
  };
  // 'duplicate' is also success: the server already has it. 'rejected' (e.g. an
  // unknown SKU) will never succeed on retry, so it's cleared too rather than
  // looping the outbox forever. Every acknowledged id leaves the queue.
  const acked = new Set(results.map((r) => r.client_id));
  saveOutbox(pending.filter((p) => !acked.has(p.client_id)));
  return acked.size;
}
