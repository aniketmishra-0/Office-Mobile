from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.field import CustomKeywordRule, FieldSchema


# Caps for public submission payloads. These block abuse where an attacker
# sends megabytes of data per submission or thousands of synthetic fields.
MAX_FIELDS_PER_SUBMISSION = 200
MAX_STRING_VALUE_LENGTH = 10_000


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


class CreateSheetRequest(BaseModel):
    form_title: str = Field(default="Untitled Form", min_length=1, max_length=120)
    worksheet_name: str | None = Field(default=None, max_length=100)
    fields: list[FieldSchema]


class CreateSheetResponse(BaseModel):
    spreadsheet_id: str
    sheet_url: str
    worksheet_name: str = "Sheet1"


class CreateFormRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10)
    spreadsheet_id: str
    worksheet_name: str | None = None
    form_title: str = Field(default="Untitled Form", min_length=1, max_length=120)
    description: str = Field(default="", max_length=10000)
    fields: list[FieldSchema]
    custom_keywords: list[CustomKeywordRule] = Field(default_factory=list)
    autofill_columns: list[str] = Field(default_factory=list, max_length=5)
    ui_config: dict | None = None


class CreateFormResponse(BaseModel):
    id: str
    edit_token: str
    form_url: str
    edit_url: str


class PublicFormResponse(BaseModel):
    id: str
    form_title: str
    description: str = ""
    worksheet_name: str | None = None
    fields: list[FieldSchema]
    autofill_columns: list[str] = Field(default_factory=list)
    ui_config: dict | None = None
    can_edit: bool = False


class EditFormResponse(BaseModel):
    id: str
    sheet_url: str
    spreadsheet_id: str
    worksheet_name: str | None = None
    form_title: str
    description: str = ""
    fields: list[FieldSchema]
    custom_keywords: list[CustomKeywordRule]
    autofill_columns: list[str] = Field(default_factory=list)
    ui_config: dict | None = None


class UpdateFormRequest(BaseModel):
    edit_token: str = Field(..., min_length=16)
    form_title: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=10000)
    fields: list[FieldSchema]
    custom_keywords: list[CustomKeywordRule] = Field(default_factory=list)
    autofill_columns: list[str] = Field(default_factory=list, max_length=5)
    ui_config: dict | None = None


class UpdateFormResponse(BaseModel):
    success: bool
    id: str


class UpdateBrandingRequest(BaseModel):
    edit_token: str | None = None
    logo_url: str | None = None
    design: str | None = None
    form_title: str | None = None
    company_name: str | None = None
    ui_config: dict | None = None


class SubmitFormRequest(BaseModel):
    values: dict[str, str | int | float | bool | None]

    @field_validator("values")
    @classmethod
    def _limit_payload_size(
        cls, v: dict[str, str | int | float | bool | None]
    ) -> dict[str, str | int | float | bool | None]:
        if len(v) > MAX_FIELDS_PER_SUBMISSION:
            raise ValueError(
                f"Too many fields: submissions may have at most {MAX_FIELDS_PER_SUBMISSION} entries"
            )
        for key, value in v.items():
            if isinstance(value, str) and len(value) > MAX_STRING_VALUE_LENGTH:
                raise ValueError(
                    f"Value for '{key}' exceeds the {MAX_STRING_VALUE_LENGTH}-character limit"
                )
        return v


class SubmitFormResponse(BaseModel):
    success: bool
    updated_range: str | None = None
    timestamp: str
    queued: bool = False
    message: str | None = None
    estimated_sync_seconds: int | None = None


class AddTabRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    tab_name: str = Field(..., min_length=1, max_length=100)
    headers: list[str] | None = Field(default=None, max_length=500)

    model_config = {"extra": "ignore"}


class UpdateRowRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    worksheet_name: str | None = Field(default=None, max_length=100)
    row_index: int = Field(..., ge=2)
    values: dict[str, str | int | float | bool | None]

    model_config = {"extra": "ignore"}

    @field_validator("values")
    @classmethod
    def _validate_values(
        cls, v: dict[str, str | int | float | bool | None]
    ) -> dict[str, str | int | float | bool | None]:
        if len(v) > MAX_FIELDS_PER_SUBMISSION:
            raise ValueError(
                f"Too many fields: row update may have at most {MAX_FIELDS_PER_SUBMISSION} entries"
            )
        for key, value in v.items():
            if len(key) > 500:
                raise ValueError("Field key exceeds 500 characters")
            if isinstance(value, str) and len(value) > MAX_STRING_VALUE_LENGTH:
                raise ValueError(
                    f"Value for '{key}' exceeds the {MAX_STRING_VALUE_LENGTH}-character limit"
                )
        return v


class DeleteFormRequest(BaseModel):
    token: str | None = Field(default=None, max_length=200)

    model_config = {"extra": "ignore"}


class BatchAppendRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    worksheet_name: str | None = Field(default=None, max_length=100)
    rows: list[dict[str, str]] = Field(..., min_length=1, max_length=200)

    model_config = {"extra": "ignore"}


class BatchAppendResponse(BaseModel):
    success: bool
    appended_count: int
    updated_range: str | None = None


class BatchDeleteRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    worksheet_name: str | None = Field(default=None, max_length=100)
    row_indices: list[int] = Field(..., min_length=1, max_length=500)

    model_config = {"extra": "ignore"}


class BatchDeleteResponse(BaseModel):
    success: bool
    deleted_count: int


class SingleRowUpdate(BaseModel):
    row_index: int = Field(..., ge=2)
    values: dict[str, Any] = Field(...)

    model_config = {"extra": "ignore"}

    @field_validator("values")
    @classmethod
    def _validate_values(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(v) > 200:
            raise ValueError("Too many fields in row update (max 200)")
        for key, val in v.items():
            if len(str(key)) > 500:
                raise ValueError("Header key exceeds 500 characters")
            if isinstance(val, str) and len(val) > 10000:
                raise ValueError(f"Value for '{key}' exceeds 10,000 character limit")
        return v


class BatchUpdateRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    worksheet_name: str | None = Field(default=None, max_length=100)
    row_updates: list[SingleRowUpdate] = Field(..., min_length=1, max_length=200)

    model_config = {"extra": "ignore"}


class BatchUpdateResponse(BaseModel):
    success: bool
    updated_count: int

