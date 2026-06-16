const API_BASE_URL = "http://127.0.0.1:8000";

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }

  return response.json();
}

function classifyCandidates(candidates) {
  return postJson("/api/classify", { candidates });
}

function handleClassifyCandidates(message, sendResponse) {
  classifyCandidates(message.candidates || [])
    .then((data) => {
      sendResponse(data);
    })
    .catch((error) => {
      console.error("[Clickbait Rewriter] classify API error:", error);

      sendResponse({
        status: "error",
        results: [],
        message: error.message
      });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "classifyCandidates") {
    handleClassifyCandidates(message, sendResponse);
    return true;
  }

  return false;
});

console.log("[Clickbait Rewriter] background service worker loaded.");