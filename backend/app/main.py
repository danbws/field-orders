from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Demo-friendly bootstrap; swap for Alembic migrations in real deployments.
    Base.metadata.create_all(engine)
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
