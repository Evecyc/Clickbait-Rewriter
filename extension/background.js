const API_BASE_URL = "http://127.0.0.1:8000";
const API_TIMEOUT_MS = 60000;

async function postJson(path, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${path} failed: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function classifyCandidates(candidates) {
  return postJson("/api/classify", { candidates });
}

function extractArticle(url) {
  return postJson("/api/extract", { url });
}

function sendErrorResponse(sendResponse, source, error) {
  console.error(`[Clickbait Rewriter] ${source} API error:`, error);

  sendResponse({
    status: "error",
    message: error.message
  });
}

function handleClassifyCandidates(message, sendResponse) {
  classifyCandidates(message.candidates || [])
    .then((data) => {
      sendResponse(data);
    })
    .catch((error) => {
      sendErrorResponse(sendResponse, "classify", error);
    });
}

function handleExtractArticle(message, sendResponse) {
  extractArticle(message.url)
    .then((data) => {
      sendResponse(data);
    })
    .catch((error) => {
      sendErrorResponse(sendResponse, "extract", error);
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "classifyCandidates") {
    handleClassifyCandidates(message, sendResponse);
    return true;
  }

  if (message.action === "extractArticle") {
    handleExtractArticle(message, sendResponse);
    return true;
  }

  return false;
});

console.log("[Clickbait Rewriter] background service worker loaded.");