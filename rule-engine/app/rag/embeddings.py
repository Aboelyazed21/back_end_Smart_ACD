from __future__ import annotations

import hashlib
import math
import re
import unicodedata

# Bump when normalisation or the embedding algorithm changes. The policy store
# re-embeds stored chunks when this differs from engine_metadata, so retrieval
# never mixes vectors produced by two different normalisers.
EMBEDDING_VERSION = "2"

_DIACRITICS = re.compile(r"[\u064B-\u065F\u0670\u0640]")
_PREFIXES = ("وال", "بال", "كال", "فال", "ال", "و", "ف", "ب", "ك", "ل")
_SUFFIXES = ("ات", "ون", "ين", "ان", "ها", "هم", "هن", "كم", "نا")


def normalize(text: str) -> str:
    """Arabic-aware normalisation: unify alef/ya/ta-marbuta, drop diacritics.

    This is what makes paraphrased questions ("المستوي الثاني" vs
    "المستوى الثاني") land on the same tokens.
    """
    text = unicodedata.normalize("NFKC", text).lower()
    text = _DIACRITICS.sub("", text)
    text = re.sub("[أإآٱ]", "ا", text)
    text = text.replace("ى", "ي").replace("ئ", "ي").replace("ؤ", "و").replace("ة", "ه")
    text = re.sub(r"[^\w\u0600-\u06FF]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def stem(word: str) -> str:
    """Light, rule-based Arabic stemmer (definite article, common affixes)."""
    for prefix in _PREFIXES:
        if word.startswith(prefix) and len(word) - len(prefix) >= 3:
            word = word[len(prefix) :]
            break
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            word = word[: -len(suffix)]
            break
    return word


def tokens(text: str) -> list[str]:
    normalized = normalize(text)
    words = [w for w in normalized.split() if len(w) > 1]
    out = list(words)
    for word in words:
        stemmed = stem(word)
        if stemmed != word:
            out.append(stemmed)
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
