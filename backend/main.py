from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    HealthResponse,
    ClassifyRequest,
    ClassifyResponse,
    ClassifiedHeadline,
    ClassificationResult,
    ExtractRequest,
    ExtractResponse,
    ExtractedArticle,
    RewriteRequest,
    RewriteResponse,
    RewriteResult,
)
from services.classifier import classify_candidates
from services.article_extractor import extract_article
from services.rewriter import rewrite_title

app = FastAPI(title="Clickbait Rewriter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_classify_response(raw_results: list[dict]) -> ClassifyResponse:
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


def build_extract_response(raw_article: dict) -> ExtractResponse:
    return ExtractResponse(
        status="ok",
        article=ExtractedArticle(**raw_article),
    )

def build_rewrite_response(raw_rewrite: dict) -> RewriteResponse:
    return RewriteResponse(
        status="ok",
        rewrite=RewriteResult(**raw_rewrite),
    )

@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="clickbait-rewriter-api",
    )


@app.post("/api/classify", response_model=ClassifyResponse)
def classify_headlines(request: ClassifyRequest) -> ClassifyResponse:
    raw_results = classify_candidates(request.candidates)
    return build_classify_response(raw_results)


@app.post("/api/extract", response_model=ExtractResponse)
def extract_article_content(request: ExtractRequest) -> ExtractResponse:
    raw_article = extract_article(request.url)
    return build_extract_response(raw_article)

@app.post("/api/rewrite", response_model=RewriteResponse)
def rewrite_headline(request: RewriteRequest) -> RewriteResponse:
    raw_rewrite = rewrite_title(
        original_title=request.originalTitle,
        article_text=request.articleText,
    )
    return build_rewrite_response(raw_rewrite)