from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .database import get_db
from .models import Order, OrderItem, Product
from .schemas import OrderOut, ProductOut, SyncRequest, SyncResponse, SyncResultEntry

router = APIRouter(prefix="/api", tags=["sync"])

SEED_PRODUCTS = [
    ("FAB-001", "Cotton Jersey 160g", 18.90),
    ("FAB-002", "Polyamide Stretch 220g", 31.50),
    ("FAB-003", "Viscose Twill 180g", 24.75),
    ("YRN-010", "Dyed Yarn 30/1", 42.00),
]


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    """Product catalog the device caches for offline browsing."""
    products = db.scalars(select(Product).order_by(Product.sku)).all()
    if not products:  # auto-seed so the demo works out of the box
        products = [Product(sku=s, name=n, price=p) for s, n, p in SEED_PRODUCTS]
        db.add_all(products)
        db.commit()
    return products


@router.get("/orders", response_model=list[OrderOut])
def list_orders(db: Session = Depends(get_db)):
    return db.scalars(
        select(Order).options(selectinload(Order.items)).order_by(Order.synced_at.desc())
    ).all()


@router.post("/sync", response_model=SyncResponse)
def sync_orders(payload: SyncRequest, db: Session = Depends(get_db)):
    """Idempotent batch sync — the heart of offline-first.

    The device may retry a batch after a dropped connection without knowing
    whether the previous attempt landed. Orders whose client_id already exists
    are acknowledged as 'duplicate' (success from the device's point of view:
    it can safely clear them from the outbox), never inserted twice.
    """
    incoming_ids = [o.client_id for o in payload.orders]
    existing = set(
        db.scalars(select(Order.client_id).where(Order.client_id.in_(incoming_ids))).all()
    )

    results: list[SyncResultEntry] = []
    for order_in in payload.orders:
        if order_in.client_id in existing:
            results.append(SyncResultEntry(client_id=order_in.client_id, result="duplicate"))
            continue
        order = Order(
            client_id=order_in.client_id,
            customer=order_in.customer,
            rep_name=order_in.rep_name,
            created_offline_at=order_in.created_offline_at,
            items=[OrderItem(**item.model_dump()) for item in order_in.items],
        )
        db.add(order)
        existing.add(order_in.client_id)  # guard against duplicates inside the same batch
        results.append(SyncResultEntry(client_id=order_in.client_id, result="created"))

    db.commit()
    return SyncResponse(results=results)
