from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    price: Mapped[float] = mapped_column(Float)


class Order(Base):
    """An order captured in the field.

    `client_id` is generated ON THE DEVICE the moment the rep taps "save" —
    possibly with no connectivity at all. It is the idempotency key: the server
    treats a replayed client_id as "already have it", never as a new order.
    """

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    customer: Mapped[str] = mapped_column(String(120))
    rep_name: Mapped[str] = mapped_column(String(80))
    created_offline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    @property
    def total(self) -> float:
        return sum(i.quantity * i.unit_price for i in self.items)


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    product_sku: Mapped[str] = mapped_column(String(40))
    product_name: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)

    order: Mapped[Order] = relationship(back_populates="items")
