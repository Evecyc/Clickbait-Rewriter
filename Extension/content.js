const processedUrls = new Set(); // 記錄已處理的標題，避免重複標記

// 收集可能的新聞標題，只抓取 <a> 內的內容
function collectTitles() {
  return Array.from(
    document.querySelectorAll(
      "a[href^='/article'], a[href^='https://'], a[href^='/news/'], a[href^='./read/']"
    )
  )
    .map(element => ({ title: element.textContent.trim(), url: element.href }))
    .filter(item => {
      if (
        item.title.length > 5 &&    // 標題夠長
        item.url &&                 // URL 存在
        !processedUrls.has(item.url) // 還沒處理過
      ) {
        processedUrls.add(item.url);  // 標記已處理
        return true;
      }
      return false;
    });
}

// 修改回傳的點擊誘餌標題
const modifyClickbait = (titles) => {
  document.querySelectorAll("a[href^='/article'], a[href^='https://'], a[href^='/news/'], a[href^='./read/']").forEach((element) => {
    titles.forEach((title) => {
      if (element.textContent.includes(title.text)) {
        element.style.backgroundColor = "rgba(237, 229, 13, 0.45)";   // 標記點擊誘餌標題
        element.removeAttribute("title");
        element.addEventListener("mouseenter", (e) => {   // 為連結新增滑鼠進入與離開事件
          const tooltip = document.createElement("div");
          tooltip.className = "custom-tooltip";
          tooltip.style.whiteSpace = "pre-wrap";
          tooltip.textContent = "原標題｜" + title.text + "\n新標題｜" + title.new_title;
          tooltip.style.position = "absolute";
          tooltip.style.backgroundColor = "#fff";
          tooltip.style.border = "1px solid #ccc";
          tooltip.style.padding = "5px";
          tooltip.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.3)";
          tooltip.style.zIndex = 10000;
          tooltip.style.fontSize = "14px";
          tooltip.style.transition = "opacity 0.3s";
          
          const rect = e.target.getBoundingClientRect();  // 根據連結位置定位 tooltip
          tooltip.style.top = rect.bottom + window.scrollY + "px";
          tooltip.style.left = rect.left + window.scrollX + "px";
          
          document.body.appendChild(tooltip);   // 加入 tooltip 至文件中
          element.addEventListener("mouseleave", () => {    // 在離開時移除 tooltip
            tooltip.remove();
          }, { once: true });
        });
      }
    });
  });
};

// 處理 background.js 重試成功後回傳的結果
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateTitle") {
    const title = message.payload;

    document.querySelectorAll("a[href^='/article'], a[href^='https://'], a[href^='/news/'], a[href^='./read/']").forEach((element) => {
      if (element.href === title.url && element.textContent.includes(title.text)) {
        element.style.backgroundColor = "rgba(237, 229, 13, 0.45)";
        element.removeAttribute("title");

        element.addEventListener("mouseenter", (e) => {
          const tooltip = document.createElement("div");
          tooltip.className = "custom-tooltip";
          tooltip.style.whiteSpace = "pre-wrap";
          tooltip.textContent = "原標題｜" + title.text + "\n新標題｜" + title.new_title;
          tooltip.style.position = "absolute";
          tooltip.style.backgroundColor = "#fff";
          tooltip.style.border = "1px solid #ccc";
          tooltip.style.padding = "5px";
          tooltip.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.3)";
          tooltip.style.zIndex = 10000;
          tooltip.style.fontSize = "14px";
          tooltip.style.transition = "opacity 0.3s";

          const rect = e.target.getBoundingClientRect();
          tooltip.style.top = rect.bottom + window.scrollY + "px";
          tooltip.style.left = rect.left + window.scrollX + "px";

          document.body.appendChild(tooltip);
          element.addEventListener("mouseleave", () => {
            tooltip.remove();
          }, { once: true });
        });
      }
    });
  }
});

// 發送請求到後端 API
const classifyTitles = (titles) => {
  if (titles.length === 0) return; // 避免發送空請求
  chrome.runtime.sendMessage(
    { action: "classify", titles: titles.map(item => ({ title: item.title, url: item.url })) },
    (response) => {
      if (response && response.clickbait) {
        modifyClickbait(response.clickbait);
      }
    }
  );
};

// 初始化並執行分類
const initializeClickbaitDetection = () => {
  const titles = collectTitles();
  classifyTitles(titles);
};
initializeClickbaitDetection();

// 嘗試取得 "看更多新聞" 的按鈕 (用於 NOWnews)
const seeMoreBtn = document.getElementById("moreNews");
if (seeMoreBtn) {
  seeMoreBtn.addEventListener("click", () => {
    console.log("點擊了「看更多新聞」按鈕...");
    setTimeout(() => {
      initializeClickbaitDetection();
    }, 2000);
  });
} else {
  // 如果找不到按鈕，則用 MutationObserver 監控 DOM 變化
  let debounceTimeout = null;
  const observer = new MutationObserver(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      console.log("DOM 發生變化，重新偵測新聞...");
      initializeClickbaitDetection();
    }, 1000);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}