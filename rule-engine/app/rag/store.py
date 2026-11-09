from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass

from ..config import get_settings, regulation_dir
from .embeddings import cosine, embed

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PolicyChunk:
    article_no: str
    clause_no: str
    page_no: int
    language: str
    title: str
    text: str
    source: str


class PolicyStore:
    """Retrieval over policy_chunks (pgvector when available, in-memory fallback)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._chunks: list[PolicyChunk] = []
        self._matrix: list[list[float]] = []
        self._loaded = False
        self._db = False

    # ------------------------------------------------------------------ load
    def _load_json(self) -> list[PolicyChunk]:
        path = regulation_dir() / "policy_chunks.json"
        if not path.exists():
            return []
        payload = json.loads(path.read_text(encoding="utf-8"))
        return [
            PolicyChunk(
                article_no=str(c.get("article_no", "N/A")),
                clause_no=str(c.get("clause_no", "")),
                page_no=int(c.get("page_no", 0)),
                language=c.get("language", "ar"),
                title=c.get("title", ""),
                text=c.get("text", ""),
                source=c.get("source", f"BUA-AIDM.pdf#page={c.get('page_no', 0)}"),
            )
            for c in payload.get("chunks", [])
            if c.get("text")
        ]

    def load(self) -> None:
        with self._lock:
            if self._loaded:
                return
            chunks = self._load_json()
            if get_settings().database_url:
                try:
                    self._ensure_db_chunks()
                    chunks = self._load_db()
                    self._db = True
                except Exception as exc:  # pragma: no cover - infra dependent
                    logger.warning("pgvector unavailable, using in-memory policy store: %s", exc)
                    self._db = False
            self._chunks = chunks
            self._matrix = [embed(c.text, get_settings().embedding_dim) for c in chunks]
            self._loaded = True

    def _connect(self):
        import psycopg  # type: ignore

        return psycopg.connect(get_settings().database_url, connect_timeout=5)

    def _load_db(self) -> list[PolicyChunk]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT article_no, clause_no, page_no, language, title, text, source_ref
                    FROM policy_chunks
                    ORDER BY page_no, article_no, clause_no
                    """
                )
                rows = cur.fetchall()
        return [
            PolicyChunk(str(r[0]), str(r[1]), int(r[2]), r[3], r[4] or "", r[5], r[6] or "")
            for r in rows
        ]

    def _ensure_db_chunks(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM policy_chunks")
                count = int(cur.fetchone()[0])
        if count > 0:
            return
        chunks = self._load_json()
        if not chunks:
            return
        from ..config import repo_root

        checksum = ""
        pdf = repo_root() / "regulation-data" / "BUA-AIDM.pdf"
        if pdf.exists():
            import hashlib

            checksum = hashlib.sha256(pdf.read_bytes()).hexdigest()
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO policy_documents (title, source_file, checksum, page_count, language)
                    VALUES (%s, %s, %s, %s, 'ar')
                    ON CONFLICT (checksum) DO UPDATE SET title = EXCLUDED.title
                    RETURNING id
                    """,
                    ("BUA AIDM 2023 Bylaws", "BUA-AIDM.pdf", checksum or "unknown", 60),
                )
                document_id = cur.fetchone()[0]
                for chunk in chunks:
                    vector = embed(chunk.text, get_settings().embedding_dim)
                    import hashlib

                    digest = hashlib.sha256(
                        f"{chunk.article_no}|{chunk.clause_no}|{chunk.page_no}|{chunk.text}".encode()
                    ).hexdigest()
                    cur.execute(
                        """
                        INSERT INTO policy_chunks
                            (document_id, article_no, clause_no, page_no, language, title, text,
                             text_normalized, source_ref, chunk_hash, embedding)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
                        ON CONFLICT (chunk_hash) DO NOTHING
                        """,
                        (
                            document_id,
                            chunk.article_no,
                            chunk.clause_no,
                            chunk.page_no,
                            chunk.language,
                            chunk.title,
                            chunk.text,
                            chunk.text,
                            chunk.source,
                            digest,
                            str(vector),
                        ),
                    )
            conn.commit()
        logger.info("ingested %s policy chunks into pgvector", len(chunks))

    # ---------------------------------------------------------------- search
    def search(self, query: str, top_k: int = 5) -> list[tuple[PolicyChunk, float]]:
        self.load()
        if not self._chunks:
            return []
        if self._db:
            try:
                vector = embed(query, get_settings().embedding_dim)
                with self._connect() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            SELECT article_no, clause_no, page_no, language, title, text, source_ref,
                                   1 - (embedding <=> %s::vector) AS score
                            FROM policy_chunks
                            ORDER BY embedding <=> %s::vector
                            LIMIT %s
                            """,
                            (str(vector), str(vector), top_k),
                        )
                        rows = cur.fetchall()
                return [
                    (
                        PolicyChunk(str(r[0]), str(r[1]), int(r[2]), r[3], r[4] or "", r[5], r[6] or ""),
                        float(r[7]),
                    )
                    for r in rows
                ]
            except Exception as exc:  # pragma: no cover
                logger.warning("pgvector search failed, falling back: %s", exc)
                self._db = False
        query_vec = embed(query, get_settings().embedding_dim)
        scored = [(chunk, cosine(query_vec, vec)) for chunk, vec in zip(self._chunks, self._matrix, strict=False)]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:top_k]

    @property
    def chunk_count(self) -> int:
        self.load()
        return len(self._chunks)

    @property
    def database_backed(self) -> bool:
        self.load()
        return self._db


store = PolicyStore()
