from __future__ import annotations

import hashlib
import math
import re
import unicodedata


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[\u064B-\u065F\u0670]", "", text)
    text = text.replace("ـ", "")
    text = re.sub("[إأآٱ]", "ا", text)
    text = text.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي").replace("ة", "ه")
    text = re.sub(r"[^\w\u0600-\u06FF]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(text: str) -> list[str]:
    normalized = normalize(text)
    words = [w for w in normalized.split() if len(w) > 1]
    out = list(words)
    for word in words:
        if len(word) >= 4:
            out.extend(word[i : i + 3] for i in range(0, len(word) - 2))
    return out


def _bucket(token: str, dim: int) -> tuple[int, float]:
    digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
    value = int.from_bytes(digest, "big")
    index = value % dim
    sign = 1.0 if (value >> 63) & 1 else -1.0
    return index, sign


def embed(text: str, dim: int = 384) -> list[float]:
    """Deterministic local lexical-hashing embedding.

    This is intentionally dependency-free and offline. It is a retrieval
    embedding, not a generative model; a university may swap it for a hosted
    Arabic embedding model by setting EMBEDDING_PROVIDER without changing the
    schema (vector(384)).
    """
    vector = [0.0] * dim
    for token in tokens(text):
        index, sign = _bucket(token, dim)
        vector[index] += sign
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0:
        return vector
    return [v / norm for v in vector]


def cosine(a: list[float], b: list[float]) -> float:
    return float(sum(x * y for x, y in zip(a, b, strict=False)))
