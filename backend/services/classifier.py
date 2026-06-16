CLICKBAIT_KEYWORDS = [
    "驚", "震驚", "嚇傻", "傻眼", "曝光", "竟然",
    "真相", "原因", "內幕", "超狂", "慘了", "爆",
    "瘋傳", "網友", "必看", "你知道嗎", "揭密",
]


def classify_title(title: str) -> dict:
    matched_keywords = [
        keyword for keyword in CLICKBAIT_KEYWORDS
        if keyword in title
    ]

    if not matched_keywords:
        return {
            "label": "non_clickbait",
            "score": 0.18,
            "matchedKeywords": [],
        }

    score = min(0.55 + len(matched_keywords) * 0.12, 0.95)

    return {
        "label": "clickbait",
        "score": score,
        "matchedKeywords": matched_keywords,
    }


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