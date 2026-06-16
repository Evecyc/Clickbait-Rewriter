const MAX_TITLE_CANDIDATES = 200;
const MIN_TITLE_LENGTH = 8;
const MAX_TITLE_LENGTH = 60;
const MIN_CANDIDATE_SCORE = 2;

const SCAN_DELAY_MS = 1000;
const SCAN_COOLDOWN_MS = 5000;

const BLOCKED_TEXT_KEYWORDS = [
  "廣告", "AD", "Ad", "贊助", "工商",
  "登入", "會員", "訂閱", "分享", "留言",
  "看更多", "更多", "熱門", "影音", "直播",
  "服務條款", "隱私權", "關於我們"
];

const BLOCKED_URL_PATTERNS = [
  "/login", "/member", "/search", "/tag", "/tags",
  "/category", "/video", "/live", "/event", "/promo",
  "/topic/", "/topics/", "/author/", "/archive/"
];

const CLICKBAIT_KEYWORDS = [
  "驚", "震驚", "嚇傻", "傻眼", "曝光", "竟然",
  "真相", "原因", "內幕", "超狂", "慘了", "爆",
  "瘋傳", "網友", "必看", "你知道嗎", "揭密"
];

let lastScanSignature = "";
let lastScanTime = 0;
let scanTimer = null;

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getAnchorTitle(anchor) {
  const directText = cleanText(anchor.textContent || "");
  const titleElement = anchor.querySelector("h1, h2, h3, h4, .title, [class*='title']");
  const titleText = titleElement ? cleanText(titleElement.textContent || "") : "";

  if (titleText && titleText.length >= directText.length * 0.5) {
    return titleText;
  }

  return directText;
}

function hasBlockedText(text) {
  return BLOCKED_TEXT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasBlockedUrl(url) {
  return BLOCKED_URL_PATTERNS.some((pattern) => url.includes(pattern));
}

function isValidTitleLength(title) {
  return title.length >= MIN_TITLE_LENGTH && title.length <= MAX_TITLE_LENGTH;
}

function isVisibleElement(element) {
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

function shouldRejectCandidate(anchor, title, url) {
  if (!title || !url) return true;
  if (!isVisibleElement(anchor)) return true;
  if (!isValidTitleLength(title)) return true;
  if (hasBlockedText(title)) return true;
  if (hasBlockedUrl(url)) return true;
  if (anchor.closest("nav, header, footer")) return true;

  return false;
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
  const url = anchor.href;

  if (shouldRejectCandidate(anchor, title, url)) {
    return null;
  }

  const { score, reasons } = scoreCandidate(anchor, url);

  if (score < MIN_CANDIDATE_SCORE) {
    return null;
  }

  return {
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
  let excluded = 0;

  for (const anchor of anchors) {
    const candidate = buildCandidate(anchor);

    if (!candidate) {
      excluded += 1;
      continue;
    }

    const key = `${candidate.title}::${candidate.url}`;
    if (seen.has(key)) {
      excluded += 1;
      continue;
    }

    seen.add(key);
    candidates.push(candidate);
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    scanned: anchors.length,
    excluded,
    candidates: candidates.slice(0, MAX_TITLE_CANDIDATES)
  };
}

function mockClassifyTitle(title) {
  const matchedKeywords = CLICKBAIT_KEYWORDS.filter((keyword) =>
    title.includes(keyword)
  );

  if (matchedKeywords.length === 0) {
    return {
      label: "non_clickbait",
      score: 0.18,
      matchedKeywords
    };
  }

  return {
    label: "clickbait",
    score: Math.min(0.55 + matchedKeywords.length * 0.12, 0.95),
    matchedKeywords
  };
}

function removeTooltip() {
  document.querySelectorAll(".cr-tooltip").forEach((tooltip) => {
    tooltip.remove();
  });
}

function showTooltip(anchor) {
  removeTooltip();

  const text = anchor.dataset.crTooltip;
  if (!text) return;

  const tooltip = document.createElement("div");
  tooltip.className = "cr-tooltip";
  tooltip.textContent = text;

  const rect = anchor.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY + 6}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(tooltip);
}

function bindTooltip(anchor) {
  if (anchor.dataset.crTooltipBound === "true") return;

  anchor.addEventListener("mouseenter", () => showTooltip(anchor));
  anchor.addEventListener("mouseleave", removeTooltip);

  anchor.dataset.crTooltipBound = "true";
}

function clearScanStyles() {
  document.querySelectorAll(".cr-debug-candidate").forEach((element) => {
    element.classList.remove("cr-debug-candidate");
  });

  document.querySelectorAll(".cr-clickbait-highlight").forEach((element) => {
    element.classList.remove("cr-clickbait-highlight");
    delete element.dataset.crTooltip;
  });

  removeTooltip();
}

function applyDebugCandidates(candidates) {
  candidates.forEach((candidate) => {
    candidate.element.classList.add("cr-debug-candidate");
  });
}

function applyMockClassification(candidates) {
  candidates.forEach((candidate) => {
    const result = mockClassifyTitle(candidate.title);

    if (result.label !== "clickbait") {
      return;
    }

    const tooltipText = [
      `Original: ${candidate.title}`,
      `Mock label: ${result.label}`,
      `Mock score: ${result.score.toFixed(2)}`,
      `Matched: ${result.matchedKeywords.join(", ") || "none"}`,
      "Rewrite status: not implemented yet"
    ].join("\n");

    candidate.element.classList.add("cr-clickbait-highlight");
    candidate.element.dataset.crTooltip = tooltipText;
    bindTooltip(candidate.element);
  });
}

function createScanSignature(candidates) {
  return candidates
    .map((candidate) => `${candidate.title}|${candidate.url}`)
    .sort()
    .join("||");
}

function logScanResult(result) {
  console.group("[Clickbait Rewriter] Headline candidate scan");
  console.log("Scanned links:", result.scanned);
  console.log("Candidate headlines:", result.candidates.length);
  console.log("Excluded links:", result.excluded);
  console.table(
    result.candidates.map(({ title, url, score, reasons }) => ({
      title,
      score,
      reasons: reasons.join(", "),
      url
    }))
  );
  console.groupEnd();
}

function runCandidateScan() {
  const now = Date.now();
  const result = collectHeadlineCandidates();
  const signature = createScanSignature(result.candidates);

  const isSameScan = signature === lastScanSignature;
  const isWithinCooldown = now - lastScanTime < SCAN_COOLDOWN_MS;

  if (isSameScan || isWithinCooldown) {
    return;
  }

  lastScanSignature = signature;
  lastScanTime = now;

  clearScanStyles();
  logScanResult(result);
  applyDebugCandidates(result.candidates);
  applyMockClassification(result.candidates);
}

function scheduleCandidateScan() {
  if (scanTimer) {
    clearTimeout(scanTimer);
  }

  scanTimer = setTimeout(runCandidateScan, SCAN_DELAY_MS);
}

runCandidateScan();

const observer = new MutationObserver(scheduleCandidateScan);

observer.observe(document.body, {
  childList: true,
  subtree: true
});