"""
main.py - FastAPI application orchestrating:
  - LaTeX & BibTeX compilation pipeline
  - Deterministic bibliography resolution (DOI / arXiv / URLs)
  - On-demand AI assistants (layout, booktabs, error recovery)
  - Real-time CRDT collaborative editing (Yjs / WebSocket)
  - Static file delivery for modern frontend
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bib_service
import ai_service
import compiler


app = FastAPI(
    title="LaTeX Collaborative Studio API",
    description="Overleaf-like LaTeX platform with native deterministic DOI/arXiv bib resolver and AI assistance",
    version="1.0.0"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = Path("/app/frontend")
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = Path("frontend")



# --- Pydantic Request Models ---

class CompileRequest(BaseModel):
    main_tex: str = Field(..., alias="main.tex", description="Content of main.tex")
    references_bib: Optional[str] = Field(None, alias="references.bib", description="Content of references.bib")
    extra_files: Optional[Dict[str, str]] = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class BibResolveRequest(BaseModel):
    input: str = Field(..., description="DOI, arXiv ID, URL, or citation query string")


class BibParseRequest(BaseModel):
    bibtex: str = Field(..., description="Raw BibTeX content to parse")


class AiExtractBibRequest(BaseModel):
    text: str = Field(..., description="Unstructured citation or text")
    url: Optional[str] = None


class AiOptimizeLayoutRequest(BaseModel):
    code: str = Field(..., description="LaTeX figure, table, or layout snippet")
    instructions: Optional[str] = ""


class AiFormatTableRequest(BaseModel):
    data: str = Field(..., description="Raw tabular data, CSV, or basic LaTeX table")


class AiFixErrorRequest(BaseModel):
    main_tex: str = Field(..., description="Current main.tex code")
    log: str = Field(..., description="Compilation log error snippet")
    references_bib: Optional[str] = ""


# --- WebSocket Collaboration Manager (Yjs / CRDT Relay & Sync) ---

class CollabConnectionManager:
    """
    Manages real-time collaborative editing sessions per document room.
    Provides sub-millisecond broadcast of binary Yjs update packets and awareness states.
    """
    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = {}
        # Cached document state updates per room for fast catch-up on connect
        self.room_updates: Dict[str, List[bytes]] = {}

    async def connect(self, room: str, websocket: WebSocket):
        await websocket.accept()
        if room not in self.rooms:
            self.rooms[room] = set()
            self.room_updates[room] = []
        self.rooms[room].add(websocket)

        # Send existing cached updates to catching up client
        for update in self.room_updates[room]:
            try:
                await websocket.send_bytes(update)
            except Exception:
                pass

    def disconnect(self, room: str, websocket: WebSocket):
        if room in self.rooms:
            self.rooms[room].discard(websocket)
            if not self.rooms[room]:
                del self.rooms[room]

    async def broadcast(self, room: str, sender: WebSocket, message: bytes):
        if room in self.rooms:
            # Store update for future joiners (limit cache size to prevent memory explosion)
            if len(self.room_updates[room]) > 200:
                self.room_updates[room] = self.room_updates[room][-100:]
            self.room_updates[room].append(message)

            # Relay to all other peers in the room
            disconnected = []
            for connection in self.rooms[room]:
                if connection != sender:
                    try:
                        await connection.send_bytes(message)
                    except Exception:
                        disconnected.append(connection)
            for d in disconnected:
                self.disconnect(room, d)

    def peer_count(self, room: str) -> int:
        return len(self.rooms.get(room, []))


collab_manager = CollabConnectionManager()


# --- API Routes ---

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "latex-collaborative-studio"}


@app.post("/api/compile")
async def compile_document(req: CompileRequest):
    """
    Asynchronously compiles LaTeX and BibTeX.
    Executes pdflatex -> bibtex -> pdflatex x2 in a sandboxed, ephemeral workspace.
    """
    result = await compiler.compile_latex(
        main_tex=req.main_tex,
        references_bib=req.references_bib,
        extra_files=req.extra_files
    )
    return JSONResponse(content=result)


@app.get("/api/pdf/{job_id}")
async def get_pdf(job_id: str):
    """Streams the compiled PDF artifact for browser preview or download."""
    pdf_path = compiler.get_compiled_pdf_path(job_id)
    if not pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found or compilation expired.")
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename="document.pdf",
        headers={"Content-Disposition": "inline; filename=document.pdf"}
    )


@app.post("/api/bib/resolve")
async def resolve_bibliography(req: BibResolveRequest):
    """
    Universal deterministic bibliography resolution endpoint:
      - DOI: Content negotiation via Accept: application/x-bibtex against doi.org (0 tokens)
      - arXiv: Direct arXiv API query (0 tokens)
      - URL / Raw text: metadata scraping & hints for AI fallback
    """
    result = await bib_service.resolve_bibliography_input(req.input)
    return JSONResponse(content=result)


@app.post("/api/bib/parse-keys")
async def parse_bib_keys(req: BibParseRequest):
    """
    Parses references.bib content and extracts structured entry keys, authors,
    titles, and years for deterministic frontend autocompletion.
    """
    entries = bib_service.extract_bib_entries(req.bibtex)
    return JSONResponse(content={"entries": entries})


# --- On-Demand AI Endpoints ---

@app.post("/api/ai/extract-bibtex")
async def ai_extract_bibtex(req: AiExtractBibRequest):
    """Converts unstructured citation text or URL content into formatted BibTeX."""
    web_meta = None
    if req.url:
        web_meta = await bib_service.scrape_url_metadata(req.url)
    
    result = await ai_service.extract_bibtex_ai(
        input_text=req.text,
        web_metadata=web_meta
    )
    return JSONResponse(content=result)


@app.post("/api/ai/optimize-layout")
async def ai_optimize_layout(req: AiOptimizeLayoutRequest):
    """Optimizes floating figures, subfigures, tables, and layout macros."""
    result = await ai_service.optimize_latex_layout(
        snippet=req.code,
        user_instructions=req.instructions or ""
    )
    return JSONResponse(content=result)


@app.post("/api/ai/format-table")
async def ai_format_table(req: AiFormatTableRequest):
    """Converts raw data or messy LaTeX tables into professional booktabs tables."""
    result = await ai_service.format_latex_table(raw_data_or_table=req.data)
    return JSONResponse(content=result)


@app.post("/api/ai/fix-compile-error")
async def ai_fix_compile_error(req: AiFixErrorRequest):
    """Contextually diagnoses and fixes compilation errors using log snippets."""
    result = await ai_service.fix_compilation_error(
        main_tex=req.main_tex,
        log_snippet=req.log,
        references_bib=req.references_bib or ""
    )
    return JSONResponse(content=result)


# --- Collaborative WebSocket Endpoint ---

@app.websocket("/ws/{room_name}")
async def websocket_collab_endpoint(websocket: WebSocket, room_name: str):
    """
    CRDT synchronization endpoint compatible with Yjs / y-websocket protocols.
    Relays document updates between concurrent editors with zero delay.
    """
    await collab_manager.connect(room_name, websocket)
    try:
        while True:
            # Receive binary packet from Yjs client
            data = await websocket.receive_bytes()
            # Broadcast to peers in room
            await collab_manager.broadcast(room_name, websocket, data)
    except WebSocketDisconnect:
        collab_manager.disconnect(room_name, websocket)
    except Exception:
        collab_manager.disconnect(room_name, websocket)


# --- Static Frontend Mount ---

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
