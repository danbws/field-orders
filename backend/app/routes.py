from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .database import get_db
from .models import Order, OrderItem, Product
from .schemas import (
    OrderOut,
    ProductOut,
    RepSummary,
    SyncRequest,
    SyncResponse,
    SyncResultEntry,
)

router = APIRouter(prefix="/api", tags=["sync"])

SEED_PRODUCTS = [
    ("FAB-001", "Cotton Jersey 160g", 18.90),
    ("FAB-002", "Polyamide Stretch 220g", 31.50),
    ("FAB-003", "Viscose Twill 180g", 24.75),
    ("YRN-010", "Dyed Yarn 30/1", 42.00),
]


def seed_products(db: Session) -> None:
    """Populate the catalog once, at startup, so reads stay side-effect-free and
    /sync can price orders authoritatively. Idempotent: a no-op once seeded."""
    if db.scalar(select(Product).limit(1)) is not None:
        return
    db.add_all([Product(sku=s, name=n, price=p) for s, n, p in SEED_PRODUCTS])
    db.commit()


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    """Product catalog the device caches for offline browsing. Read-only:
    seeding happens at app startup (see app.main.lifespan), not here."""
    return db.scalars(select(Product).order_by(Product.sku)).all()


@router.get("/orders", response_model=list[OrderOut])
def list_orders(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Most-recently-synced orders first. Bounded so the open endpoint can't be
    made to materialize the whole table in one response."""
    return db.scalars(
        select(Order)
        .options(selectinload(Order.items))
        .order_by(Order.synced_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()


@router.get("/summary/by-rep", response_model=list[RepSummary])
def summary_by_rep(db: Session = Depends(get_db)):
    """Sales per field rep — order count and billed value, top seller first.

    The number a sales manager wants after a day in the field: who brought in
    what. Aggregated in Python so it reuses Order.total (which sums the items).
    """
    orders = db.scalars(select(Order).options(selectinload(Order.items))).all()
    buckets: dict[str, dict] = {}
    for o in orders:
        bucket = buckets.setdefault(o.rep_name, {"order_count": 0, "total": 0.0})
        bucket["order_count"] += 1
        bucket["total"] += o.total
    rows = [
        RepSummary(rep_name=name, order_count=b["order_count"], total=round(b["total"], 2))
        for name, b in buckets.items()
    ]
    rows.sort(key=lambda r: r.total, reverse=True)
    return rows


@router.post("/sync", response_model=SyncResponse)
def sync_orders(payload: SyncRequest, db: Session = Depends(get_db)):
    """Idempotent batch sync — the heart of offline-first.

    The device may retry a batch after a dropped connection without knowing
    whether the previous attempt landed. Orders whose client_id already exists
    are acknowledged as 'duplicate' (success from the device's point of view:
    it can safely clear them from the outbox), never inserted twice.

    Pricing is server-authoritative: the catalog is the source of truth. The
    client-sent unit_price/product_name are ignored and overwritten from the
    products table, so a rep can't fat-finger or discount a line. An order that
    references an unknown SKU is 'rejected' whole — nothing is persisted for it.
    """
    incoming_ids = [o.client_id for o in payload.orders]
    existing = set(
        db.scalars(select(Order.client_id).where(Order.client_id.in_(incoming_ids))).all()
    )
    catalog = {p.sku: p for p in db.scalars(select(Product)).all()}

    results: list[SyncResultEntry] = []
    for order_in in payload.orders:
        if order_in.client_id in existing:
            results.append(SyncResultEntry(client_id=order_in.client_id, result="duplicate"))
            continue

        unknown_sku = next(
            (i.product_sku for i in order_in.items if i.product_sku not in catalog), None
        )
        if unknown_sku is not None:
            results.append(
                SyncResultEntry(
                    client_id=order_in.client_id,
                    result="rejected",
                    reason=f"unknown_sku: {unknown_sku}",
                )
            )
            continue

        order = Order(
            client_id=order_in.client_id,
            customer=order_in.customer,
            rep_name=order_in.rep_name,
            created_offline_at=order_in.created_offline_at,
            items=[
                OrderItem(
                    product_sku=item.product_sku,
                    product_name=catalog[item.product_sku].name,  # server is source of truth
                    quantity=item.quantity,
                    unit_price=catalog[item.product_sku].price,  # ignore client-sent price
                )
                for item in order_in.items
            ],
        )
        db.add(order)
        existing.add(order_in.client_id)  # guard against duplicates inside the same batch
        results.append(SyncResultEntry(client_id=order_in.client_id, result="created"))

    db.commit()
    return SyncResponse(results=results)
