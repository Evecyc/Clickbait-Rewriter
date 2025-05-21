import re
from flask import Flask, request, jsonify
from transformers import pipeline
from bs4 import BeautifulSoup
import requests
import json
import time, random
import google.generativeai as genai
from collections import deque
import time

app = Flask(__name__)

# 加載模型
classify_model = pipeline("text-classification", model="Stremie/xlm-roberta-base-clickbait")
# 配置 Google Gemini API
genai.configure(api_key="AIzaSyCbTxMCwlwKFpNgQgv2Tx1SRal7Pnj9U_E")
generation_config = {
    "temperature": 0,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 256,
    "response_mime_type": "application/json"
}

def filter_titles(titles, urls):
    """ 過濾非新聞標題的內容，並清理涵蓋其他資訊的標題格式 """
    filtered_pairs = []

    for title, url in zip(titles, urls):
        clean_title = title.split("\n")[0].strip()

        # 過濾條件
        if (
            len(clean_title) < 10 or len(clean_title) > 30  # 長度限制
            or re.match(r"^[\d/:\s]+$", clean_title)  # 僅為時間或數字
            or any(keyword in clean_title for keyword in ["分類", "播放", "訂閱", "LIVE", "OFF", "PLAY", "AdAd", "求職網", "財經", "風傳媒"])  # 黑名詞
            or "ad." in url
            or clean_title in ["", None]
        ):
            continue

        filtered_pairs.append((clean_title, url))

    if not filtered_pairs:
        return [], []
    
    filtered_titles, filtered_urls = zip(*filtered_pairs)
    return list(filtered_titles), list(filtered_urls)

def fetch_article_content(url):
    """ 從網址抓取文章內容，並加入完整 header 與重試機制 """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://www.google.com/"
        }
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(max_retries=3)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        time.sleep(random.uniform(1, 3))
        
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        nownews = None
        udn = None
        yahoo = None
        ettoday = None
        storm = None

        if "nownews.com" in url:
            nownews = soup.find("div", id="articleContent")
        elif "udn.com" in url:
            udn = soup.find("div", class_="article-content__paragraph")
            if not udn:
                udn = soup.find("div", class_="story_body_content")
            if not udn:
                udn = soup.find("section", id="story-main")
            if not udn:
                udn = soup.find("article", class_="story__text")
            if not udn:
                udn = soup.find("article", class_="story-article ")
        elif "yahoo.com" in url:
            yahoo = soup.find("div", class_="caas-body")
            if not yahoo:
                yahoo = soup.find("div", class_="caas-content-wrapper")
        elif "ettoday.net" in url:
            ettoday = soup.find("div", class_="story")
        elif "storm.mg" in url:
            storm = soup.find("article")
        else:
            return "Error: unsupported URL"

        if nownews:
            text = nownews.get_text(separator="\n", strip=True)
        elif udn:
            text = " ".join(
            p.get_text() 
            for p in udn.find_all("p") 
            if not (p.get("style") or p.find("figure", class_="photo_center"))
            )
        elif yahoo:
            text = " ".join(p.get_text() for p in yahoo.find_all("p"))
        elif ettoday:
            text = " ".join(p.get_text() for p in ettoday.find_all("p"))
        elif storm:
            text = " ".join(p.get_text() for p in storm.find_all("p"))
        else:
            return "Error: no content found"

        text = re.sub(r"\s+", " ", text)
        
        if not text or len(text) < 10:
            return "Error: content too short"
        
        return text.strip()
    
    except Exception as e:
        return "Fail: " + str(e)

def generate_title(original_title, article_content, retries=0):
    """ 讓 Gemini 生成新標題 """

    title_prompt = f"""
    從給定的文章內容：
    {article_content}
    針對原始標題「{original_title}」，生成一個新的標題，該標題應[明確回答/說明/點出]原始標題中[提出的疑問/暗示的內容/未明確說明的細節]，不留任何模糊或誇張詞語。
    若原始標題使用數量詞（如「[數字]種」）或指示代詞（如「這個」）指代具體事物，新標題應說明其具體內容。
    若無法完整說明原始標題中的內容，則應以最精簡的文字摘要文章內容，並避免和原始標題使用類似語句。
    # 輸出 json 格式: {{"title": "標題"}}
    """
    if "Error" in article_content:
        return article_content

    try:
        gemini = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config=generation_config,
            system_instruction=title_prompt
        )

        chat_session = gemini.start_chat(history=[])
        time.sleep(0.5)  # 避免 API 請求過快導致錯誤

        response = chat_session.send_message(article_content)

        # 確保回應是 JSON 格式
        try:
            parsed_response = json.loads(response.text)
            title = parsed_response.get("title", "API did not return a title.")
        except json.JSONDecodeError:
            title = "API response format error, unable to decode JSON." 

        print(f"Generated title: {title}")
        return title

    except Exception as e:
        return f"Fail: {e}"

# 收發 API 請求
@app.route("/classify", methods=["POST"])
def classify_titles():
    # 接收 JSON 資料
    data = request.json
    titles = data.get("titles", [])  # 取得標題與網址列表
    if not titles:
        return jsonify({"error": "No titles provided"}), 400

    # 建立兩個對應的 List
    title_texts = [title.get("title", "No Title") for title in titles]  # 取得所有標題
    urls = [title.get("url", "No URL") for title in titles]  # 取得所有 URL

    # 預處理：過濾非標題內容
    filtered_titles, filtered_urls = filter_titles(title_texts, urls)
    if not filtered_titles:
        return jsonify({"error": "No valid titles after filtering"}), 400

    # 使用模型進行判斷
    results = classify_model(filtered_titles, truncation=True)

    clickbait_count = len([result for result in results if result["label"] == "LABEL_1"])
    print(f"Clickbait titles: {clickbait_count}")    

    # 回傳 clickbait 標題
    clickbait_titles = [
    {
        "text": title.strip(),
        "new_title": generate_title(title, fetch_article_content(url)),
        "url": url
    }
    for title, result, url in zip(filtered_titles, results, filtered_urls)
    if result["label"] == "LABEL_1"
    ]
    
    print(f"Generate complete") if clickbait_count else print(f"No clickbait titles found")

    return jsonify({"clickbait": clickbait_titles})

# 錯誤重傳機制
@app.route("/generate", methods=["POST"])
def retry_generate():
    data = request.get_json()
    title = data.get("title")
    url = data.get("url")

    if not title or not url:
        return jsonify({"Error": "Missing title or url"}), 400

    article_content = fetch_article_content(url)
    if not article_content or article_content.startswith("Fail"):
        return jsonify({
            "text": title,
            "new_title": "Error: content fetch failed",
            "url": url
        })

    new_title = generate_title(title, article_content)
    return jsonify({
        "text": title,
        "new_title": new_title,
        "url": url
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)