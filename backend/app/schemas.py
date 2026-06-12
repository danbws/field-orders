from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    price: float


class ItemIn(BaseModel):
    product_sku: str
    product_name: str
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class OrderIn(BaseModel):
    client_id: str = Field(min_length=36, max_length=36)  # UUID minted on the device
    customer: str = Field(min_length=1, max_length=120)
    rep_name: str = Field(min_length=1, max_length=80)
    created_offline_at: datetime
    items: list[ItemIn] = Field(min_length=1)


class SyncRequest(BaseModel):
    orders: list[OrderIn] = Field(min_length=1)


class SyncResultEntry(BaseModel):
    client_id: str
    result: Literal["created", "duplicate"]


class SyncResponse(BaseModel):
    results: list[SyncResultEntry]


class ItemOut(ItemIn):
    model_config = ConfigDict(from_attributes=True)


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: str
    customer: str
    rep_name: str
    created_offline_at: datetime
    synced_at: datetime
    items: list[ItemOut]
    total: float
