from fastapi import FastAPI
from schemas import HealthResponse

app = FastAPI(title="Clickbait Rewriter API")


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="clickbait-rewriter-api")