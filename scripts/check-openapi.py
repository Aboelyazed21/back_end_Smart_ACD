"""Validate docs/openapi.yaml: references resolve and no duplicate mapping keys.

Usage: python scripts/check-openapi.py
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "docs" / "openapi.yaml"


class UniqueLoader(yaml.SafeLoader):
    pass


def construct_mapping(loader, node, deep=False):
    keys = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in keys:
            print(f"DUP KEY {key!r} at line {key_node.start_mark.line + 1}")
        keys.add(key)
    return yaml.SafeLoader.construct_mapping(loader, node, deep=deep)


UniqueLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_mapping
)

text = SPEC.read_text(encoding="utf-8")
doc = yaml.load(text, Loader=UniqueLoader)

refs = set(re.findall(r"#/components/[A-Za-z0-9_./{}]+", text))
missing = []
for ref in sorted(refs):
    node = doc
    for part in ref[2:].split("/"):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            missing.append(ref)
            break

print(f"paths={len(doc['paths'])} schemas={len(doc['components']['schemas'])} refs={len(refs)}")
print("missing refs:", missing)
print("openapi:", doc.get("openapi"))

if missing:
    raise SystemExit(1)
