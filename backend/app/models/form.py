from __future__ import annotations

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
