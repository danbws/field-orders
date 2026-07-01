import { useCallback, useEffect, useState } from "react";
import { getOrders, getProducts, type Product, type SyncedOrder } from "./api";
import { enqueue, flushOutbox, loadOutbox, removeFromOutbox, type OutboxItem } from "./outbox";

interface CartLine {
  product: Product;
  quantity: number;
}

const sectionLabel = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400";

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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col border-x border-slate-200 bg-slate-50">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-slate-900 px-4 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-500 text-xs font-bold">
            FO
          </div>
          <span className="text-sm font-semibold tracking-wide">Field Orders</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-medium text-amber-300">
              {pending.length} queued
            </span>
          )}
          <span
            data-testid="conn"
            className="flex items-center gap-1.5 rounded-full bg-slate-800 px-2 py-0.5 font-medium"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-rose-400"}`}
            />
            <span className={online ? "text-emerald-300" : "text-rose-300"}>
              {online ? "online" : "offline"}
            </span>
          </span>
        </div>
      </header>

      {toast && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <section className="px-4 pt-4">
        <h2 className={sectionLabel}>New order</h2>
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="Customer name"
          className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="grid grid-cols-2 gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-md border border-slate-200 bg-white p-3 text-left transition-colors active:border-indigo-400 active:bg-indigo-50"
            >
              <p className="text-sm font-medium text-slate-800">{p.name}</p>
              <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                {p.sku} · ${p.price.toFixed(2)}
              </p>
            </button>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="px-3 py-2">
              {cart.map((l) => (
                <div key={l.product.id} className="flex justify-between py-1 text-sm">
                  <span className="text-slate-700">
                    {l.product.name} <span className="tabular-nums text-slate-400">× {l.quantity}</span>
                  </span>
                  <span className="font-medium tabular-nums text-slate-800">
                    ${(l.quantity * l.product.price).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={saveOrder}
              disabled={!customer}
              className="w-full bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
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
              className="flex items-stretch overflow-hidden rounded-md border border-slate-200 bg-white"
            >
              <div className="w-1 bg-amber-400" />
              <div className="flex-1 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{o.customer}</span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Queued
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <p className="text-xs tabular-nums text-slate-500">
                    {o.items.length} item(s) · saved{" "}
                    {new Date(o.created_offline_at).toLocaleTimeString()}
                  </p>
                  <button
                    onClick={() => discardQueued(o.client_id)}
                    className="text-xs font-medium text-rose-500 hover:text-rose-700"
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
              className="flex items-stretch overflow-hidden rounded-md border border-slate-200 bg-white"
            >
              <div className="w-1 bg-emerald-500" />
              <div className="flex-1 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{o.customer}</span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Synced
                  </span>
                </div>
                <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                  {o.items.length} item(s) · ${o.total.toFixed(2)}
                </p>
              </div>
            </li>
          ))}
          {pending.length === 0 && synced.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              No orders yet — tap a product to start one.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
