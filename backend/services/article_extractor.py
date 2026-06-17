import re
import urllib3

import requests
import trafilatura
from bs4 import BeautifulSoup
from readability import Document
from requests.exceptions import SSLError


REQUEST_TIMEOUT_SECONDS = 15
MIN_ARTICLE_TEXT_LENGTH = 300
RELATED_READING_END_RATIO = 0.7

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    )
}

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

END_BLOCK_PATTERNS = [
    r"其他人也在看.*$",
    r"更多相關新聞.*$",
    r"相關新聞.*$",
    r"熱門新聞.*$",
    r"推薦閱讀.*$",
    r"精華\s*FAQ.*$",
    r"訂閱.*?(YouTube|頻道).*$",
    r".*Google\s*News.*$",
    r"追新聞.*$",
    r"檢視留言.*$",
    r"資料來源：.*$",
    r"喜歡本文請按讚.*$",
    r"更多.{0,30}報導.*$",
]

PREFIX_BLOCK_PATTERNS = [
    r"^AI重點\s*文章重點整理：\s*(?:-\s*重點[一二三四五六七八九十]+：.*?。?\s*)+",
]

RELATED_READING_KEYWORDS = [
    "👉延伸閱讀",
    "【延伸閱讀】",
    "延伸閱讀》",
    "延伸閱讀〉",
    "延伸閱讀",
]

NOISE_PATTERNS = [
    r"【[^】]{1,20}／[^】]{1,20}】",
    r"\bYT\s*[:：]\s*https?://\S+",
    r"\bFb\s*[:：]\s*https?://\S+",
    r"\bIG\s*[:：]\s*https?://\S+",
    r"\bFB\s*[:：]\s*https?://\S+",
    r"\bYouTube\s*[:：]\s*https?://\S+",
    r"\bFacebook\s*[:：]\s*https?://\S+",
    r"\bInstagram\s*[:：]\s*https?://\S+",
    r"https?://\S+",
]


def fetch_html(url: str) -> str:
    try:
        response = requests.get(
            url,
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.text

    except SSLError:
        response = requests.get(
            url,
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS,
            verify=False,
        )
        response.raise_for_status()
        return response.text


def clean_text(text: str | None) -> str:
    if not text:
        return ""

    return " ".join(text.split()).strip()


def get_html_title(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    og_title = soup.select_one("meta[property='og:title']")
    if og_title and og_title.get("content"):
        return clean_text(og_title["content"])

    if soup.title and soup.title.text:
        return clean_text(soup.title.text)

    return ""


def apply_patterns(text: str, patterns: list[str], replacement: str = " ") -> str:
    cleaned = text

    for pattern in patterns:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    return clean_text(cleaned)


def remove_prefix_blocks(text: str) -> str:
    return apply_patterns(text, PREFIX_BLOCK_PATTERNS)


def remove_end_blocks(text: str) -> str:
    cleaned = text

    for pattern in END_BLOCK_PATTERNS:
        match = re.search(pattern, cleaned, flags=re.IGNORECASE)
        if match:
            cleaned = cleaned[:match.start()]

    return clean_text(cleaned)


def build_inline_related_pattern(keyword: str) -> str:
    return (
        rf"{re.escape(keyword)}"
        r".*?"
        r"(?="
        r"[一二三四五六七八九十]+、"
        r"|[。！？]\s*[一二三四五六七八九十]+、"
        r"|其他人也在看"
        r"|更多相關新聞"
        r"|相關新聞"
        r"|熱門新聞"
        r"|推薦閱讀"
        r"|資料來源："
        r"|$"
        r")"
    )


def remove_related_reading_sections(text: str) -> str:
    cleaned = text

    for keyword in RELATED_READING_KEYWORDS:
        index = cleaned.find(keyword)
        if index == -1:
            continue

        position_ratio = index / max(len(cleaned), 1)

        if position_ratio > RELATED_READING_END_RATIO:
            cleaned = cleaned[:index]
        else:
            pattern = build_inline_related_pattern(keyword)
            cleaned = re.sub(pattern, " ", cleaned)

    return clean_text(cleaned)


def remove_common_noise(text: str) -> str:
    return apply_patterns(text, NOISE_PATTERNS)


def remove_duplicate_title_prefix(title: str, text: str) -> str:
    if not title:
        return text

    cleaned_title = clean_text(title)
    cleaned_text = clean_text(text)

    if cleaned_text.startswith(cleaned_title):
        cleaned_text = cleaned_text[len(cleaned_title):]

    return clean_text(cleaned_text)


def postprocess_article_text(text: str, title: str = "") -> str:
    text = clean_text(text)
    text = remove_prefix_blocks(text)
    text = remove_end_blocks(text)
    text = remove_related_reading_sections(text)
    text = remove_common_noise(text)
    text = remove_duplicate_title_prefix(title, text)

    return text


def extract_with_trafilatura(html: str, title: str) -> dict:
    text = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
    )

    return {
        "title": "",
        "text": postprocess_article_text(text, title),
        "method": "trafilatura",
    }


def extract_with_readability(html: str, title: str) -> dict:
    document = Document(html)
    extracted_title = clean_text(document.short_title())
    summary_html = document.summary()

    soup = BeautifulSoup(summary_html, "html.parser")
    text = soup.get_text(" ")

    return {
        "title": extracted_title,
        "text": postprocess_article_text(text, title),
        "method": "readability",
    }


def extract_article(url: str) -> dict:
    try:
        html = fetch_html(url)
        fallback_title = get_html_title(html)

        result = extract_with_trafilatura(html, fallback_title)

        if len(result["text"]) < MIN_ARTICLE_TEXT_LENGTH:
            result = extract_with_readability(html, fallback_title)

        title = result["title"] or fallback_title
        success = len(result["text"]) >= MIN_ARTICLE_TEXT_LENGTH

        return {
            "url": url,
            "success": success,
            "title": title,
            "text": result["text"],
            "textLength": len(result["text"]),
            "method": result["method"],
            "error": None,
        }

    except Exception as error:
        return {
            "url": url,
            "success": False,
            "title": "",
            "text": "",
            "textLength": 0,
            "method": "none",
            "error": str(error),
        }