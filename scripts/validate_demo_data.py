#!/usr/bin/env python3
"""Validate the two-patient demo snapshot without contacting any service.

Usage: python scripts/validate_demo_data.py [--self-test]
The optional self-test mutates in-memory copies to prove unsafe seeds fail.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
from datetime import date, datetime, timedelta
import hashlib
import json
from pathlib import Path
import re
import sys
import uuid
from zoneinfo import ZoneInfo

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    sys.exit("Missing jsonschema. Install scripts/requirements-demo.txt in a venv.")


ROOT = Path(__file__).resolve().parents[1]
KST = ZoneInfo("Asia/Seoul")
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "hani-soap.example/demo/v1")
ITEM_KEYS = {
    "chief_complaint", "pain", "function_daily", "treatment_response",
    "medication", "discomfort", "sleep", "appetite_digestion", "bowel_urine",
    "temperature_sweat_energy", "lifestyle", "questions_concerns",
}
COLLECTIONS = (
    "patients", "visits", "transcripts", "soap_documents", "treatments",
    "followup_answers", "observations", "followup_items", "medication_courses",
    "care_messages", "care_responses", "contact_tasks",
)
SCORING_INSTRUMENTS = {"NRS", "APP_FUNCTION_DISCOMFORT", "SYMPTOM_BOTHER"}
FORBIDDEN_TREATMENT_FIELDS = {
    "retention_minutes", "retention_time", "needle_retention_time",
    "drug_name", "concentration", "dose", "volume", "volume_ml",
}
UTC_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\Z")
FORMATS = FormatChecker()


@FORMATS.checks("date-time", raises=(ValueError, TypeError))
def is_utc_timestamp(value):
    # Built-in validation avoids silently skipping optional jsonschema formats.
    return isinstance(value, str) and bool(UTC_PATTERN.fullmatch(value)) and (
        datetime.fromisoformat(value.replace("Z", "+00:00")).utcoffset().total_seconds() == 0
    )


@FORMATS.checks("date", raises=(ValueError, TypeError))
def is_date(value):
    return isinstance(value, str) and date.fromisoformat(value).isoformat() == value


@FORMATS.checks("uuid", raises=(ValueError, TypeError, AttributeError))
def is_uuid(value):
    return isinstance(value, str) and str(uuid.UUID(value)) == value


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def local_date(value):
    return timestamp(value).astimezone(KST).date()


def stable_id(key):
    return str(uuid.uuid5(NAMESPACE, key))


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate(data, schema, root=ROOT):
    """Return errors; schema failures short-circuit unsafe relational traversal."""
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FORMATS)
    errors = [
        "schema:" + "/".join(str(x) for x in error.absolute_path) + ": " + error.message
        for error in sorted(validator.iter_errors(data), key=lambda error: str(error.absolute_path))
    ]
    if errors:
        return errors

    def require(condition, message):
        if not condition:
            errors.append(message)

    require(schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema", "schema draft must be 2020-12")
    clinic = data["clinic"]["id"]
    require(clinic == stable_id("clinic"), "clinic UUID is not reproducible")
    snapshot_at = timestamp(data["meta"]["generated_at"])
    today = date.fromisoformat(data["meta"]["demo_today"])
    require(snapshot_at.astimezone(KST).date() == today, "snapshot KST date must equal demo_today")
    indexes = {name: {row["id"]: row for row in data[name]} for name in COLLECTIONS}
    all_ids = {clinic}
    owner = {}
    for name in COLLECTIONS:
        for row in data[name]:
            rid = row["id"]
            require(rid not in all_ids, f"duplicate ID: {name}/{rid}")
            all_ids.add(rid)
            require(uuid.UUID(rid).version == 5, f"ID must use stable UUID v5: {name}/{rid}")
            require(row["clinic_id"] == clinic, f"clinic mismatch: {name}/{rid}")
            if "patient_id" in row:
                require(row["patient_id"] in indexes["patients"], f"unknown patient: {name}/{rid}")
                owner[rid] = row["patient_id"]
            elif name == "patients":
                owner[rid] = rid
    patients = indexes["patients"]
    visits = indexes["visits"]
    if {p["demo_key"] for p in patients.values()} != {"A", "B"}:
        return errors + ["exactly one patient A and B required"]
    for patient in patients.values():
        key = patient["demo_key"]
        require(patient["id"] == stable_id("patient/" + key), f"patient UUID not reproducible: {key}")
        age = today.year - date.fromisoformat(patient["birth_date"]).year - (
            (today.month, today.day) < (date.fromisoformat(patient["birth_date"]).month, date.fromisoformat(patient["birth_date"]).day)
        )
        require(20 <= age < 30 if key == "A" else age == 6, f"incorrect demo age: {key}")
        require(patient["sex"] == ("female" if key == "A" else "male"), f"incorrect case sex: {key}")
        require(patient["guardian"] is not None if key == "B" else patient["guardian"] is None, f"guardian binding mismatch: {key}")
        require(patient["portrait_asset_key"] == ("demo-adult-01" if key == "A" else "demo-child-01"), f"portrait binding mismatch: {key}")
        require(patient["contact_phone"] is None and patient["contact_email"] is None, f"real contact details forbidden: {key}")
        require(patient["notes"] and "합성" in patient["notes"], f"synthetic identity must be labelled: {key}")

    def related(row, foreign_key, table, optional=False):
        target_id = row.get(foreign_key)
        if target_id is None and optional:
            return None
        target = indexes[table].get(target_id)
        require(target is not None, f"unknown {foreign_key}: {row.get('id', 'scenario')}")
        if target is not None:
            require(target["clinic_id"] == row.get("clinic_id", clinic), f"cross-clinic {foreign_key}")
            if row.get("patient_id") and target.get("patient_id"):
                require(row["patient_id"] == target["patient_id"], f"cross-patient {foreign_key}: {row.get('id')}")
        return target

    visits_by_patient = defaultdict(list)
    for visit in visits.values():
        visits_by_patient[visit["patient_id"]].append(visit)
        patient = patients.get(visit["patient_id"])
        if patient:
            require(visit["id"] == stable_id(f"visit/{patient['demo_key']}/{visit['visit_no']}"), f"visit UUID not reproducible: {visit['id']}")
        scheduled = timestamp(visit["scheduled_at"])
        start = timestamp(visit["started_at"]) if visit["started_at"] else None
        end = timestamp(visit["completed_at"]) if visit["completed_at"] else None
        if start:
            require(start <= snapshot_at, f"future actual visit start: {visit['id']}")
            require(start.date() >= scheduled.date(), f"visit starts before scheduled date: {visit['id']}")
        if visit["workflow_status"] == "waiting":
            require(start is None and end is None, f"waiting visit has start/end: {visit['id']}")
        elif visit["workflow_status"] == "in_progress":
            require(start is not None and end is None, f"active visit timestamps invalid: {visit['id']}")
        else:
            require(start is not None and end is not None, f"completed visit missing timestamps: {visit['id']}")
        if end and start:
            require(start <= end <= snapshot_at, f"invalid visit time order: {visit['id']}")
    for patient_id, rows in visits_by_patient.items():
        rows.sort(key=lambda row: row["visit_no"])
        require([row["visit_no"] for row in rows] == list(range(1, len(rows) + 1)), f"visit numbers not continuous: {patient_id}")
        require([row["scheduled_at"] for row in rows] == sorted(row["scheduled_at"] for row in rows), f"visit order not chronological: {patient_id}")

    for table in ("transcripts", "soap_documents", "treatments", "followup_answers", "observations", "care_messages"):
        for row in data[table]:
            visit = related(row, "visit_id", "visits")
            if visit:
                owner[row["id"]] = visit["patient_id"]

    for table in ("transcripts", "soap_documents"):
        seen_revisions = set()
        for row in data[table]:
            revision_key = (row["visit_id"], row["revision"])
            require(revision_key not in seen_revisions, f"duplicate {table} revision: {revision_key}")
            seen_revisions.add(revision_key)

    for transcript in data["transcripts"]:
        require([segment["ordinal"] for segment in transcript["segments"]] == list(range(1, len(transcript["segments"]) + 1)), f"segment ordinal order: {transcript['id']}")
        for segment in transcript["segments"]:
            require(segment["id"] not in all_ids, f"duplicate segment ID: {segment['id']}")
            all_ids.add(segment["id"])
            owner[segment["id"]] = owner.get(transcript["id"])
            require((segment["start_ms"] is None) == (segment["end_ms"] is None), f"partial segment timing: {segment['id']}")
            if segment["start_ms"] is not None and segment["end_ms"] is not None:
                require(segment["start_ms"] <= segment["end_ms"], f"segment timing reversed: {segment['id']}")

    by_visit = defaultdict(list)
    unique_answers = set()
    for row in data["followup_answers"]:
        by_visit[row["visit_id"]].append(row)
        key = (row["visit_id"], row["item_key"], row["subitem_key"])
        require(key not in unique_answers, f"duplicate follow-up subitem: {key}")
        unique_answers.add(key)
        compare = related(row, "comparison_visit_id", "visits", optional=True)
        if compare and row["visit_id"] in visits:
            require(timestamp(compare["scheduled_at"]) < timestamp(visits[row["visit_id"]]["scheduled_at"]), f"comparison must be an earlier same-patient visit: {row['id']}")
        if row["confirmation_status"] == "not_confirmed":
            require(row["answer_text"] is None and row["change"] is None, f"unasked answer contains a value/change: {row['id']}")
        else:
            require(bool(row["answer_text"]) and bool(row["source_refs"]), f"answered question missing text/evidence: {row['id']}")
        if row["change"] is not None:
            require(compare is not None and row["applicability"] == "applicable", f"change has no comparison/applicability: {row['id']}")
        if row["applicability"] == "not_applicable":
            require(row["change"] is None, f"not-applicable answer cannot have change: {row['id']}")
    for visit in visits.values():
        require({row["item_key"] for row in by_visit[visit["id"]]} == ITEM_KEYS, f"visit must expose all 12 categories: {visit['id']}")

    current_visits = set()
    require({row["demo_key"] for row in data["scenario_inputs"]} == {"A", "B"}, "scenario inputs must bind A and B once")
    for scenario in data["scenario_inputs"]:
        visit = related(scenario, "current_visit_id", "visits")
        patient = patients.get(scenario["patient_id"])
        require(patient is not None and patient["demo_key"] == scenario["demo_key"], "scenario patient key mismatch")
        if not visit:
            continue
        current_visits.add(visit["id"])
        require(local_date(visit["scheduled_at"]) == today, "current visit must be demo_today in KST")
        require(visit["workflow_status"] == "waiting" and visit["record_status"] == "empty", "current demo starts waiting with empty record")
        require(len(by_visit[visit["id"]]) == 12, "current visit must start with exactly 12 empty question rows")
        for row in by_visit[visit["id"]]:
            require(row["answer_text"] is None and row["change"] is None and row["confirmation_status"] == "not_confirmed" and row["applicability"] == "unknown" and row["comparison_visit_id"] is None and not row["source_refs"] and row["review_status"] == "draft", f"current answer must not copy history: {row['id']}")
        for source in scenario["source_documents"]:
            require((root / source).is_file(), f"missing scenario source: {source}")
        require(scenario["provided_audio_key"] == ("video1" if scenario["demo_key"] == "A" else "video2"), "provided case audio binding mismatch")
        require(scenario["followup_script_key"] == ("revisit_script" if scenario["demo_key"] == "A" else None), "follow-up script binding mismatch")
    require(not any(row["visit_id"] in current_visits for row in data["transcripts"]), "current visit must not contain a preprocessed transcript")

    soaps_by_visit = defaultdict(list)
    for row in data["soap_documents"]:
        soaps_by_visit[row["visit_id"]].append(row)
        transcript = related(row, "input_transcript_id", "transcripts", optional=True)
        if transcript:
            require(transcript["visit_id"] == row["visit_id"], "SOAP input transcript belongs to another visit")
        if row["status"] == "approved":
            require(bool(row["approved_at"]) and bool(row["approved_by"]), f"SOAP approval metadata missing: {row['id']}")
            if row["approved_at"]:
                require(timestamp(row["approved_at"]) <= snapshot_at, "SOAP approval is in future")
                visit = visits.get(row["visit_id"])
                if visit and visit["started_at"]:
                    require(timestamp(visit["started_at"]) <= timestamp(row["approved_at"]), "SOAP approval precedes visit start")
        else:
            require(row["approved_at"] is None and row["approved_by"] is None, "draft SOAP carries approval")
    for visit in visits.values():
        rows = soaps_by_visit[visit["id"]]
        if visit["record_status"] == "empty":
            require(not rows, "empty visit has SOAP document")
        elif visit["record_status"] == "approved":
            require(bool(rows) and max(rows, key=lambda row: row["revision"])["status"] == "approved", "approved visit has no approved current SOAP")
        else:
            require(bool(rows) and max(rows, key=lambda row: row["revision"])["status"] == "draft", "draft/review visit missing draft SOAP")

    series_signatures = {}
    observation_keys = set()
    for row in data["observations"]:
        visit = visits.get(row["visit_id"])
        answer = related(row, "followup_answer_id", "followup_answers", optional=True)
        if answer:
            require(answer["visit_id"] == row["visit_id"], "observation answer belongs to another visit")
            require(answer["confirmation_status"] != "not_confirmed", "observation has an unconfirmed answer")
        require(row["visit_id"] not in current_visits, "current visit must start without measured values")
        require(timestamp(row["measured_at"]) <= snapshot_at, "future observation")
        if visit and visit["started_at"] and visit["completed_at"]:
            require(timestamp(visit["started_at"]) <= timestamp(row["measured_at"]) <= timestamp(visit["completed_at"]), "observation outside visit")
        if row["instrument"] in SCORING_INSTRUMENTS:
            require(row["scale_min"] == 0 and row["scale_max"] == 10 and row["unit"] == "score" and 0 <= row["value"] <= 10, "0–10 score out of bounds or mislabelled")
        elif row["instrument"] == "FREQUENCY":
            require(row["value"] >= 0 and float(row["value"]).is_integer(), "frequency must be a nonnegative whole count")
            require(row["unit"] != "score", "frequency cannot use score units")
        if row["instrument"] == "NRS":
            require(row["metric_key"] == "pain_intensity" and row["body_region"] and row["laterality"], "NRS requires pain, region and laterality")
        if row["instrument"] == "APP_FUNCTION_DISCOMFORT":
            require(bool(row["activity_key"]), "function score requires specific activity")
        signature = tuple(row[key] for key in ("patient_id", "metric_key", "instrument", "unit", "scale_min", "scale_max", "body_region", "laterality", "activity_key", "measurement_context"))
        if row["series_key"] in series_signatures:
            require(series_signatures[row["series_key"]] == signature, "series mixes patients, instruments, sites, activities or conditions")
        series_signatures[row["series_key"]] = signature
        observation_key = (row["visit_id"], row["series_key"])
        require(observation_key not in observation_keys, "duplicate measurement for same visit/series")
        observation_keys.add(observation_key)
    patient_a = next(row for row in patients.values() if row["demo_key"] == "A")
    a_scores = sorted((row for row in data["observations"] if row["patient_id"] == patient_a["id"] and row["instrument"] == "NRS"), key=lambda row: row["measured_at"])
    require([row["value"] for row in a_scores] == [8, 7, 6], "A historical NRS must be 8, 7, 6; today's 5 is live input")
    patient_b = next(row for row in patients.values() if row["demo_key"] == "B")
    b_scores = [row for row in data["observations"] if row["patient_id"] == patient_b["id"]]
    require(len(b_scores) == 1 and b_scores[0]["instrument"] == "FREQUENCY" and b_scores[0]["value"] == 2, "B only has supplied initial nighttime frequency; do not invent pain/improvement scores")
    if b_scores:
        require(b_scores[0]["metric_key"] == "nocturnal_wetting_frequency" and b_scores[0]["unit"] == "episodes_per_night", "B must retain pediatric enuresis terminology rather than adult nocturia/toilet trips")
        require("wakes_after_wetting" in b_scores[0]["measurement_context"], "B's verified report is waking after wetting, not nighttime toilet visits")

    for row in data["treatments"]:
        require(not (FORBIDDEN_TREATMENT_FIELDS & row.keys()), "excluded treatment details present")
        require(row["visit_id"] not in current_visits, "no preselected treatment in current visit")
        require(row["technique"] is None if row["modality"] != "acupuncture" else True, "needle technique attached to wrong modality")
        require(len({point["code"] for point in row["acupoints"]}) == len(row["acupoints"]), "duplicate acupoint in one treatment")
        require(not any(point["label_ko"] in {"아시혈", "압통점"} for point in row["acupoints"]), "uncoded ashi/tenderness must not acquire a legacy clinical code")
        if row["origin"] == "provided_case":
            require(row["status"] == "suggested", "provided-case treatment plans must not become performed/confirmed")
        if "locations" in row:
            coded_locations = set()
            for location in row["locations"]:
                if location["location_type"] == "acupoint":
                    require(bool(location["acupoint_code"] and location["acupoint_code"].strip()), "coded acupoint requires a nonblank clinical code")
                    coded_locations.add(location["acupoint_code"])
                else:
                    require(location["acupoint_code"] is None and bool(location["location_note"].strip()), "ashi/tenderness needs null code and an actual location description")
            require({point["code"] for point in row["acupoints"]} == coded_locations, "legacy acupoints may project only explicitly coded locations; never assign codes from uncoded location proximity")

    for row in data["medication_courses"]:
        visit = related(row, "source_visit_id", "visits")
        require(row["end_date"] is None or row["start_date"] <= row["end_date"], "medication dates reversed")
        if visit:
            require(date.fromisoformat(row["start_date"]) >= timestamp(visit["scheduled_at"]).date(), "medication starts before source visit")
        if row["patient_id"] == patient_a["id"]:
            require(row["medication_name"] is None and row["daily_frequency"] is None and row["end_date"] is None, "unknown A prescription/frequency must remain null")
        else:
            require(row["medication_name"] == "보중익기탕" and row["daily_frequency"] == 3 and row["end_date"] is None, "B medication differs from supplied case or invents end date")

    for row in data["followup_items"]:
        source_visit = related(row, "source_visit_id", "visits")
        resolved = related(row, "resolved_visit_id", "visits", optional=True)
        if row["status"] == "pending":
            require(resolved is None, "pending item has resolution visit")
        else:
            require(resolved is not None, "resolved item missing visit")
            if resolved and source_visit:
                require(timestamp(resolved["scheduled_at"]) >= timestamp(source_visit["scheduled_at"]), "item resolved before source visit")

    for row in data["care_messages"]:
        course = related(row, "medication_course_id", "medication_courses", optional=True)
        visit = visits.get(row["visit_id"])
        if course:
            require(course["source_visit_id"] == row["visit_id"], "message medication course source visit mismatch")
            start_date = date.fromisoformat(course["start_date"])
            if row["stage"] == "day3":
                require(local_date(row["scheduled_at"]) == start_date + timedelta(days=2), "day3 must count medication start as day 1")
            elif row["stage"] == "week1":
                require(local_date(row["scheduled_at"]) == start_date + timedelta(days=7), "week1 must be medication start +7 days")
            elif row["stage"] == "end_minus3":
                require(course["end_date"] is not None, "end-minus-3 needs a confirmed medication end date")
                if course["end_date"]:
                    require(local_date(row["scheduled_at"]) == date.fromisoformat(course["end_date"]) - timedelta(days=3), "end-minus-3 schedule differs from known end date")
        require(row["delivery_mode"] in {"preview", "mock"}, "seed must not claim actual Kakao delivery")
        if row["status"] in {"approved", "sent", "failed", "unknown"}:
            require(bool(row["approved_body"]) and bool(row["approved_at"]), "non-draft message missing frozen approved body/time")
        else:
            require(row["approved_body"] is None and row["approved_at"] is None and row["delivered_at"] is None, "draft message carries approval/delivery")
        if row["approved_at"]:
            require(timestamp(row["approved_at"]) <= snapshot_at, "message approval in future")
            if visit and visit["started_at"]:
                require(timestamp(row["approved_at"]) >= timestamp(visit["started_at"]), "message approved before source visit")
        if row["status"] == "sent":
            require(row["delivered_at"] is not None, "sent message missing delivery time")
            require(row["delivery_mode"] == "mock", "preview is not a send result")
        else:
            require(row["delivered_at"] is None, "unsent message carries successful delivery time")
        if row["delivered_at"]:
            delivered = timestamp(row["delivered_at"])
            require(row["approved_at"] and timestamp(row["approved_at"]) <= delivered <= snapshot_at, "delivery occurs before approval or after snapshot")
            require(timestamp(row["scheduled_at"]) <= delivered, "delivery before scheduled send")

    event_keys = set()
    for row in data["care_responses"]:
        message = related(row, "message_id", "care_messages")
        require(row["source"] == "demo_simulation", "seed cannot claim a real Kakao response")
        require(row["event_key"] not in event_keys, "duplicate response event key")
        event_keys.add(row["event_key"])
        require(timestamp(row["received_at"]) <= snapshot_at, "future care response")
        if message:
            require(message["status"] == "sent" and bool(message["delivered_at"]), "response to an unsent message")
            if message["delivered_at"]:
                require(timestamp(row["received_at"]) >= timestamp(message["delivered_at"]), "response received before message")
        if row["option"] != "discomfort":
            require(row["detail"] is None, "non-discomfort response cannot have discomfort detail")

    tasks_by_response = defaultdict(list)
    for row in data["contact_tasks"]:
        response = related(row, "response_id", "care_responses")
        tasks_by_response[row["response_id"]].append(row)
        if row["status"] == "open":
            require(row["resolution_note"] is None and row["closed_by"] is None and row["closed_at"] is None, "open task carries closure metadata")
        else:
            require(bool(row["resolution_note"]) and bool(row["closed_by"]) and bool(row["closed_at"]), "closed task missing resolution metadata")
            if row["closed_at"] and response:
                require(timestamp(response["received_at"]) <= timestamp(row["closed_at"]) <= snapshot_at, "task closure occurs before response or in future")
    for row in data["care_responses"]:
        if row["option"] == "discomfort":
            require(len(tasks_by_response[row["id"]]) == 1, "discomfort needs a contact task even without detail")
    require(any(task["patient_id"] == patient_a["id"] and task["status"] == "open" for task in data["contact_tasks"]), "A's discomfort contact task must remain open")

    # Evidence must resolve to a real supplied file or a same-patient seed entity.
    for table in COLLECTIONS:
        for row in data[table]:
            for source in row.get("source_refs", []):
                sid = source["source_id"]
                if source["kind"] in {"seed_snapshot", "care_response", "demo_transcript"}:
                    require(sid in all_ids, f"unresolved seed evidence: {sid}")
                    if sid in owner and row["id"] in owner:
                        require(owner[sid] == owner[row["id"]], f"cross-patient evidence: {row['id']}")
                    if source["kind"] == "care_response":
                        require(sid in indexes["care_responses"], "care response evidence must resolve to response")
                elif sid and sid.startswith("docs/"):
                    source_path = root / sid
                    require(source_path.is_file(), f"missing evidence file: {sid}")
                    if source_path.is_file() and source["quote"]:
                        require(source["quote"] in source_path.read_text(encoding="utf-8"), f"evidence quote is not verbatim in {sid}")

    portrait_manifest = load(root / "data/demo/portrait-assets.json")
    assets = {asset["asset_key"]: asset for asset in portrait_manifest["assets"]}
    for patient in patients.values():
        asset = assets.get(patient["portrait_asset_key"])
        require(asset is not None, "portrait key missing from manifest")
        if asset:
            path = root / asset["path"]
            require(asset["synthetic"] is True and path.is_file(), "portrait must be an existing synthetic asset")
            if path.is_file():
                require(path.stat().st_size == asset["bytes"], "portrait size differs from manifest")
                require(hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"], "portrait checksum differs from manifest")
    return errors


def self_test(data, schema):
    """Mutation checks cover failures that JSON shape validation alone misses."""
    def edit(table, index, key, value):
        return lambda changed: changed[table][index].__setitem__(key, value)

    current_answer = next(i for i, row in enumerate(data["followup_answers"]) if row["visit_id"] == data["scenario_inputs"][0]["current_visit_id"])
    b_current_visit = data["scenario_inputs"][1]["current_visit_id"]
    mutations = {
        "malformed UUID": edit("patients", 0, "id", "invalid"),
        "malformed timestamp": edit("visits", 0, "scheduled_at", "not-a-date"),
        "non-UTC timestamp": edit("visits", 0, "scheduled_at", "2026-10-02T09:30:00+09:00"),
        "duplicate UUID": edit("treatments", 1, "id", data["treatments"][0]["id"]),
        "cross-clinic record": edit("visits", 0, "clinic_id", stable_id("other-clinic")),
        "cross-patient visit": edit("followup_answers", 0, "visit_id", b_current_visit),
        "reversed visit times": edit("visits", 0, "completed_at", "2026-10-01T00:00:00Z"),
        "missing question category": lambda changed: changed["followup_answers"].pop(current_answer),
        "copied current answer": edit("followup_answers", current_answer, "answer_text", "지난 답변을 오늘 답변으로 복사"),
        "preselected change": edit("followup_answers", current_answer, "change", "improved"),
        "NRS outside range": edit("observations", 0, "value", 11),
        "mixed NRS activity series": edit("observations", 1, "activity_key", "walking"),
        "frequency mixed into pain series": edit("observations", 3, "series_key", data["observations"][0]["series_key"]),
        "invented A prescription": edit("medication_courses", 0, "medication_name", "확인되지않은처방"),
        "current visit historical score": edit("observations", 2, "visit_id", data["scenario_inputs"][0]["current_visit_id"]),
        "unapproved sent message": edit("care_messages", 0, "approved_body", None),
        "response before delivery": edit("care_responses", 0, "received_at", "2026-10-04T07:00:00Z"),
        "day3 off-by-one schedule": edit("care_messages", 1, "scheduled_at", "2026-10-05T08:00:00Z"),
        "missing discomfort contact": lambda changed: changed["contact_tasks"].clear(),
        "false automatic closure": edit("contact_tasks", 0, "status", "closed"),
        "unknown photo binding": edit("patients", 0, "portrait_asset_key", "missing-portrait"),
        "excluded retention field": edit("treatments", 0, "retention_minutes", 15),
        "actual send claimed": edit("care_messages", 0, "delivery_mode", "kakao_self"),
        "preview mistaken for delivery": edit("care_messages", 0, "delivery_mode", "preview"),
        "enuresis mislabeled as nocturia": edit("observations", 3, "metric_key", "nighttime_toilet_visits"),
        "fabricated evidence quote": lambda changed: changed["soap_documents"][0]["source_refs"][0].__setitem__("quote", "원문에 없는 문자열"),
    }
    for label, mutate in mutations.items():
        changed = deepcopy(data)
        mutate(changed)
        if not validate(changed, schema):
            raise RuntimeError(f"Negative check failed to reject: {label}")
    # A coarse discomfort selection alone still needs its task.
    without_detail = deepcopy(data)
    without_detail["care_responses"][0]["detail"] = None
    if validate(without_detail, schema):
        raise RuntimeError("A discomfort response without detail must be valid with its task")
    without_detail["contact_tasks"].clear()
    if not validate(without_detail, schema):
        raise RuntimeError("Detail-free discomfort without its task was accepted")
    # Valid coded and uncoded locations coexist, but only the coded point projects
    # into legacy acupoints. These copies never populate the actual patient seed.
    with_locations = deepcopy(data)
    with_locations["treatments"][0]["locations"] = [
        {"location_type": "acupoint", "acupoint_code": "GB40", "label_ko": "구허", "body_region": "ankle", "laterality": "right", "location_note": "경계 검증용 코드 있는 경혈 후보", "annotation_id": None, "finding_ref": None},
        {"location_type": "ashi", "acupoint_code": None, "label_ko": "아시혈", "body_region": "ankle", "laterality": "right", "location_note": "경계 검증용 외과 아래 수기 표시 위치", "annotation_id": None, "finding_ref": None},
        {"location_type": "tenderness_point", "acupoint_code": None, "label_ko": "압통점", "body_region": "ankle", "laterality": "right", "location_note": "경계 검증용 발목 외측 수기 표시 위치", "annotation_id": None, "finding_ref": None},
    ]
    with_locations["treatments"][0]["acupoints"] = [{"code": "GB40", "label_ko": "구허"}]
    if validate(with_locations, schema):
        raise RuntimeError("Valid coded point plus uncoded ashi/tenderness locations rejected")
    with_locations["treatments"][0]["acupoints"].append({"code": "ST41", "label_ko": "해계"})
    if not validate(with_locations, schema):
        raise RuntimeError("Uncoded locations were allowed to acquire an unselected existing clinical code")
    return len(mutations) + 4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=Path, default=ROOT / "data/demo/patients.seed.json")
    parser.add_argument("--schema", type=Path, default=ROOT / "data/demo/demo.schema.json")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        data, schema = load(args.seed), load(args.schema)
        errors = validate(data, schema)
        if errors:
            for error in errors:
                print("ERROR:", error, file=sys.stderr)
            return 1
        mutation_count = self_test(data, schema) if args.self_test else 0
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print("ERROR:", error, file=sys.stderr)
        return 1
    counts = {name: len(data[name]) for name in COLLECTIONS}
    print("PASS: Draft 2020-12 schema, UTC/UUID formats, relationships, history/current state, scoring, approvals, care tasks and portrait integrity.")
    print(json.dumps(counts, ensure_ascii=False))
    if args.self_test:
        print(f"PASS: {mutation_count} in-memory mutation/boundary checks; no files changed.")
    print("Python:", sys.executable)
    return 0


if __name__ == "__main__":
    sys.exit(main())
