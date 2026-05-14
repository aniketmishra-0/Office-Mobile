"""
AI Auto-Fill — Pattern detection from previous submissions.

Analyzes submission history to detect temporal patterns (day-of-week,
recurring values) and suggests pre-filled field values for the current
context. For example, if every Monday the user submits the same data,
this service will detect that and return those values as a suggestion.

Algorithm:
1. Fetch recent submissions for the form (from local DB).
2. Group submissions by day-of-week.
3. For each field, find the most common value on the current day-of-week.
4. If a value appears in ≥60% of submissions on that day, suggest it.
5. Also detect "always the same" patterns (field always has one value).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from app.db import fetchall
from app.services.form_store import _coerce_json, _iso


# Minimum submissions on a given day-of-week before we suggest patterns.
MIN_SAMPLES_FOR_DAY_PATTERN = 2

# Minimum ratio of a value's frequency to total submissions on that day.
DAY_PATTERN_THRESHOLD = 0.6

# Minimum ratio for "always the same" (global) pattern.
GLOBAL_PATTERN_THRESHOLD = 0.8

# Minimum total submissions before we attempt global pattern detection.
MIN_SAMPLES_FOR_GLOBAL = 3


def get_ai_suggestions(form_id: str) -> dict[str, Any]:
    """
    Analyze submission history and return AI-predicted field values.

    Returns:
        {
            "predictions": { "field_key": "predicted_value", ... },
            "confidence": { "field_key": 0.0-1.0, ... },
            "pattern_type": { "field_key": "day_of_week" | "recurring", ... },
            "context": {
                "current_day": "Monday",
                "total_submissions": 42,
                "day_submissions": 8,
            }
        }
    """
    now = datetime.now(timezone.utc)
    current_day = now.strftime("%A")  # e.g. "Monday"
    current_dow = now.weekday()  # 0=Monday, 6=Sunday

    # Fetch all submissions for this form (ordered by time desc, limit 500)
    rows = fetchall(
        """
        SELECT values_json, submitted_at
        FROM submissions
        WHERE form_id = %s
        ORDER BY submitted_at DESC
        LIMIT 500
        """,
        (form_id,),
    )

    if not rows:
        return {
            "predictions": {},
            "confidence": {},
            "pattern_type": {},
            "context": {
                "current_day": current_day,
                "total_submissions": 0,
                "day_submissions": 0,
            },
        }

    # Parse submissions and group by day-of-week
    all_values: list[dict[str, str]] = []
    day_values: defaultdict[int, list[dict[str, str]]] = defaultdict(list)

    for row in rows:
        values = _coerce_json(row.get("values_json")) or {}
        submitted_at = row.get("submitted_at")

        # Parse the timestamp to get day-of-week
        dow = _parse_dow(submitted_at)
        all_values.append(values)
        if dow is not None:
            day_values[dow].append(values)

    # Collect all field keys from submissions
    all_keys: set[str] = set()
    for v in all_values:
        all_keys.update(v.keys())

    predictions: dict[str, str] = {}
    confidence: dict[str, float] = {}
    pattern_type: dict[str, str] = {}

    same_day_submissions = day_values.get(current_dow, [])

    # Strategy 1: Day-of-week pattern detection
    if len(same_day_submissions) >= MIN_SAMPLES_FOR_DAY_PATTERN:
        for key in all_keys:
            day_counter = Counter(
                str(sub.get(key, "")).strip()
                for sub in same_day_submissions
                if str(sub.get(key, "")).strip()  # skip empty
            )
            if not day_counter:
                continue

            most_common_val, most_common_count = day_counter.most_common(1)[0]
            total_non_empty = sum(day_counter.values())
            ratio = most_common_count / total_non_empty

            if ratio >= DAY_PATTERN_THRESHOLD and most_common_val:
                predictions[key] = most_common_val
                confidence[key] = round(ratio, 2)
                pattern_type[key] = "day_of_week"

    # Strategy 2: Global recurring pattern (field always has the same value)
    if len(all_values) >= MIN_SAMPLES_FOR_GLOBAL:
        for key in all_keys:
            if key in predictions:
                continue  # day-of-week pattern takes priority

            global_counter = Counter(
                str(sub.get(key, "")).strip()
                for sub in all_values
                if str(sub.get(key, "")).strip()
            )
            if not global_counter:
                continue

            most_common_val, most_common_count = global_counter.most_common(1)[0]
            total_non_empty = sum(global_counter.values())
            ratio = most_common_count / total_non_empty

            if ratio >= GLOBAL_PATTERN_THRESHOLD and most_common_val:
                predictions[key] = most_common_val
                confidence[key] = round(ratio, 2)
                pattern_type[key] = "recurring"

    return {
        "predictions": predictions,
        "confidence": confidence,
        "pattern_type": pattern_type,
        "context": {
            "current_day": current_day,
            "total_submissions": len(all_values),
            "day_submissions": len(same_day_submissions),
        },
    }


def _parse_dow(submitted_at: Any) -> int | None:
    """Extract day-of-week (0=Monday) from a timestamp value."""
    if submitted_at is None:
        return None
    if isinstance(submitted_at, datetime):
        return submitted_at.weekday()
    # Try parsing ISO string
    ts_str = str(submitted_at)
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(ts_str[:26].rstrip("Z") + "+0000" if "Z" in ts_str else ts_str[:26], fmt)
            return dt.weekday()
        except (ValueError, IndexError):
            continue
    # Last resort: try dateutil-style parse
    try:
        from datetime import date
        # Just try the first 10 chars as a date
        dt = datetime.strptime(ts_str[:10], "%Y-%m-%d")
        return dt.weekday()
    except (ValueError, IndexError):
        return None
