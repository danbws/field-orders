import uuid


def order_payload(client_id=None, customer="Hanier Textiles"):
    return {
        "client_id": client_id or str(uuid.uuid4()),
        "customer": customer,
        "rep_name": "Daniel",
        "created_offline_at": "2026-06-12T09:30:00Z",
        "items": [
            {"product_sku": "FAB-001", "product_name": "Cotton Jersey 160g",
             "quantity": 120, "unit_price": 18.90},
        ],
    }


def test_products_are_seeded_for_offline_caching(client):
    products = client.get("/api/products").json()
    assert len(products) >= 4
    assert all("sku" in p and "price" in p for p in products)


def test_sync_creates_orders(client):
    batch = {"orders": [order_payload(), order_payload(customer="Zion Fabrics")]}
    resp = client.post("/api/sync", json=batch)
    assert resp.status_code == 200
    assert [r["result"] for r in resp.json()["results"]] == ["created", "created"]

    orders = client.get("/api/orders").json()
    assert len(orders) == 2
    assert orders[0]["total"] == 120 * 18.90


def test_replaying_a_batch_is_idempotent(client):
    """The device retries after a dropped connection — nothing may duplicate."""
    batch = {"orders": [order_payload()]}
    first = client.post("/api/sync", json=batch).json()
    second = client.post("/api/sync", json=batch).json()

    assert first["results"][0]["result"] == "created"
    assert second["results"][0]["result"] == "duplicate"
    assert len(client.get("/api/orders").json()) == 1


def test_duplicates_inside_one_batch_are_collapsed(client):
    """A buggy device could queue the same order twice; only one row lands."""
    order = order_payload()
    resp = client.post("/api/sync", json={"orders": [order, order]})
    results = [r["result"] for r in resp.json()["results"]]
    assert results == ["created", "duplicate"]
    assert len(client.get("/api/orders").json()) == 1


def test_partial_batch_with_known_and_new_orders(client):
    known = order_payload()
    client.post("/api/sync", json={"orders": [known]})

    new = order_payload(customer="Saltorelli Group")
    resp = client.post("/api/sync", json={"orders": [known, new]})
    by_id = {r["client_id"]: r["result"] for r in resp.json()["results"]}
    assert by_id[known["client_id"]] == "duplicate"
    assert by_id[new["client_id"]] == "created"
    assert len(client.get("/api/orders").json()) == 2
