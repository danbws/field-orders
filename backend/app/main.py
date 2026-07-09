from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, get_db
from .routes import router, seed_products


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Demo-friendly bootstrap; swap for Alembic migrations in real deployments.
    Base.metadata.create_all(engine)
    # Seed the catalog once at startup so GET /products stays side-effect-free.
    # Resolve the DB session through the (possibly overridden) get_db dependency
    # so tests seed their own database rather than the real engine.
    db_factory = app.dependency_overrides.get(get_db, get_db)
    db_gen = db_factory()
    db = next(db_gen)
    try:
        seed_products(db)
    finally:
        db_gen.close()
    yield


app = FastAPI(
    title="Field Orders API",
    description=(
        "Sync backend for an offline-first field sales app. Orders are created "
        "on the device (client-generated UUIDs), queued in a local outbox, and "
        "pushed here in batches. The sync endpoint is idempotent: replaying a "
        "batch after a dropped connection can never create duplicates."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
