"""
Tests for app.utils.sanitizer.headers_to_fields
"""

from app.utils.sanitizer import headers_to_fields


class TestNormalHeaders:
    """Happy-path: well-formed column headers produce fully-populated FieldSchema objects."""

    def test_correct_keys_labels_types_orders_column_indices(self):
        fields, warnings = headers_to_fields(["Full Name", "Email", "Phone Number"])

        assert len(warnings) == 0
        assert len(fields) == 3

        name_f = fields[0]
        assert name_f.key == "full_name"
        assert name_f.label == "Full Name"
        assert name_f.type == "text"
        assert name_f.order == 0
        assert name_f.column_index == 0
        assert name_f.required is False
        assert name_f.source_header == "Full Name"

        email_f = fields[1]
        assert email_f.key == "email"
        assert email_f.label == "Email"
        assert email_f.type == "email"
        assert email_f.order == 1
        assert email_f.column_index == 1

        phone_f = fields[2]
        assert phone_f.key == "phone_number"
        assert phone_f.label == "Phone Number"
        assert phone_f.type == "tel"
        assert phone_f.order == 2
        assert phone_f.column_index == 2

    def test_single_header_produces_single_field(self):
        fields, warnings = headers_to_fields(["Notes"])
        assert len(fields) == 1
        assert fields[0].key == "notes"
        assert fields[0].type == "textarea"


class TestBlankHeaders:
    """Blank (empty / whitespace-only) cells in row 1 must be silently skipped."""

    def test_blank_header_in_middle_is_skipped_and_warns(self):
        fields, warnings = headers_to_fields(["Name", "", "Email"])

        # Blank column at position 1 must be dropped
        assert len(fields) == 2
        assert len(warnings) == 1
        assert "blank" in warnings[0].lower()

    def test_skipped_blank_column_preserves_real_column_indices(self):
        """column_index must reflect the *actual* spreadsheet column, not a re-indexed position."""
        fields, _ = headers_to_fields(["Name", "", "Email"])

        assert fields[0].column_index == 0  # column A
        assert fields[1].column_index == 2  # column C (B was blank)

    def test_blank_header_at_end_is_skipped(self):
        fields, warnings = headers_to_fields(["Name", ""])
        assert len(fields) == 1
        assert len(warnings) == 1


class TestRequiredMarkers:
    """Headers marked with * or (required) must set required=True and clean the label."""

    def test_star_suffix_marks_field_as_required(self):
        fields, _ = headers_to_fields(["Name*"])
        assert fields[0].required is True

    def test_star_is_stripped_from_label(self):
        fields, _ = headers_to_fields(["Name*"])
        assert "*" not in fields[0].label
        assert fields[0].label == "Name"

    def test_parenthesised_required_marks_field_as_required(self):
        fields, _ = headers_to_fields(["Name (required)"])
        assert fields[0].required is True

    def test_parenthesised_required_is_stripped_from_label(self):
        fields, _ = headers_to_fields(["Name (required)"])
        assert "(required)" not in fields[0].label.lower()
        assert fields[0].label == "Name"

    def test_non_marked_field_is_not_required(self):
        fields, _ = headers_to_fields(["Name"])
        assert fields[0].required is False


class TestDuplicateHeaders:
    """Duplicate column names must be disambiguated with a numeric suffix."""

    def test_first_duplicate_keeps_base_key(self):
        fields, _ = headers_to_fields(["Name", "Name"])
        assert fields[0].key == "name"

    def test_second_duplicate_gets_underscore_2_suffix(self):
        fields, _ = headers_to_fields(["Name", "Name"])
        assert fields[1].key == "name_2"

    def test_duplicate_generates_exactly_one_warning(self):
        _, warnings = headers_to_fields(["Name", "Name"])
        assert len(warnings) == 1

    def test_duplicate_warning_mentions_new_key(self):
        _, warnings = headers_to_fields(["Name", "Name"])
        assert "name_2" in warnings[0]

    def test_three_duplicates_produce_sequential_suffixes(self):
        fields, warnings = headers_to_fields(["Score", "Score", "Score"])
        assert fields[0].key == "score"
        assert fields[1].key == "score_2"
        assert fields[2].key == "score_3"
        assert len(warnings) == 2


class TestLabelFormatting:
    """clean_display_label must replace separators with spaces but not alter casing."""

    def test_underscore_in_header_becomes_space_in_label(self):
        fields, _ = headers_to_fields(["Full_Name"])
        assert fields[0].label == "Full Name"

    def test_hyphen_in_header_becomes_space_in_label(self):
        fields, _ = headers_to_fields(["Last-Name"])
        assert fields[0].label == "Last Name"

    def test_all_caps_header_case_is_preserved_in_label(self):
        """
        clean_display_label does NOT perform any case folding.
        An ALL-CAPS header stays ALL-CAPS in the label.
        """
        fields, _ = headers_to_fields(["NOTES"])
        assert fields[0].label == "NOTES"

    def test_mixed_case_header_is_preserved_in_label(self):
        """No title-casing or lower-casing is applied."""
        fields, _ = headers_to_fields(["myWebsite"])
        assert fields[0].label == "myWebsite"
