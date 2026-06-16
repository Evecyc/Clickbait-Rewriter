from functools import lru_cache

from config import settings

CLICKBAIT_LABEL = "clickbait"
NON_CLICKBAIT_LABEL = "non_clickbait"

CLICKBAIT_KEYWORDS = [
    "驚", "震驚", "嚇傻", "傻眼", "曝光", "竟然",
    "真相", "原因", "內幕", "超狂", "慘了", "爆",
    "瘋傳", "網友", "必看", "你知道嗎", "揭密",
]


def mock_classify_title(title: str) -> dict:
    matched_keywords = [
        keyword for keyword in CLICKBAIT_KEYWORDS
        if keyword in title
    ]

    if not matched_keywords:
        return {
            "label": NON_CLICKBAIT_LABEL,
            "score": 0.18,
            "matchedKeywords": [],
            "mode": "mock",
        }

    return {
        "label": CLICKBAIT_LABEL,
        "score": min(0.55 + len(matched_keywords) * 0.12, 0.95),
        "matchedKeywords": matched_keywords,
        "mode": "mock",
    }


@lru_cache(maxsize=1)
def get_model_pipeline():
    from transformers import pipeline

    return pipeline(
        "text-classification",
        model=settings.classifier_model_name,
    )


def normalize_model_label(raw_label: str) -> str:
    label = raw_label.lower()

    if label in {"label_1", "1"}:
        return CLICKBAIT_LABEL

    if "clickbait" in label and "non" not in label:
        return CLICKBAIT_LABEL

    return NON_CLICKBAIT_LABEL


def to_clickbait_score(label: str, confidence: float) -> float:
    if label == CLICKBAIT_LABEL:
        return confidence

    return 1.0 - confidence


def model_classify_title(title: str) -> dict:
    classifier = get_model_pipeline()
    output = classifier(title, truncation=True)[0]

    raw_label = output.get("label", "")
    confidence = float(output.get("score", 0.0))
    label = normalize_model_label(raw_label)

    return {
        "label": label,
        "score": to_clickbait_score(label, confidence),
        "matchedKeywords": [],
        "mode": "model",
        "rawLabel": raw_label,
    }


def classify_title(title: str) -> dict:
    if settings.classifier_mode != "model":
        return mock_classify_title(title)

    try:
        return model_classify_title(title)
    except Exception as error:
        fallback = mock_classify_title(title)
        fallback["mode"] = "mock_fallback"
        fallback["error"] = str(error)
        return fallback


def classify_candidates(candidates: list) -> list[dict]:
    results = []

    for candidate in candidates:
        results.append({
            "id": candidate.id,
            "title": candidate.title,
            "url": candidate.url,
            "classification": classify_title(candidate.title),
        })

    return results