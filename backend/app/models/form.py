from __future__ import annotations

from pydantic import BaseModel, Field, HttpUrl

from app.models.field import CustomKeywordRule, FieldSchema


class PreviewRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10)
    worksheet_name: str | None = None
    custom_keywords: list[CustomKeywordRule] = Field(default_factory=list)


class PreviewResponse(BaseModel):
    spreadsheet_id: str
    sheet_url: str
    spreadsheet_title: str
    worksheet_name: str
    form_title: str
    fields: list[FieldSchema]
    custom_keywords: list[CustomKeywordRule]
    warnings: list[str] = Field(default_factory=list)


class CreateFormRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10)
    spreadsheet_id: str
    worksheet_name: str | None = None
    form_title: str = Field(default="Untitled Form", min_length=1, max_length=120)
    fields: list[FieldSchema]
    custom_keywords: list[CustomKeywordRule] = Field(default_factory=list)
    autofill_columns: list[str] = Field(default_factory=list, max_length=5)


class CreateFormResponse(BaseModel):
    id: str
    edit_token: str
    form_url: str
    edit_url: str


class PublicFormResponse(BaseModel):
    id: str
    form_title: str
    worksheet_name: str | None = None
    fields: list[FieldSchema]
    autofill_columns: list[str] = Field(default_factory=list)


class EditFormResponse(BaseModel):
    id: str
    sheet_url: str
    spreadsheet_id: str
    worksheet_name: str | None = None
    form_title: str
    fields: list[FieldSchema]
    custom_keywords: list[CustomKeywordRule]
    autofill_columns: list[str] = Field(default_factory=list)


class UpdateFormRequest(BaseModel):
    edit_token: str = Field(..., min_length=16)
    form_title: str = Field(..., min_length=1, max_length=120)
    fields: list[FieldSchema]
    custom_keywords: list[CustomKeywordRule] = Field(default_factory=list)
    autofill_columns: list[str] = Field(default_factory=list, max_length=5)


class UpdateFormResponse(BaseModel):
    success: bool
    id: str


class SubmitFormRequest(BaseModel):
    values: dict[str, str | int | float | bool | None]


class SubmitFormResponse(BaseModel):
    success: bool
    updated_range: str | None = None
    timestamp: str
