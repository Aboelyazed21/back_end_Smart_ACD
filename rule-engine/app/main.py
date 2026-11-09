from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import ENGINE_VERSION
from .api.routes import router
from .config import get_settings
from .data import get_data
from .rag.store import store

logging.basicConfig(
    level=getattr(logging, get_settings().log_level.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    stream=sys.stdout,
)
logger = logging.getLogger("rule-engine")


@asynccontextmanager
async def lifespan(app: FastAPI):
    data = get_data()
    logger.info(
        "loaded regulation data: %s courses, %s anomalies, %s rules",
        len(data.courses),
        len(data.anomalies),
        len(data.rules),
    )
    if get_settings().policy_ingest_on_start:
        try:
            store.load()
            logger.info("policy store ready: %s chunks", store.chunk_count)
        except Exception as exc:  # pragma: no cover
            logger.warning("policy store not ready: %s", exc)
    yield


app = FastAPI(
    title="Smart Academic Advisor - Rule Engine",
    version=ENGINE_VERSION,
    description=(
        "Internal, advisory-only rule engine for the AIDM 2023 bylaws. "
        "Every decision returns rule_code, article, page and anomaly_ids. "
        "Plans are always DRAFT and never register courses."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": [
                    {"loc": list(err.get("loc", [])), "msg": err.get("msg", ""), "type": err.get("type", "")}
                    for err in exc.errors()
                ],
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled engine error: %s", type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal engine error", "details": {}}},
    )
