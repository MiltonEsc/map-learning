from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from api.routers import predict, history, routes, camera, navigate

app = FastAPI(
    title="TrafficVoice AI",
    description="Predicción de tráfico personalizada con ML y asistente de voz",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# En producción se leen desde ALLOWED_ORIGINS; en desarrollo acepta todo
_ORIGINS = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router)
app.include_router(history.router)
app.include_router(routes.router)
app.include_router(camera.router)
app.include_router(navigate.router)


@app.get("/health")
def health():
    from ml.traffic_model import models_ready
    return {
        "status": "ok",
        "env": settings.app_env,
        "models_ready": models_ready(),
    }
