import { useCallback, useEffect, useState } from "react";
import { getOrders, getProducts, type Product, type SyncedOrder } from "./api";
import { enqueue, flushOutbox, loadOutbox, type OutboxItem } from "./outbox";

interface CartLine {
  product: Product;
  quantity: number;
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
        setToast(`Synced ${n} order${n > 1 ? "s" : ""} ✓`);
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

  const cartTotal = cart.reduce((s, l) => s + l.quantity * l.product.price, 0);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
        <h1 className="font-bold">📦 Field Orders</h1>
        <div className="flex items-center gap-2 text-xs">
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 font-semibold text-amber-950">
              {pending.length} pending sync
            </span>
          )}
          <span
            data-testid="conn"
            className={`rounded-full px-2 py-0.5 font-semibold ${
              online ? "bg-emerald-400 text-emerald-950" : "bg-rose-400 text-rose-950"
            }`}
          >
            {online ? "online" : "offline"}
          </span>
        </div>
      </header>

      {toast && (
        <div className="mx-4 mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <section className="px-4 pt-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">NEW ORDER</h2>
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="Customer name"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <div className="grid grid-cols-2 gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-sky-50"
            >
              <p className="text-sm font-medium text-slate-800">{p.name}</p>
              <p className="text-xs text-slate-500">
                {p.sku} · ${p.price.toFixed(2)}
              </p>
            </button>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            {cart.map((l) => (
              <div key={l.product.id} className="flex justify-between py-1 text-sm">
                <span className="text-slate-700">
                  {l.product.name} × {l.quantity}
                </span>
                <span className="font-medium text-slate-800">
                  ${(l.quantity * l.product.price).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-bold">
              <span>Total</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={saveOrder}
              disabled={!customer}
              className="mt-3 w-full rounded-lg bg-sky-600 py-2.5 font-medium text-white disabled:opacity-40"
            >
              Save order {online ? "" : "(offline)"}
            </button>
          </div>
        )}
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">ORDERS</h2>
        <ul className="space-y-2">
          {pending.map((o) => (
            <li
              key={o.client_id}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              <div className="flex justify-between">
                <span className="font-medium text-slate-800">{o.customer}</span>
                <span className="text-xs font-semibold text-amber-700">⏳ waiting for sync</span>
              </div>
              <p className="text-xs text-slate-500">
                {o.items.length} item(s) · saved {new Date(o.created_offline_at).toLocaleTimeString()}
              </p>
            </li>
          ))}
          {synced.map((o) => (
            <li key={o.client_id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-slate-800">{o.customer}</span>
                <span className="text-xs font-semibold text-emerald-600">✓ synced</span>
              </div>
              <p className="text-xs text-slate-500">
                {o.items.length} item(s) · ${o.total.toFixed(2)}
              </p>
            </li>
          ))}
          {pending.length === 0 && synced.length === 0 && (
            <p className="text-sm text-slate-400">No orders yet — tap a product to start one.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
