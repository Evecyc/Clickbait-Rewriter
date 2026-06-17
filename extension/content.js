const DEBUG_MODE = false;

const MAX_TITLE_CANDIDATES = 100;
const MIN_TITLE_LENGTH = 8;
const MAX_TITLE_LENGTH = 60;
const MIN_CANDIDATE_SCORE = 2;

const SCAN_DELAY_MS = 1000;
const SCAN_COOLDOWN_MS = 5000;
const MAX_AUTO_ARTICLE_EXTRACTIONS = 6;

const BLOCKED_TEXT_KEYWORDS = [
  "廣告", "AD", "Ad", "贊助", "工商",
  "登入", "會員", "訂閱", "分享", "留言",
  "看更多", "更多", "熱門", "影音", "直播",
  "服務條款", "隱私權", "關於我們"
];

const BLOCKED_URL_PATTERNS = [
  "/login", "/member", "/search", "/tag", "/tags",
  "/category", "/video", "/live", "/event", "/promo",
  "/topic/", "/topics/", "/author/", "/archive/",
  "ad.", "/ad", "adclick", "doubleclick", "googlesyndication"
];

let lastScanSignature = "";
let lastScanTime = 0;
let scanTimer = null;
let activeTooltipAnchor = null;

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function getCandidateId(title, url) {
  return `${title}::${url}`;
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function hasBlockedText(text) {
  return BLOCKED_TEXT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasBlockedUrl(url) {
  return BLOCKED_URL_PATTERNS.some((pattern) => url.includes(pattern));
}

function hasNearbyAdLabel(anchor) {
  const container = anchor.closest("li, article, section, div");
  if (!container) return false;

  const text = cleanText(container.textContent);
  return ["Ad", "廣告", "贊助", "工商"].some((keyword) => text.includes(keyword));
}

function getAnchorTitle(anchor) {
  const directText = cleanText(anchor.textContent);
  const titleElement = anchor.querySelector("h1, h2, h3, h4, .title, [class*='title']");
  const titleText = titleElement ? cleanText(titleElement.textContent) : "";

  if (titleText && titleText.length >= directText.length * 0.5) {
    return titleText;
  }

  return directText;
}

function getElementContext(element) {
  const parts = [];
  let current = element;

  for (let i = 0; i < 3 && current; i += 1) {
    const id = current.id ? `#${current.id}` : "";
    const className = typeof current.className === "string"
      ? `.${current.className.split(/\s+/).slice(0, 3).join(".")}`
      : "";

    parts.push(`${current.tagName.toLowerCase()}${id}${className}`);
    current = current.parentElement;
  }

  return parts.join(" > ").toLowerCase();
}

function scoreCandidate(anchor, url) {
  let score = 0;
  const reasons = [];
  const context = getElementContext(anchor);

  if (url.startsWith("http")) {
    score += 1;
    reasons.push("valid_url");
  }

  if (anchor.closest("main, article, h1, h2, h3")) {
    score += 2;
    reasons.push("semantic_area");
  }

  if (/news|article|story|read|html/.test(url)) {
    score += 2;
    reasons.push("article_like_url");
  }

  if (/ad|ads|sponsor|promo|banner|footer|header|nav|menu/.test(context)) {
    score -= 3;
    reasons.push("noisy_context");
  }

  return { score, reasons };
}

function buildCandidate(anchor) {
  const title = getAnchorTitle(anchor);
  const url = anchor.href || "";

  if (!title || !url) return null;
  if (!isVisible(anchor)) return null;
  if (title.length < MIN_TITLE_LENGTH || title.length > MAX_TITLE_LENGTH) return null;
  if (hasBlockedText(title) || hasBlockedUrl(url)) return null;
  if (anchor.closest("nav, header, footer")) return null;
  if (hasNearbyAdLabel(anchor)) return null;

  const { score, reasons } = scoreCandidate(anchor, url);
  if (score < MIN_CANDIDATE_SCORE) return null;

  return {
    id: getCandidateId(title, url),
    title,
    url,
    score,
    reasons,
    element: anchor
  };
}

function collectHeadlineCandidates() {
  const selectors = [
    "main a[href]",
    "article a[href]",
    "h1 a[href]",
    "h2 a[href]",
    "h3 a[href]",
    "a[href]"
  ];

  const anchors = Array.from(document.querySelectorAll(selectors.join(",")));
  const seen = new Set();
  const candidates = [];

  for (const anchor of anchors) {
    const candidate = buildCandidate(anchor);
    if (!candidate || seen.has(candidate.id)) continue;

    seen.add(candidate.id);
    candidates.push(candidate);
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, MAX_TITLE_CANDIDATES);
}

function sendMessage(action, payload) {
  return chrome.runtime.sendMessage({ action, ...payload });
}

function classifyCandidates(candidates) {
  const payload = candidates.map(({ id, title, url, score, reasons }) => ({
    id,
    title,
    url,
    candidateScore: score,
    candidateReasons: reasons
  }));

  return sendMessage("classifyCandidates", { candidates: payload });
}

function extractArticle(url) {
  return sendMessage("extractArticle", { url });
}

function rewriteHeadline(originalTitle, articleText) {
  return sendMessage("rewriteHeadline", {
    originalTitle,
    articleText
  });
}

function removeTooltip() {
  document.querySelectorAll(".cr-tooltip").forEach((tooltip) => tooltip.remove());
  activeTooltipAnchor = null;
}

function refreshTooltip(anchor) {
  if (activeTooltipAnchor !== anchor) return;

  const tooltip = document.querySelector(".cr-tooltip");
  if (tooltip) {
    tooltip.textContent = anchor.dataset.crTooltip || "";
  }
}

function getStatus(candidate) {
  if (candidate.articleStatus === "extracting") {
    return "Extracting article...";
  }

  if (candidate.articleStatus === "failed") {
    return "Article extraction failed";
  }

  if (candidate.articleStatus !== "success" || !candidate.article) {
    return "Waiting for article extraction...";
  }

  const textLength = candidate.article.textLength;

  if (candidate.rewriteStatus === "rewriting") {
    return `Article extracted, ${textLength} chars. Rewriting...`;
  }

  if (candidate.rewriteStatus === "success") {
    return "Rewrite completed";
  }

  if (candidate.rewriteStatus === "failed") {
    return "Rewrite unavailable";
  }

  return `Article extracted, ${textLength} chars. Waiting to rewrite...`;
}

function buildTooltip(candidate) {
  if (candidate.rewriteStatus === "success" && candidate.rewrite?.rewrittenTitle) {
    return [
      "Original:",
      candidate.title,
      "",
      "Rewritten:",
      candidate.rewrite.rewrittenTitle
    ].join("\n");
  }

  return [
    "Status:",
    getStatus(candidate)
  ].join("\n");
}

function updateTooltip(candidate) {
  candidate.element.dataset.crTooltip = buildTooltip(candidate);
  refreshTooltip(candidate.element);
}

function showTooltip(anchor) {
  removeTooltip();

  const candidate = anchor.__crCandidate;
  if (!candidate) return;

  startArticleExtraction(candidate);
  startRewrite(candidate);

  const tooltip = document.createElement("div");
  tooltip.className = "cr-tooltip";
  tooltip.textContent = anchor.dataset.crTooltip || "";

  const rect = anchor.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY + 6}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(tooltip);
  activeTooltipAnchor = anchor;
}

function bindTooltip(anchor, candidate) {
  anchor.__crCandidate = candidate;

  if (anchor.dataset.crTooltipBound === "true") return;

  anchor.addEventListener("mouseenter", () => showTooltip(anchor));
  anchor.addEventListener("mouseleave", removeTooltip);

  anchor.dataset.crTooltipBound = "true";
}

async function extractArticleAndUpdate(candidate) {
  if (candidate.articleStatus !== "idle") return;

  candidate.articleStatus = "extracting";
  updateTooltip(candidate);

  try {
    const response = await extractArticle(candidate.url);

    if (!response?.article?.success) {
      candidate.articleStatus = "failed";
      candidate.article = null;
      updateTooltip(candidate);
      return;
    }

    candidate.articleStatus = "success";
    candidate.article = response.article;
    updateTooltip(candidate);

    if (activeTooltipAnchor === candidate.element) {
      startRewrite(candidate);
    }
  } catch (error) {
    console.error("[Clickbait Rewriter] Article extraction error:", error);

    candidate.articleStatus = "failed";
    candidate.article = null;
    updateTooltip(candidate);
  }
}

function startArticleExtraction(candidate) {
  extractArticleAndUpdate(candidate);
}

async function rewriteAndUpdate(candidate) {
  if (candidate.rewriteStatus !== "idle") return;
  if (candidate.articleStatus !== "success" || !candidate.article?.text) return;

  candidate.rewriteStatus = "rewriting";
  updateTooltip(candidate);

  try {
    const response = await rewriteHeadline(candidate.title, candidate.article.text);
    const rewrite = response?.rewrite;

    if (!rewrite?.rewrittenTitle) {
      candidate.rewriteStatus = "failed";
      candidate.rewrite = rewrite || null;
      updateTooltip(candidate);
      return;
    }

    candidate.rewriteStatus = "success";
    candidate.rewrite = rewrite;
    updateTooltip(candidate);
  } catch (error) {
    console.error("[Clickbait Rewriter] Rewrite error:", error);

    candidate.rewriteStatus = "failed";
    candidate.rewrite = null;
    updateTooltip(candidate);
  }
}

function startRewrite(candidate) {
  rewriteAndUpdate(candidate);
}

async function extractTopArticles(candidates) {
  const targets = [...candidates]
    .sort((a, b) => b.classification.score - a.classification.score)
    .slice(0, MAX_AUTO_ARTICLE_EXTRACTIONS);

  for (const candidate of targets) {
    await extractArticleAndUpdate(candidate);
  }
}

function clearHighlights(candidates) {
  candidates.forEach((candidate) => {
    candidate.element.classList.remove("cr-clickbait-highlight");
    delete candidate.element.dataset.crTooltip;
    candidate.element.__crCandidate = null;
  });

  removeTooltip();
}

function applyClassificationResults(candidates, results) {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );

  const clickbaitCandidates = [];

  for (const result of results) {
    const candidate = candidateById.get(result.id);
    if (!candidate || result.classification.label !== "clickbait") continue;

    candidate.classification = result.classification;
    candidate.articleStatus = "idle";
    candidate.article = null;
    candidate.rewriteStatus = "idle";
    candidate.rewrite = null;

    candidate.element.classList.add("cr-clickbait-highlight");
    updateTooltip(candidate);
    bindTooltip(candidate.element, candidate);

    clickbaitCandidates.push(candidate);
  }

  return clickbaitCandidates;
}

function createScanSignature(candidates) {
  return candidates
    .map((candidate) => `${candidate.title}|${candidate.url}`)
    .sort()
    .join("||");
}

function shouldSkipScan(signature, now) {
  return (
    signature === lastScanSignature ||
    now - lastScanTime < SCAN_COOLDOWN_MS
  );
}

function logScan(candidates) {
  if (!DEBUG_MODE) return;

  console.group("[Clickbait Rewriter] Headline scan");
  console.log("Candidates:", candidates.length);
  console.table(
    candidates.map(({ title, score, reasons, url }) => ({
      title,
      score,
      reasons: reasons.join(", "),
      url
    }))
  );
  console.groupEnd();
}

async function classifyAndRender(candidates) {
  try {
    const response = await classifyCandidates(candidates);

    if (response?.status !== "ok") {
      console.warn("[Clickbait Rewriter] Classification failed:", response);
      return;
    }

    clearHighlights(candidates);
    const clickbaitCandidates = applyClassificationResults(candidates, response.results);
    extractTopArticles(clickbaitCandidates);
  } catch (error) {
    console.error("[Clickbait Rewriter] Classification error:", error);
  }
}

function runCandidateScan() {
  const now = Date.now();
  const candidates = collectHeadlineCandidates();
  const signature = createScanSignature(candidates);

  if (shouldSkipScan(signature, now)) return;

  lastScanSignature = signature;
  lastScanTime = now;

  logScan(candidates);
  classifyAndRender(candidates);
}

function scheduleCandidateScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(runCandidateScan, SCAN_DELAY_MS);
}

runCandidateScan();

const observer = new MutationObserver(scheduleCandidateScan);

observer.observe(document.body, {
  childList: true,
  subtree: true
});