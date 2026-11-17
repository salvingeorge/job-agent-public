# Paperwork

An account-free application writer with a React + Tailwind interface and FastAPI
backend. Upload and label documents, prepare a searchable index, paste a job
description or public link, then edit and download a resume and cover letter.

## Local setup

Requires Python 3.11+ and Node.js 20.19+.

    python -m venv .venv
    .venv\Scripts\python -m pip install -r requirements.txt
    cd frontend
    npm install
    npm run build
    cd ..

Configure the AI provider in the same PowerShell session:

    $env:LLM_BASE_URL = "https://your-provider.example/v1"
    $env:LLM_API_KEY = "your-key"
    $env:LLM_MODEL = "your-model"
    .\run.bat

Open http://127.0.0.1:8000. Visitors need no accounts or keys.
The host supplies inference and covers provider costs. Local OpenAI-compatible
model servers can also be used. On Linux, use .venv/bin/python and start
python -m uvicorn server:app --host 0.0.0.0 --port 8000.

For frontend development run npm run dev in frontend, with the API on port 8000.

## Data and retrieval

PDF, DOCX, UTF-8 text and Markdown are supported. Scans need OCR beforehand.
Text extraction happens on upload so visitors can preview extracted content.
Preparing documents builds a TF-IDF index with overlapping passages, source
names and document types. Retrieval uses cosine similarity and includes resume
context. This is lexical RAG without an embedding-model download.

Each visitor has an opaque, HTTP-only session cookie. Documents and indexes
remain in server memory, and expire after two hours of inactivity when the next
request triggers cleanup. Start fresh clears the session. Restarting the server
clears all sessions. Run one backend worker with this in-memory implementation.
For multi-worker deployments, replace the session store with shared storage.

Relevant passages and job text go to the configured provider at generation time.
Word downloads are built in memory from the user's edited text.
Blocked, redirecting and JavaScript-only sites may require pasted job text.

## Project status

API integration checks cover upload, indexing, session isolation, generation
with a mocked provider, Word export, removal invalidation, and session reset.
Live AI output requires a configured provider. The frontend is built for local
hosting by FastAPI. Choose an open-source license before publishing.

This project contains no profile data or credentials from the original app.
