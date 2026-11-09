#!/usr/bin/env python3
"""Generate docs/postman_collection.json from docs/openapi.yaml.

Keeps the collection in sync with the spec and gives every endpoint a runnable
request. Collection auth uses the bearer token; the CSRF and Login requests save
their values into collection variables automatically.

Usage: python docs/gen-postman.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "docs" / "openapi.yaml"
OUT = ROOT / "docs" / "postman_collection.json"

METHODS = ["get", "post", "put", "patch", "delete"]
HTTP_METHOD = {"get": "GET", "post": "POST", "put": "PUT", "patch": "PATCH", "delete": "DELETE"}
UUID = "00000000-0000-4000-8000-000000000000"

FORMAT_EXAMPLES = {
    "uuid": UUID,
    "email": "student1@aidm.bua.edu.eg",
    "date-time": "2026-10-01T09:00:00Z",
    "binary": "",
}
NAME_EXAMPLES = {
    "email": "student1@aidm.bua.edu.eg",
    "password": "ChangeMe!2026",
    "currentPassword": "ChangeMe!2026",
    "newPassword": "NewStrong!2026",
    "fullName": "Student One",
    "nameAr": "علوم الحاسب",
    "nameEn": "Computer Science",
    "code": "CSB1101",
    "courseCode": "CSB1101",
    "studentCode": "26000001",
    "program": "CS",
    "targetProgram": "IT",
    "term": "2026-2027-fall",
    "token": "reset-token-placeholder-0123456789",
    "question": "ما هو الحد الأقصى للعبء الدراسي؟",
    "note": "Reviewed with the student.",
    "feedback": "Plan matches the bylaw.",
    "reason": "Scheduling conflict",
    "resolution": "Confirmed with the college council.",
    "resolvedValue": "12",
    "subject": "Eligibility appeal",
    "description": "Student disputes the prerequisite decision.",
    "startTime": "10:00",
    "endTime": "11:00",
    "start": "10:00",
    "end": "11:00",
    "date": "2026-12-15",
    "academicYear": "2026-2027",
    "season": "fall",
    "slotId": UUID,
    "studentId": UUID,
    "advisorId": UUID,
    "departmentId": UUID,
    "assignedTo": UUID,
    "location": "Advisor office",
    "phone": "+201000000000",
    "search": "student",
    "planningSlot": "3-1",
    "maxCredits": 15,
    "plannedCredits": 15,
    "week": 1,
    "level": 1,
    "capacity": 30,
    "credits": 3,
    "minPassedCreditHours": 60,
    "percentage": 85,
    "futureCgpaTarget": 3.0,
    "gradeLetter": "A",
    "weekday": 0,
    "day": "sun",
    "room": "B-101",
}

SKIP_CSRF = {"/api/auth/login", "/api/auth/refresh", "/api/auth/csrf"}


def resolve(doc: dict[str, Any], node: Any) -> Any:
    while isinstance(node, dict) and "$ref" in node:
        parts = node["$ref"][2:].split("/")
        node = doc
        for part in parts:
            node = node[part]
    return node


def example_for(doc: dict[str, Any], name: str, schema: Any) -> Any:
    schema = resolve(doc, schema)
    if not isinstance(schema, dict):
        return None
    if "example" in schema:
        return schema["example"]
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    if name in NAME_EXAMPLES:
        return NAME_EXAMPLES[name]
    types = schema.get("type")
    if isinstance(types, list):
        types = next((item for item in types if item != "null"), "string")
    if types == "object":
        properties = schema.get("properties") or {}
        required = set(schema.get("required") or [])
        result = {}
        for key, child in properties.items():
            if required or len(properties) <= 8:
                result[key] = example_for(doc, key, child)
        return result
    if types == "array":
        item = example_for(doc, name, schema.get("items") or {})
        return [item] if item is not None else []
    if types == "integer":
        return 1
    if types == "number":
        return 1.0
    if types == "boolean":
        return False
    if "format" in schema and schema["format"] in FORMAT_EXAMPLES:
        return FORMAT_EXAMPLES[schema["format"]]
    return "string"


def to_postman_url(path: str) -> tuple[str, list[dict[str, Any]]]:
    variables = []
    path_examples = {"code": "R-REG-09.5", "courseCode": "CSB1101", "id": UUID}

    def replace(match: re.Match[str]) -> str:
        variables.append(
            {
                "key": match.group(1),
                "value": path_examples.get(match.group(1), NAME_EXAMPLES.get(match.group(1), UUID)),
            }
        )
        return "{{" + match.group(1) + "}}"

    raw = "{{baseUrl}}" + re.sub(r"\{([^}]+)\}", replace, path)
    return raw, variables


def operation_item(
    doc: dict[str, Any], path: str, method: str, operation: dict[str, Any]
) -> dict[str, Any]:
    raw, path_variables = to_postman_url(path)
    query = []
    for parameter in operation.get("parameters") or []:
        parameter = resolve(doc, parameter)
        if parameter.get("in") != "query":
            continue
        schema = parameter.get("schema") or {}
        query.append(
            {
                "key": parameter["name"],
                "value": str(example_for(doc, parameter["name"], schema) or ""),
                "description": parameter.get("description", ""),
                "disabled": parameter["name"] not in ("page", "limit"),
            }
        )

    headers = []
    body = None
    request_body = operation.get("requestBody") or {}
    content = request_body.get("content") or {}
    if "application/json" in content:
        schema = content["application/json"].get("schema") or {}
        payload = example_for(doc, "body", schema)
        headers.append({"key": "Content-Type", "value": "application/json"})
        body = {
            "mode": "raw",
            "raw": json.dumps(payload, indent=2, ensure_ascii=False),
            "options": {"raw": {"language": "json"}},
        }
    elif "multipart/form-data" in content:
        schema = resolve(doc, content["multipart/form-data"].get("schema") or {})
        fields = []
        for name in (schema.get("properties") or {}):
            fields.append(
                {
                    "key": name,
                    "type": "file",
                    "src": [],
                    "description": "Select a CSV file",
                }
            )
        body = {"mode": "formdata", "formdata": fields}

    if method in {"post", "patch", "put", "delete"} and path not in SKIP_CSRF:
        headers.append({"key": "x-csrf-token", "value": "{{csrfToken}}"})

    item: dict[str, Any] = {
        "name": operation.get("summary") or f"{HTTP_METHOD[method]} {path}",
        "request": {
            "method": HTTP_METHOD[method],
            "header": headers,
            "url": {
                "raw": raw,
                "host": ["{{baseUrl}}"],
                "path": [
                    segment.replace("{", "{{").replace("}", "}}")
                    for segment in path.strip("/").split("/")
                ],
                "query": query,
                "variable": path_variables,
            },
            "description": operation.get("description", ""),
        },
        "response": [],
    }
    if body is not None:
        item["request"]["body"] = body

    if path == "/api/auth/csrf":
        item["event"] = [
            {
                "listen": "test",
                "script": {
                    "type": "text/javascript",
                    "exec": [
                        'const token = pm.response.json().csrfToken;',
                        'pm.collectionVariables.set("csrfToken", token);',
                        "console.log('csrf token saved');",
                    ],
                },
            }
        ]
    if path == "/api/auth/login":
        item["event"] = [
            {
                "listen": "test",
                "script": {
                    "type": "text/javascript",
                    "exec": [
                        "const body = pm.response.json();",
                        'pm.collectionVariables.set("accessToken", body.accessToken);',
                        'if (body.csrfToken) pm.collectionVariables.set("csrfToken", body.csrfToken);',
                        "console.log('access token saved');",
                    ],
                },
            }
        ]
    return item


def main() -> None:
    doc = yaml.safe_load(SPEC.read_text(encoding="utf-8"))
    folders: dict[str, list[dict[str, Any]]] = {}
    for path, operations in doc["paths"].items():
        for method, operation in operations.items():
            if method not in METHODS:
                continue
            tag = (operation.get("tags") or ["Other"])[0]
            folders.setdefault(tag, []).append(
                operation_item(doc, path, method, operation)
            )

    collection = {
        "info": {
            "name": "Smart Academic Advisor API",
            "description": (
                "Advisory-only academic planning API. Run `Auth / Issue a CSRF token` "
                "and then `Auth / Authenticate...` first: their tests store "
                "{{csrfToken}} and {{accessToken}}. All plans are DRAFT and are never "
                "a registration."
            ),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{accessToken}}"}]},
        "variable": [
            {"key": "baseUrl", "value": "http://localhost:4000"},
            {"key": "accessToken", "value": ""},
            {"key": "csrfToken", "value": ""},
            {"key": "id", "value": UUID},
            {"key": "courseCode", "value": "CSB1101"},
            {"key": "code", "value": "R-REG-09.5"},
            {"key": "refresh_token", "value": ""},
        ],
        "item": [{"name": tag, "item": items} for tag, items in folders.items()],
    }
    OUT.write_text(json.dumps(collection, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(len(items) for items in folders.values())
    print(f"wrote {OUT.relative_to(ROOT)} with {total} requests in {len(folders)} folders")


if __name__ == "__main__":
    main()
