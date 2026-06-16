from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class HeadlineCandidate(BaseModel):
    id: str
    title: str
    url: str
    candidateScore: int | float | None = None
    candidateReasons: list[str] = []


class ClassificationResult(BaseModel):
    label: str
    score: float
    matchedKeywords: list[str] = []


class ClassifiedHeadline(BaseModel):
    id: str
    title: str
    url: str
    classification: ClassificationResult


class ClassifyRequest(BaseModel):
    candidates: list[HeadlineCandidate]


class ClassifyResponse(BaseModel):
    status: str
    results: list[ClassifiedHeadline]