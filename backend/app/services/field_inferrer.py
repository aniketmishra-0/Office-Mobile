from __future__ import annotations

import re

from app.models.field import CustomKeywordRule, FieldType


DEFAULT_RULES: list[tuple[list[str], FieldType]] = [
    (["email", "e-mail"], "email"),
    (["phone", "mobile", "contact", "whatsapp", "cell"], "tel"),
    (["date", "dob", "birthday", "birth date", "joining", "deadline"], "date"),
    (["time", "hour", "slot"], "time"),
    (["amount", "price", "cost", "salary", "fee", "count", "qty", "quantity", "number", "no.", "age"], "number"),
    (["notes", "note", "comment", "description", "address", "remarks", "feedback", "details", "message"], "textarea"),
    (["url", "link", "website"], "url"),
    (["photo", "image", "upload", "file", "receipt", "document", "signature", "pic", "picture", "attachment"], "file"),
    (["checked", "verified", "done", "completed", "approved", "confirm", "active", "enabled", "yes/no", "y/n"], "checkbox"),
    (["name", "full name", "first name", "last name"], "text"),
]


def normalize_for_match(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def infer_field_type(header: str, custom_keywords: list[CustomKeywordRule] | None = None) -> FieldType:
    normalized_header = normalize_for_match(header)

    for rule in custom_keywords or []:
        keyword = normalize_for_match(rule.keyword)
        if keyword and keyword in normalized_header:
            return rule.type

    for keywords, field_type in DEFAULT_RULES:
        if any(keyword in normalized_header for keyword in keywords):
            return field_type

    return "text"
