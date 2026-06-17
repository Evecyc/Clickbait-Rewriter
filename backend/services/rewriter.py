import json
import re
import time

from config import settings


MAX_ARTICLE_CHARS_FOR_REWRITE = 4000
GEMINI_MAX_RETRIES = 2
GEMINI_RETRY_DELAY_SECONDS = 2
MIN_REWRITE_LENGTH = 10

GENERIC_REWRITE_PHRASES = [
    "引發討論",
    "引發熱議",
    "店員解釋",
    "內行揭露",
    "內行揭密",
    "專家提醒",
    "背後真相",
    "原因曝光",
]


def clean_text(text: str | None) -> str:
    if not text:
        return ""

    return " ".join(text.split()).strip()


def build_rewrite_prompt(original_title: str, article_text: str) -> str:
    article_text = clean_text(article_text)[:MAX_ARTICLE_CHARS_FOR_REWRITE]

    return f"""
你是專業新聞編輯，請將提供的【原標題】改寫為中性、精確且資訊完整的標題，應保留可讀性與資訊吸引力，但不可製造懸念或隱藏關鍵答案。

### 核心要求
1. 直接破梗：若原標題隱藏關鍵資訊（如星座、數字、具體步驟），必須在標題中具體列出，不需點閱內文即可獲取核心解答。
2. 語氣中性：嚴禁使用「竟然、驚爆、內幕、崩潰、這招、這」等煽動性、懸疑或標題黨用語。
3. 結構要素：必須包含「主體」與「核心事件/結論」。
4. 忠於原文：禁止臆測或補充文中未提及的資訊。
5. 長度限制：15 至 30 個中文字。

### 參考範例
* 原標題：換個方法就能玩在一起！用這「3步驟」打造讓貓咪與狗狗和平共處的同居生活
* 改寫後：飼主透過熟悉氣味、視覺接觸與獎勵3步驟可讓貓狗和平共處

* 原標題：好運來了擋不住！「這星座」下半年財運爆棚，躺著也能賺大錢
* 改寫後：下半年雙子座財運提升，投資與副業收入有望增加

### 輸出格式
僅輸出 JSON 格式，不要包含任何開場白或額外文字：
{{"title": "改寫後標題"}}

---

【原標題】
{original_title}

【文章內容】
{article_text}
""".strip()


def parse_gemini_json_response(response_text: str) -> str:
    cleaned = clean_text(response_text)

    if cleaned.startswith("```json"):
        cleaned = cleaned.removeprefix("```json").removesuffix("```").strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```").removesuffix("```").strip()

    try:
        data = json.loads(cleaned)
        title = clean_text(data.get("title", ""))
        return title.strip("「」\"'")
    except json.JSONDecodeError:
        title_match = re.search(r'"title"\s*:\s*"([^"]+)"', cleaned)

        if title_match:
            return clean_text(title_match.group(1)).strip("「」\"'")

        object_match = re.search(r"\{.*?\}", cleaned)

        if object_match:
            data = json.loads(object_match.group(0))
            title = clean_text(data.get("title", ""))
            return title.strip("「」\"'")

        raise


def is_too_generic_rewrite(title: str) -> bool:
    return any(phrase in title for phrase in GENERIC_REWRITE_PHRASES)


def validate_rewritten_title(title: str) -> None:
    if not title:
        raise ValueError("Gemini returned an empty rewrite.")

    if len(title) < MIN_REWRITE_LENGTH:
        raise ValueError(f"Gemini rewrite is too short: {title}")

    if is_too_generic_rewrite(title):
        raise ValueError(f"Gemini rewrite is too generic: {title}")


def call_gemini(original_title: str, article_text: str) -> str:
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)

    response = client.models.generate_content(
        model=settings.gemini_model_name,
        contents=build_rewrite_prompt(
            original_title=original_title,
            article_text=article_text,
        ),
        config=types.GenerateContentConfig(
            temperature=0,
            max_output_tokens=128,
            response_mime_type="application/json",
        ),
    )

    rewritten_title = parse_gemini_json_response(response.text)
    validate_rewritten_title(rewritten_title)

    return rewritten_title


def should_retry_gemini_error(error: Exception) -> bool:
    message = str(error)

    if "429" in message or "RESOURCE_EXHAUSTED" in message:
        return False

    if "503" in message or "UNAVAILABLE" in message:
        return True

    return False


def gemini_rewrite_title(original_title: str, article_text: str) -> str:
    last_error = None

    for attempt in range(GEMINI_MAX_RETRIES + 1):
        try:
            return call_gemini(
                original_title=original_title,
                article_text=article_text,
            )
        except Exception as error:
            last_error = error

            if attempt < GEMINI_MAX_RETRIES and should_retry_gemini_error(error):
                time.sleep(GEMINI_RETRY_DELAY_SECONDS * (attempt + 1))
                continue

            break

    raise last_error


def rewrite_title(original_title: str, article_text: str) -> dict:
    try:
        rewritten_title = gemini_rewrite_title(
            original_title=original_title,
            article_text=article_text,
        )

        return {
            "originalTitle": original_title,
            "rewrittenTitle": rewritten_title,
            "mode": "gemini",
            "error": None,
        }

    except Exception as error:
        return {
            "originalTitle": original_title,
            "rewrittenTitle": "",
            "mode": "gemini_failed",
            "error": str(error),
        }