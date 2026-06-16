const MAX_CANDIDATES = 60;
const MIN_TITLE_LENGTH = 8;
const MAX_TITLE_LENGTH = 60;
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

let lastScanSignature = "";
let lastScanTime = 0;
let scanTimer = null;

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
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
  const title = cleanText(anchor.textContent || "");
  const url = anchor.href;

  if (shouldRejectCandidate(anchor, title, url)) {
    return null;
  }

  const { score, reasons } = scoreCandidate(anchor, url);

  if (score < 2) {
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
    candidates: candidates.slice(0, MAX_CANDIDATES)
  };
}

function markDebugCandidates(candidates) {
  document.querySelectorAll(".cr-debug-candidate").forEach((element) => {
    element.classList.remove("cr-debug-candidate");
  });

  candidates.forEach((candidate) => {
    candidate.element.classList.add("cr-debug-candidate");
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

  logScanResult(result);
  markDebugCandidates(result.candidates);
}

function scheduleCandidateScan() {
  if (scanTimer) {
    clearTimeout(scanTimer);
  }

  scanTimer = setTimeout(() => {
    runCandidateScan();
  }, SCAN_DELAY_MS);
}

runCandidateScan();

const observer = new MutationObserver(() => {
  scheduleCandidateScan();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});