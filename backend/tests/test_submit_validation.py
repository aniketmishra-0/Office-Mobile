"""
Tests for SubmitFormRequest payload caps that defend against abuse.
"""

import pytest
from pydantic import ValidationError

from app.models.form import (
    MAX_FIELDS_PER_SUBMISSION,
    MAX_STRING_VALUE_LENGTH,
    SubmitFormRequest,
)


def test_normal_submission_is_accepted():
    req = SubmitFormRequest(values={"name": "Alice", "age": 30})
    assert req.values["name"] == "Alice"


def test_rejects_too_many_fields():
    too_many = {f"f_{i}": "x" for i in range(MAX_FIELDS_PER_SUBMISSION + 1)}
    with pytest.raises(ValidationError) as exc:
        SubmitFormRequest(values=too_many)
    assert "Too many fields" in str(exc.value)


def test_rejects_oversized_string_value():
    big = "a" * (MAX_STRING_VALUE_LENGTH + 1)
    with pytest.raises(ValidationError) as exc:
        SubmitFormRequest(values={"notes": big})
    assert "exceeds" in str(exc.value)


def test_allows_boundary_sized_string():
    just_fits = "a" * MAX_STRING_VALUE_LENGTH
    req = SubmitFormRequest(values={"notes": just_fits})
    assert len(req.values["notes"]) == MAX_STRING_VALUE_LENGTH


def test_numeric_values_not_length_checked():
    # Only strings are length-capped; a huge int is fine (gspread will
    # store it as a number).
    req = SubmitFormRequest(values={"count": 10**18})
    assert req.values["count"] == 10**18
