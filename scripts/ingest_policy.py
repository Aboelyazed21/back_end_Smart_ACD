#!/usr/bin/env python3
"""Build article/clause level policy chunks from the official bylaw PDF.

The PDF is Arabic and OCR-quality. We keep the cleaned page text and a page
reference (``BUA-AIDM.pdf#page=N``) so every stored chunk is traceable to the
source. Chunking follows article/clause boundaries, never a fixed window.

Usage:
    python scripts/ingest_policy.py                 # writes regulation-data/policy_chunks.json
    python scripts/ingest_policy.py --database-url ...   # upserts into PostgreSQL/pgvector
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "regulation-data"
PDF_PATH = DATA_DIR / "BUA-AIDM.pdf"
OUT_PATH = DATA_DIR / "policy_chunks.json"

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
MULTISPACE_RE = re.compile(r"[ \t\u00a0]+")
ARTICLE_LINE_RE = re.compile(r"(?m)^\s*(\d{1,2})\.\s*$")


def clean(text: str) -> str:
    text = CONTROL_RE.sub(" ", text)
    text = text.replace("\u200f", " ").replace("\u200e", " ")
    text = MULTISPACE_RE.sub(" ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\u064B-\u065F\u0670]", "", text)
    text = text.replace("ـ", "")
    text = re.sub("[إأآٱ]", "ا", text)
    text = text.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    text = text.replace("ة", "ه")
    return text


def is_arabic(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    return len(ARABIC_RE.findall(text)) / len(letters) > 0.25


def extract_pages(pdf_path: Path) -> list[str]:
    try:
        import pymupdf  # type: ignore

        doc = pymupdf.open(pdf_path)
        return [clean(page.get_text()) for page in doc]
    except Exception:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(pdf_path))
        return [clean(page.extract_text() or "") for page in reader.pages]


def load_rules() -> list[dict]:
    with (DATA_DIR / "regulation_rules.json").open(encoding="utf-8") as fh:
        return json.load(fh).get("rules", [])


def page_numbers(value: str) -> list[int]:
    return [int(x) for x in re.findall(r"\d+", str(value))]


def split_paragraphs(text: str, max_len: int = 1600) -> list[str]:
    """Split on paragraph/sentence boundaries, never on a fixed byte window."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n|\n(?=\s*[0-9]+\s*[\.\)])", text) if b.strip()]
    out: list[str] = []
    for block in blocks:
        if len(block) <= max_len:
            out.append(block)
            continue
        sentences = re.split(r"(?<=[.!؟])\s+", block)
        current = ""
        for sentence in sentences:
            if len(current) + len(sentence) + 1 <= max_len:
                current = f"{current} {sentence}".strip()
            else:
                if current:
                    out.append(current)
                current = sentence
        if current:
            out.append(current)
    return out


def build_chunks(pages: list[str]) -> list[dict]:
    chunks: list[dict] = []
    seen: set[tuple] = set()

    def add(article: str, clause: str, page: int, text: str, title: str = "", source: str = "") -> None:
        text = clean(text)
        if len(text) < 40:
            return
        key = (article, clause, page, text[:120])
        if key in seen:
            return
        seen.add(key)
        chunks.append(
            {
                "article_no": str(article),
                "clause_no": str(clause),
                "page_no": page,
                "language": "ar" if is_arabic(text) else "en",
                "title": title,
                "text": text,
                "text_normalized": normalize(text),
                "source": source or f"BUA-AIDM.pdf#page={page}",
            }
        )

    rules = load_rules()
    for rule in rules:
        article = str(rule.get("article", "N/A"))
        clause = str(rule.get("clause", ""))
        title = rule.get("title_ar", "")
        pages_for_rule = page_numbers(rule.get("page", "")) or [1]
        first_page = pages_for_rule[0]
        # Summary chunk: the validated Arabic summary from the rule index.
        add(
            article,
            clause,
            first_page,
            f"{title}\n{rule.get('summary_ar', '')}",
            title=title,
            source=f"BUA-AIDM.pdf#page={first_page}",
        )
        # Page paragraphs are attributed to the rule whose page range covers
        # them. This preserves article/page provenance even for OCR fragments.
        for p in pages_for_rule[:2]:
            if 1 <= p <= len(pages):
                for part in split_paragraphs(pages[p - 1]):
                    add(article, clause, p, part, title=title)

    # Course-table pages: provenance taken from the bylaw table sources that
    # are recorded in programs.json (Table 1 p.22 ... Table 10 p.27).
    table_article = {22: "24", 23: "25", 24: "26", 25: "26", 26: "26", 27: "26"}
    for page_no, article in table_article.items():
        if page_no <= len(pages) and len(pages[page_no - 1]) > 80:
            for part in split_paragraphs(pages[page_no - 1]):
                add(
                    article,
                    "Table",
                    page_no,
                    part,
                    title="جداول المقررات",
                    source=f"BUA-AIDM.pdf#page={page_no}",
                )

    # Deduplicate identical text, keeping multiple paragraphs per page.
    unique: dict[tuple, dict] = {}
    for chunk in chunks:
        text_key = hashlib.sha256(chunk["text"].encode()).hexdigest()
        key = (chunk["article_no"], chunk["clause_no"], chunk["page_no"], text_key)
        unique[key] = chunk
    out = sorted(unique.values(), key=lambda c: (int(c["page_no"]), c["article_no"], c["clause_no"]))
    for chunk in out:
        digest = hashlib.sha256(
            f"{chunk['article_no']}|{chunk['clause_no']}|{chunk['page_no']}|{chunk['text']}".encode()
        ).hexdigest()
        chunk["chunk_hash"] = digest
    return out


def upsert_database(chunks: list[dict], database_url: str) -> None:
    import psycopg  # type: ignore
    from app.rag.embeddings import embed  # type: ignore

    checksum = hashlib.sha256(PDF_PATH.read_bytes()).hexdigest()
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO policy_documents (title, source_file, checksum, page_count, language)
                VALUES (%s, %s, %s, %s, 'ar')
                ON CONFLICT (checksum) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
                """,
                ("BUA AIDM 2023 Bylaws", "BUA-AIDM.pdf", checksum, 60),
            )
            document_id = cur.fetchone()[0]
            cur.execute("DELETE FROM policy_chunks WHERE document_id = %s", (document_id,))
            for chunk in chunks:
                vector = embed(chunk["text"], 384)
                cur.execute(
                    """
                    INSERT INTO policy_chunks
                        (document_id, article_no, clause_no, page_no, language, title, text,
                         text_normalized, source_ref, chunk_hash, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
                    """,
                    (
                        document_id,
                        chunk["article_no"],
                        chunk["clause_no"],
                        chunk["page_no"],
                        chunk["language"],
                        chunk.get("title", ""),
                        chunk["text"],
                        chunk["text_normalized"],
                        chunk["source"],
                        chunk["chunk_hash"],
                        str(vector),
                    ),
                )
        conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default="")
    parser.add_argument("--check", action="store_true", help="fail if generated output is stale")
    args = parser.parse_args()

    if not PDF_PATH.exists():
        print(f"PDF not found: {PDF_PATH}", file=sys.stderr)
        return 2
    pages = extract_pages(PDF_PATH)
    chunks = build_chunks(pages)
    if len(chunks) < 10:
        print("Refusing to write: too few chunks extracted", file=sys.stderr)
        return 2
    payload = {
        "document": {
            "title": "BUA AIDM 2023 Bylaws",
            "source_file": "BUA-AIDM.pdf",
            "checksum": hashlib.sha256(PDF_PATH.read_bytes()).hexdigest(),
            "page_count": len(pages),
            "language": "ar",
        },
        "chunks": chunks,
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.check:
        existing = OUT_PATH.read_text(encoding="utf-8") if OUT_PATH.exists() else ""
        if json.loads(existing or "{}").get("document", {}).get("checksum") != payload["document"]["checksum"]:
            print("policy_chunks.json is stale", file=sys.stderr)
            return 1
        print(f"policy chunks OK ({len(chunks)})")
        return 0
    OUT_PATH.write_text(serialized, encoding="utf-8")
    print(f"wrote {len(chunks)} chunks to {OUT_PATH}")
    if args.database_url:
        upsert_database(chunks, args.database_url)
        print("upserted policy chunks into PostgreSQL")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rule-engine"))
    raise SystemExit(main())
