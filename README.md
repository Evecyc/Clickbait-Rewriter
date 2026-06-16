# Clickbait Rewriter

A local-first Chrome Extension and FastAPI backend for detecting clickbait-style headlines on Taiwanese news websites.

## Current Features

- Extract headline candidates from news list pages
- Filter ads, navigation links, and noisy non-article links
- Send headline candidates from Chrome Extension to local backend
- Classify headlines with either:
  - keyword-based mock mode
  - Hugging Face transformer model mode
- Highlight detected clickbait-style headlines in the browser
- Show original headline and clickbait score in tooltip

## Supported Websites

- Yahoo News Taiwan
- ETtoday
- UDN

## Tech Stack

- Chrome Extension Manifest V3
- JavaScript
- Python
- FastAPI
- Pydantic
- Hugging Face Transformers
- PyTorch

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Start backend:

```bash
cd backend
uvicorn main:app --reload
```

Backend URLs:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/docs
```

Load Chrome Extension:

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select the `extension/` folder

## Classifier Mode

Use mock mode for stable demos:

```env
CLASSIFIER_MODE=mock
```

Use model mode for real predictions:

```env
CLASSIFIER_MODE=model
```

## Current Status

Completed:

- Chrome Extension setup
- FastAPI backend setup
- headline candidate extraction
- ad/noise filtering
- extension-to-backend classification flow
- mock classifier
- transformer classifier
- browser highlight and tooltip UI

Planned:

- article content extraction
- context-aware headline rewriting
- Gemini-based rewrite generation
- rewrite display in tooltip