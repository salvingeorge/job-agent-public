import os
import secrets
import time
from pathlib import Path
from threading import Lock
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from core import extract, build_index, fetch_job, generate, docx_bytes
import io

app = FastAPI()
sessions = {}
lock = Lock()


def session(request, response):
    token = request.cookies.get("paperwork")
    now = time.monotonic()
    with lock:
        for expired in [key for key, value in sessions.items() if now - value["seen"] > 7200]:
            del sessions[expired]
        if token not in sessions:
            token = secrets.token_urlsafe(32)
            sessions[token] = {"documents": {}, "index": None, "seen": now}
            response.set_cookie("paperwork", token, httponly=True, samesite="strict",
                                secure=request.url.scheme == "https", max_age=7200)
        state = sessions[token]
        state["seen"] = now
    return state


@app.get("/api/session")
def get_session(request: Request, response: Response):
    state = session(request, response)
    return {"ready": bool(os.getenv("LLM_MODEL")), "documents": list(state["documents"].values())}


@app.delete("/api/session")
def clear_session(request: Request, response: Response):
    with lock:
        sessions.pop(request.cookies.get("paperwork"), None)
    response.delete_cookie("paperwork")
    return {"ok": True}


@app.post("/api/documents")
async def upload(request: Request, response: Response, file: UploadFile = File(...)):
    state = session(request, response)
    name = Path(file.filename or "document").name
    if Path(name).suffix.lower() not in {".pdf", ".docx", ".txt", ".md"}:
        raise HTTPException(400, "Use PDF, Word, Markdown or text documents.")
    data = await file.read(10_000_001)
    await file.close()
    try:
        text = await run_in_threadpool(extract, name, data)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc
    document = {"id": secrets.token_urlsafe(12), "name": name, "text": text,
                "type": "Resume", "size": len(data)}
    with lock:
        if len(state["documents"]) >= 12:
            raise HTTPException(400, "You can add up to 12 documents.")
        state["documents"][document["id"]] = document
        state["index"] = None
    return document


@app.delete("/api/documents/{document_id}")
def remove(document_id: str, request: Request, response: Response):
    state = session(request, response)
    with lock:
        state["documents"].pop(document_id, None)
        state["index"] = None
    return {"ok": True}


class IndexInput(BaseModel):
    labels: dict[str, str]


@app.post("/api/index")
async def index(body: IndexInput, request: Request, response: Response):
    state = session(request, response)
    with lock:
        documents = [dict(item) for item in state["documents"].values()]
    if not documents or set(body.labels) != {doc["id"] for doc in documents}:
        raise HTTPException(400, "Your document list changed. Refresh and try again.")
    for doc in documents:
        label = body.labels[doc["id"]]
        if label not in {"Resume", "Cover letter", "Certificate", "Other"}:
            raise HTTPException(400, "Choose a valid document type.")
        doc["type"] = label
    try:
        result = await run_in_threadpool(build_index, documents)
    except ValueError as exc:
        raise HTTPException(400, "These documents contain too little searchable text.") from exc
    with lock:
        if set(state["documents"]) != set(body.labels):
            raise HTTPException(409, "Documents changed during indexing. Please retry.")
        state["documents"] = {doc["id"]: doc for doc in documents}
        state["index"] = result
    return {"passages": len(result[0])}


class GenerateInput(BaseModel):
    text: str = Field(min_length=1, max_length=30000)
    mode: str = "text"


@app.post("/api/generate")
async def write_documents(body: GenerateInput, request: Request, response: Response):
    state = session(request, response)
    index = state["index"]
    if index is None:
        raise HTTPException(400, "Index your documents first.")
    if not os.getenv("LLM_MODEL"):
        raise HTTPException(503, "The host needs to configure an AI model before generation is available.")
    try:
        job = await run_in_threadpool(fetch_job, body.text) if body.mode == "url" else body.text
        if len(job.strip()) < 80:
            raise ValueError("Please provide a fuller job description, at least 80 characters.")
        result, sources = await run_in_threadpool(generate, index, job)
        return {"documents": result, "sources": sources}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Could not generate documents. Try pasted job text or check the host AI configuration.") from exc


class ExportInput(BaseModel):
    text: str = Field(min_length=1, max_length=100000)


@app.post("/api/export")
def export(body: ExportInput):
    return StreamingResponse(io.BytesIO(docx_bytes(body.text)),
                             media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

dist = Path(__file__).parent / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
