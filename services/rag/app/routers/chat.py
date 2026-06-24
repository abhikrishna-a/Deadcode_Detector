import json
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.auth import get_current_user
from app.models.schemas import ChatRequest, FolderChatRequest, ChatQuery, ChatReply
from app.services.rag import retrieve, retrieve_by_folder, retrieve_similar, build_prompt, build_folder_prompt, build_chat_context_prompt, stream_answer, answer_question

router = APIRouter()


@router.post("/chat")
async def chat_endpoint(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT user_id, analysis FROM rag_documents WHERE id = CAST(:id AS uuid)"),
        {"id": body.document_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if row[0] != user["user_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this document")

    analysis_json = json.dumps(row[1]) if row[1] else "{}"

    try:
        context_chunks = await retrieve(body.document_id, body.question, db)
    except Exception as e:
        context_chunks = []

    if not context_chunks:
        messages = [
            {"role": "system", "content":
                "You are GhostCode Assistant. You have access to a code file's static analysis results.\n"
                f"The analysis found the following dead code issues: {analysis_json}\n"
                "Answer questions about WHY specific code is dead, cite exact line numbers, and suggest fixes.\n"
                "No code context chunks were found, so answer based on the analysis data only."},
            {"role": "user", "content": body.question},
        ]
    else:
        messages = build_prompt(body.question, context_chunks, analysis_json)

    history_messages = []
    for msg in body.history:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            history_messages.append(msg)

    if history_messages:
        messages = messages[:-1] + history_messages + [messages[-1]]

    async def event_stream():
        async for event in stream_answer(messages, context_chunks or []):
            yield f"data: {event}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/chat-folder")
async def chat_folder_endpoint(
    body: FolderChatRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not body.scan_folder.strip():
        raise HTTPException(status_code=400, detail="scan_folder cannot be empty.")

    context_chunks = await retrieve_by_folder(db, user["user_id"], body.scan_folder, body.question)

    if not context_chunks:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are GhostCode Assistant — a code quality expert. "
                    "No code context was found for the requested folder. "
                    "Explain that there is no analyzed code available for this folder yet."
                ),
            },
            {"role": "user", "content": body.question},
        ]
    else:
        messages = build_folder_prompt(body.question, context_chunks)

    history_messages = []
    for msg in body.history:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            history_messages.append(msg)

    if history_messages:
        messages = messages[:-1] + history_messages + [messages[-1]]

    async def event_stream():
        async for event in stream_answer(messages, context_chunks or []):
            yield f"data: {event}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/chat-json", response_model=ChatReply)
async def chat_json_endpoint(
    body: ChatQuery,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    sources = await retrieve_similar(
        db=db,
        user_id=user["user_id"],
        query=body.message,
        top_k=5,
        analysis_id=body.analysis_id,
    )

    if not sources:
        return ChatReply(
            answer="No code context found. Please analyze a file first.",
            sources=[],
        )

    messages = build_chat_context_prompt(body.message, sources)

    try:
        answer = await answer_question(messages)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}")

    return ChatReply(
        answer=answer,
        sources=[
            {
                "chunk_text": s["chunk_text"],
                "filename": s["filename"],
                "analysis_id": s["analysis_id"],
                "score": round(s["score"], 4),
            }
            for s in sources
        ],
    )
