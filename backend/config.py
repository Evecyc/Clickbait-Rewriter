import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    gemini_model_name: str = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash-lite")

    clickbait_threshold: float = float(os.getenv("CLICKBAIT_THRESHOLD", "0.7"))
    max_candidates: int = int(os.getenv("MAX_CANDIDATES", "100"))
    max_rewrites: int = int(os.getenv("MAX_REWRITES", "5"))

    classifier_mode: str = os.getenv("CLASSIFIER_MODE", "mock")
    classifier_model_name: str = os.getenv(
        "CLASSIFIER_MODEL_NAME",
        "Stremie/xlm-roberta-base-clickbait",
    )


settings = Settings()