from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


FieldType = Literal["text", "tel", "email", "date", "time", "number", "textarea", "url", "file", "checkbox"]


class CustomKeywordRule(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=80)
    type: FieldType = "text"

    @field_validator("keyword")
    @classmethod
    def clean_keyword(cls, value: str) -> str:
        cleaned = " ".join(value.strip().lower().split())
        if not cleaned:
            raise ValueError("Keyword cannot be blank")
        return cleaned


class FieldSchema(BaseModel):
    key: str
    source_header: str
    label: str
    type: FieldType = "text"
    required: bool = False
    order: int
    column_index: int
    placeholder: str | None = None

    @field_validator("key")
    @classmethod
    def clean_key(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field key cannot be blank")
        return cleaned

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if not cleaned:
            raise ValueError("Field label cannot be blank")
        return cleaned
