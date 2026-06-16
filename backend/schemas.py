from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class HeadlineCandidate(BaseModel):
    id: str
    title: str
    url: str
    candidateScore: float | None = None
    candidateReasons: list[str] = Field(default_factory=list)


class ClassificationResult(BaseModel):
    label: str
    score: float
    matchedKeywords: list[str] = Field(default_factory=list)
    mode: str | None = None
    rawLabel: str | None = None
    error: str | None = None


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