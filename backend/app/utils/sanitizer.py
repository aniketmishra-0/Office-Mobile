from __future__ import annotations

import re

from app.models.field import CustomKeywordRule, FieldSchema
from app.services.field_inferrer import infer_field_type


REQUIRED_MARKERS = ("*", "(required)", "[required]")


def clean_display_label(raw_header: str) -> str:
    label = raw_header.strip()
    label = label.replace("*", "")
    label = re.sub(r"\((required|required field)\)", "", label, flags=re.IGNORECASE)
    label = re.sub(r"\[(required|required field)\]", "", label, flags=re.IGNORECASE)
    label = re.sub(r"[_\-]+", " ", label)
    label = re.sub(r"\s+", " ", label).strip()
    return label or "Untitled Field"


def is_required_header(raw_header: str) -> bool:
    lowered = raw_header.lower()
    return any(marker in lowered for marker in REQUIRED_MARKERS)


def make_field_key(label: str, fallback_order: int) -> str:
    key = label.strip().lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    key = re.sub(r"_+", "_", key).strip("_")
    if not key:
        key = f"field_{fallback_order + 1}"
    if key[0].isdigit():
        key = f"field_{key}"
    return key


def headers_to_fields(
    raw_headers: list[str],
    custom_keywords: list[CustomKeywordRule] | None = None,
) -> tuple[list[FieldSchema], list[str]]:
    fields: list[FieldSchema] = []
    warnings: list[str] = []
    seen_keys: dict[str, int] = {}

    for column_index, raw_value in enumerate(raw_headers):
        source_header = str(raw_value or "").strip()
        if not source_header:
            warnings.append(f"Skipped blank header at column {column_index + 1}.")
            continue

        label = clean_display_label(source_header)
        base_key = make_field_key(label, len(fields))
        key_count = seen_keys.get(base_key, 0)
        seen_keys[base_key] = key_count + 1
        key = base_key if key_count == 0 else f"{base_key}_{key_count + 1}"

        if key_count > 0:
            warnings.append(f"Duplicate header '{label}' was renamed internally to '{key}'.")

        fields.append(
            FieldSchema(
                key=key,
                source_header=source_header,
                label=label,
                type=infer_field_type(source_header, custom_keywords),
                required=is_required_header(source_header),
                order=len(fields),
                column_index=column_index,
                placeholder=f"Enter {label.lower()}",
            )
        )

    return fields, warnings
