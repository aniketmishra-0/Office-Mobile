"""
Tests for app.services.field_inferrer.infer_field_type
"""

from app.models.field import CustomKeywordRule
from app.services.field_inferrer import infer_field_type


class TestDefaultRules:
    """Verify every default keyword bucket maps to the right FieldType."""

    def test_email_header_returns_email(self):
        assert infer_field_type("email") == "email"

    def test_phone_number_header_returns_tel(self):
        assert infer_field_type("Phone Number") == "tel"

    def test_mobile_header_returns_tel(self):
        assert infer_field_type("Mobile") == "tel"

    def test_date_of_birth_header_returns_date(self):
        assert infer_field_type("Date of Birth") == "date"

    def test_amount_header_returns_number(self):
        assert infer_field_type("Amount") == "number"

    def test_notes_header_returns_textarea(self):
        assert infer_field_type("Notes") == "textarea"

    def test_website_header_returns_url(self):
        assert infer_field_type("Website") == "url"

    def test_full_name_header_returns_text(self):
        assert infer_field_type("Full Name") == "text"

    def test_completely_unknown_header_returns_text(self):
        assert infer_field_type("unknown column xyz") == "text"


class TestCustomKeywordRules:
    """Custom keyword rules are checked before default rules."""

    def test_custom_aadhaar_keyword_returns_number(self):
        """keyword='aadhaar', type='number' → 'Aadhaar Number' should return 'number'."""
        rules = [CustomKeywordRule(keyword="aadhaar", type="number")]
        assert infer_field_type("Aadhaar Number", rules) == "number"

    def test_custom_pincode_keyword_returns_number(self):
        """keyword='pincode', type='number' → 'Pincode' should return 'number'."""
        rules = [CustomKeywordRule(keyword="pincode", type="number")]
        assert infer_field_type("Pincode", rules) == "number"

    def test_custom_rule_takes_priority_over_default_rule(self):
        """
        If a custom rule maps 'email' → 'text', that overrides the default
        'email' → 'email' mapping, so infer_field_type("email", rules) == 'text'.
        """
        rules = [CustomKeywordRule(keyword="email", type="text")]
        assert infer_field_type("email", rules) == "text"

    def test_no_custom_rules_falls_back_to_defaults(self):
        """Passing an empty list is equivalent to passing None — defaults still apply."""
        assert infer_field_type("email", []) == "email"

    def test_non_matching_custom_rule_falls_back_to_default(self):
        """A custom rule that does not match the header leaves the default untouched."""
        rules = [CustomKeywordRule(keyword="gstin", type="text")]
        assert infer_field_type("email", rules) == "email"

    def test_custom_keyword_match_is_case_insensitive(self):
        """Keyword matching normalises both the keyword and the header to lowercase."""
        rules = [CustomKeywordRule(keyword="AADHAAR", type="number")]
        assert infer_field_type("Aadhaar Card Number", rules) == "number"
