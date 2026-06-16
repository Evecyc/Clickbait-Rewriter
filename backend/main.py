from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    HealthResponse,
    ClassifyRequest,
    ClassifyResponse,
    ClassifiedHeadline,
    ClassificationResult,
)
from services.classifier import classify_candidates

app = FastAPI(title="Clickbait Rewriter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="clickbait-rewriter-api")


@app.post("/api/classify", response_model=ClassifyResponse)
def classify_headlines(request: ClassifyRequest) -> ClassifyResponse:
    raw_results = classify_candidates(request.candidates)

    results = [
        ClassifiedHeadline(
            id=item["id"],
            title=item["title"],
            url=item["url"],
            classification=ClassificationResult(**item["classification"]),
        )
        for item in raw_results
    ]

    return ClassifyResponse(status="ok", results=results)