from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # OpenAI
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    openai_whisper_model: str = Field(default="whisper-1", alias="OPENAI_WHISPER_MODEL")

    # Google Maps
    google_maps_api_key: str = Field(default="", alias="GOOGLE_MAPS_API_KEY")
    google_maps_base_url: str = Field(
        default="https://routes.googleapis.com/directions/v2:computeRoutes",
        alias="GOOGLE_MAPS_BASE_URL",
    )

    # OpenWeatherMap
    openweather_api_key: str = Field(default="", alias="OPENWEATHER_API_KEY")
    openweather_base_url: str = Field(
        default="https://api.openweathermap.org/data/2.5",
        alias="OPENWEATHER_BASE_URL",
    )

    # Database
    database_url: str = Field(
        default="sqlite:///./data/traffic_assistant.db", alias="DATABASE_URL"
    )

    # Application
    app_env: str = Field(default="development", alias="APP_ENV")
    # CORS: lista separada por comas. Ej: "https://mi-app.vercel.app,http://localhost:3000"
    # Dejar vacío para desarrollo (acepta todo)
    allowed_origins: str = Field(default="", alias="ALLOWED_ORIGINS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    tz: str = Field(default="America/Bogota", alias="TZ")

    # Scheduling
    traffic_poll_interval_minutes: int = Field(default=10, alias="TRAFFIC_POLL_INTERVAL_MINUTES")
    weather_poll_interval_minutes: int = Field(default=15, alias="WEATHER_POLL_INTERVAL_MINUTES")
    model_retrain_day: str = Field(default="sunday", alias="MODEL_RETRAIN_DAY")
    model_retrain_hour: int = Field(default=2, alias="MODEL_RETRAIN_HOUR")

    # ML
    models_dir: str = Field(default="./models_saved", alias="MODELS_DIR")
    min_training_rows: int = Field(default=500, alias="MIN_TRAINING_ROWS")
    prediction_horizon_minutes: int = Field(default=60, alias="PREDICTION_HORIZON_MINUTES")

    # Camera
    camera_source: str = Field(default="0", alias="CAMERA_SOURCE")
    camera_fps: int = Field(default=5, alias="CAMERA_FPS")
    yolo_confidence_threshold: float = Field(default=0.45, alias="YOLO_CONFIDENCE_THRESHOLD")
    yolo_model_size: str = Field(default="yolov8n", alias="YOLO_MODEL_SIZE")

    # Voice
    mic_device_index: int = Field(default=-1, alias="MIC_DEVICE_INDEX")  # -1 = sistema por defecto
    whisper_model_size: str = Field(default="base", alias="WHISPER_MODEL_SIZE")
    tts_engine: str = Field(default="pyttsx3", alias="TTS_ENGINE")
    tts_voice_rate: int = Field(default=175, alias="TTS_VOICE_RATE")
    tts_voice_lang: str = Field(default="es", alias="TTS_VOICE_LANG")

    # Alertas
    alert_delay_threshold_minutes: int = Field(default=10, alias="ALERT_DELAY_THRESHOLD_MINUTES")
    alert_advance_notice_minutes: int = Field(default=30, alias="ALERT_ADVANCE_NOTICE_MINUTES")


settings = Settings()
