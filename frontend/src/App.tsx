import { useCallback, useEffect, useState } from "react";
import { getOrders, getProducts, type Product, type SyncedOrder } from "./api";
import { enqueue, flushOutbox, loadOutbox, removeFromOutbox, type OutboxItem } from "./outbox";

interface CartLine {
  product: Product;
  quantity: number;
}

const sectionLabel = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-slateweb";

/** RouteLine mark: a rounded route-pin whose negative space is a checkmark
 *  (captured + located). Its colour is the offline heartbeat — Route Green when
 *  everything is synced, Signal Amber the moment there's anything pending. */
function RouteMark({ pending }: { pending: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${pending ? "text-signal" : "text-route"}`}
      aria-hidden="true"
    >
      <path
        d="M12 2.2c-3.9 0-7 3-7 6.8 0 4.5 5.1 10.2 6.3 11.5a.9.9 0 0 0 1.4 0C13.9 19.2 19 13.5 19 9 19 5.2 15.9 2.2 12 2.2Z"
        fill="currentColor"
      />
      <path
        d="M8.6 9.4l2.4 2.4 4.2-4.4"
        fill="none"
        stroke="#F6F4EE"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const [products, setProducts] = useState<Product[]>([]);
  const [pending, setPending] = useState<OutboxItem[]>(loadOutbox());
  const [synced, setSynced] = useState<SyncedOrder[]>([]);
  const [customer, setCustomer] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [toast, setToast] = useState("");

  const refreshSynced = useCallback(() => {
    getOrders().then(setSynced).catch(() => {});
  }, []);

  const sync = useCallback(async () => {
    try {
      const n = await flushOutbox();
      setPending(loadOutbox());
      if (n > 0) {
        setToast(`Synced ${n} order${n > 1 ? "s" : ""}`);
        refreshSynced();
      }
    } catch {
      // still offline or server unreachable — the outbox keeps everything safe
    }
  }, [refreshSynced]);

  useEffect(() => {
    getProducts().then(setProducts);
    refreshSynced();
    sync();

    const goOnline = () => {
      setOnline(true);
      sync(); // reconnection is the natural sync trigger
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [sync, refreshSynced]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function addToCart(product: Product) {
    setCart((c) => {
      const line = c.find((l) => l.product.id === product.id);
      return line
        ? c.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 10 } : l))
        : [...c, { product, quantity: 10 }];
    });
  }

  function saveOrder() {
    if (!customer || cart.length === 0) return;
    enqueue({
      customer,
      rep_name: "Field Rep",
      items: cart.map((l) => ({
        product_sku: l.product.sku,
        product_name: l.product.name,
        quantity: l.quantity,
        unit_price: l.product.price,
      })),
    });
    setPending(loadOutbox());
    setCustomer("");
    setCart([]);
    setToast(online ? "Order saved — syncing…" : "Order saved offline — will sync later");
    if (online) sync();
  }

  function discardQueued(clientId: string) {
    removeFromOutbox(clientId);
    setPending(loadOutbox());
    setToast("Queued order removed");
  }

  const cartTotal = cart.reduce((s, l) => s + l.quantity * l.product.price, 0);
  const hasPending = pending.length > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col border-x border-black/5 bg-bone">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-ink px-4 text-white">
        <div className="flex items-center gap-2">
          <RouteMark pending={hasPending || !online} />
          <span className="font-display text-sm font-semibold tracking-tight">RouteLine</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {hasPending && (
            <span className="rounded-full bg-signal/20 px-2 py-0.5 font-medium text-signal">
              {pending.length} queued
            </span>
          )}
          <span
            data-testid="conn"
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-white/90 ${
              online ? "bg-route/20" : "bg-signal/20"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                online ? "bg-route" : "animate-pulse bg-signal"
              }`}
            />
            {online ? "online" : "offline"}
          </span>
        </div>
      </header>

      {toast && (
        <div className="border-b border-route/20 bg-route/10 px-4 py-2 text-sm font-medium text-route">
          {toast}
        </div>
      )}

      <section className="px-4 pt-4">
        <h2 className={sectionLabel}>New order</h2>
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="Customer name"
          className="mb-3 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-ink focus:border-route focus:outline-none focus:ring-1 focus:ring-route"
        />
        <div className="grid grid-cols-2 gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-md border border-black/10 bg-white p-3 text-left transition-colors active:border-route active:bg-route/5"
            >
              <p className="text-sm font-medium text-ink">{p.name}</p>
              <p className="mt-0.5 text-xs tabular-nums text-slateweb">
                {p.sku} · ${p.price.toFixed(2)}
              </p>
            </button>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-md border border-black/10 bg-white">
            <div className="px-3 py-2">
              {cart.map((l) => (
                <div key={l.product.id} className="flex justify-between py-1 text-sm">
                  <span className="text-ink/80">
                    {l.product.name} <span className="tabular-nums text-slateweb">× {l.quantity}</span>
                  </span>
                  <span className="font-medium tabular-nums text-ink">
                    ${(l.quantity * l.product.price).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-black/5 pt-2 text-sm font-semibold text-ink">
                <span>Total</span>
                <span className="tabular-nums">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={saveOrder}
              disabled={!customer}
              className="w-full bg-route py-2.5 text-sm font-medium text-white transition-colors hover:bg-route/90 disabled:opacity-40"
            >
              Save order{online ? "" : " · offline"}
            </button>
          </div>
        )}
      </section>

      <section className="px-4 pb-8 pt-6">
        <h2 className={sectionLabel}>Orders</h2>
        <ul className="space-y-1.5">
          {pending.map((o) => (
            <li
              key={o.client_id}
              className="flex items-stretch overflow-hidden rounded-md border border-black/10 bg-white"
            >
              <div className="w-1 bg-signal" />
              <div className="flex-1 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{o.customer}</span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-signal">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
                    Pending sync
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <p className="text-xs tabular-nums text-slateweb">
                    {o.items.length} item(s) · saved{" "}
                    {new Date(o.created_offline_at).toLocaleTimeString()}
                  </p>
                  <button
                    onClick={() => discardQueued(o.client_id)}
                    className="text-xs font-medium text-clay hover:opacity-70"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
          {synced.map((o) => (
            <li
              key={o.client_id}
              className="flex items-stretch overflow-hidden rounded-md border border-black/10 bg-white"
            >
              <div className="w-1 bg-route" />
              <div className="flex-1 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{o.customer}</span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-route">
                    <span className="h-1.5 w-1.5 rounded-full bg-route" />
                    Synced
                  </span>
                </div>
                <p className="mt-0.5 text-xs tabular-nums text-slateweb">
                  {o.items.length} item(s) · ${o.total.toFixed(2)}
                </p>
              </div>
            </li>
          ))}
          {pending.length === 0 && synced.length === 0 && (
            <p className="py-8 text-center text-sm text-slateweb">
              No orders yet — tap a product to start one.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
