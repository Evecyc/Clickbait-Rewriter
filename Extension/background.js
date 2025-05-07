let failedJobs = []; // 儲存失敗的標題與嘗試次數

// 接收 content.js 的訊息（分類標題）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "classify") {
    const titles = request.titles;

    // 發送到本機後端 /classify API
    fetch("http://localhost:5000/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles })
    })
      .then(response => response.json())
      .then(data => {
        const success = [];

        for (const item of data.clickbait) {
          if (item.new_title.startsWith("Fail")) {
            // 如果標題生成失敗，加入失敗任務佇列
            failedJobs.push({ text: item.text, url: item.url, tries: 1 });
          } else {
            success.push(item); // 成功的收集起來回傳給前端
          }
        }

        sendResponse({ clickbait: success });
        scheduleRetry(); // 啟動重試機制
      })
      .catch(err => {
        console.error("Initial classify error:", err);
        sendResponse({ clickbait: [] });
      });

    return true; // 讓 sendResponse 可在 async 中使用
  }
});

function scheduleRetry() {
  if (failedJobs.length === 0) return;

  const job = failedJobs.shift();
  if (job.tries >= 3) return;

  setTimeout(() => {
    fetch("http://localhost:5000/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: job.text, url: job.url })
    })
      .then(res => res.json())
      .then(result => {
        if (result.new_title && !result.new_title.startsWith("Fail")) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "updateTitle",
              payload: {
                text: job.text,
                new_title: result.new_title,
                url: job.url
              }
            });
          });
        } else {
          failedJobs.push({ ...job, tries: job.tries + 1 });
          scheduleRetry();
        }
      })
      .catch(err => {
        console.error("Retry error:", err);
        failedJobs.push({ ...job, tries: job.tries + 1 });
        scheduleRetry();
      });
  }, 2000);
}