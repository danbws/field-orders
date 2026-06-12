export interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
}

export interface SyncedOrder {
  id: number;
  client_id: string;
  customer: string;
  rep_name: string;
  created_offline_at: string;
  synced_at: string;
  total: number;
  items: { product_sku: string; product_name: string; quantity: number; unit_price: number }[];
}

const PRODUCTS_CACHE = "field-orders-products";

/** Products come from the network when possible and from the local cache when
 * offline — the rep can keep building orders either way. */
export async function getProducts(): Promise<Product[]> {
  try {
    const resp = await fetch("/api/products");
    if (!resp.ok) throw new Error(String(resp.status));
    const products = (await resp.json()) as Product[];
    localStorage.setItem(PRODUCTS_CACHE, JSON.stringify(products));
    return products;
  } catch {
    return JSON.parse(localStorage.getItem(PRODUCTS_CACHE) ?? "[]");
  }
}

export async function getOrders(): Promise<SyncedOrder[]> {
  const resp = await fetch("/api/orders");
  if (!resp.ok) throw new Error(`Failed to load orders: ${resp.status}`);
  return resp.json();
}
