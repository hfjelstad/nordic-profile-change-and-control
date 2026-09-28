"""Mechanically turn ontology_diff.candidate_subjects() into decision YAML
files under decisions/, with no free-text interpretation: every field either
comes straight off the XML DOM (class/property/path/cardinality/codes) or is
copied verbatim from the issue form fields (title/rationale/issue number).
This replaces an assistant reading the discussion and hand-writing YAML with
a repeatable, script-driven step.
"""
import glob
import os
import re
import sys

import yaml

from ontology_diff import candidate_subjects

DECISIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "decisions")


def next_decision_id(prefix: str = "NP") -> str:
    numbers = [0]
    for path in glob.glob(os.path.join(DECISIONS_DIR, f"{prefix}-*.yaml")):
        match = re.match(rf"{prefix}-(\d+)", os.path.basename(path))
        if match:
            numbers.append(int(match.group(1)))
    return f"{prefix}-{max(numbers) + 1:04d}"


def cardinality_to_rule(cardinality: str) -> dict:
    lower, upper = cardinality.split("..")
    return {"minCount": int(lower), "maxCount": None if upper == "n" else int(upper)}


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def build_decision(candidate: dict, *, decision_id: str, issue_number: int, issue_title: str, issue_rationale: str, standard: str) -> dict:
    rule = cardinality_to_rule(candidate["cardinality"])
    decision_type = "required" if rule["minCount"] >= 1 else "optional"
    subject = {
        "class": f"netex:{candidate['class']}",
        "property": f"netex:{candidate['property']}",
        "service": None,
        "message": None,
        "qname": f"netex:{candidate['property']}/@{candidate['attribute']}" if candidate["kind"] == "new-attribute" else None,
        "request": None,
        "delivery": None,
        "referenceTarget": None,
        # Extends the template's subject shape with the structural path the
        # ttl generator needs; see the note in NP-0001 about this being a
        # first-generation / evolving part of the schema.
        "path": candidate["path"],
    }
    return {
        "id": decision_id,
        "title": issue_title,
        "status": "accepted",
        "standard": standard,
        "profile": "nordic-core",
        "profileVersion": None,
        "subject": subject,
        "decision": {
            "type": decision_type,
            "rule": {
                "minCount": rule["minCount"],
                "maxCount": rule["maxCount"],
                "class": None,
                "datatype": None,
                "in": [],
                "condition": None,
                "codes": candidate.get("values", []),
                "timing": None,
                "reference": None,
            },
        },
        "rationale": issue_rationale or f"See issue #{issue_number} for the full discussion.",
        "scope": {"countries": ["NO", "SE", "FI", "DK"], "organisations": []},
        "evidence": [f"issue #{issue_number}"],
        "impact": {"breakingChange": False, "affectedSystems": []},
        "ccb": {
            "proposedBy": None,
            "reviewers": [],
            "decisionDate": None,
            "decisionVersion": None,
            "effectiveFrom": None,
            "issue": issue_number,
        },
        "links": {"issues": [issue_number], "relatedDecisions": [], "implementations": []},
    }


def write_decisions(xml_text: str, *, issue_number: int, issue_title: str, issue_rationale: str, standard: str):
    candidates, unresolved = candidate_subjects(xml_text)
    written = []
    for candidate in candidates:
        decision_id = next_decision_id()
        decision = build_decision(
            candidate, decision_id=decision_id, issue_number=issue_number,
            issue_title=issue_title, issue_rationale=issue_rationale, standard=standard,
        )
        filename = f"{decision_id}-{slug(candidate['class'])}-{slug(candidate['property'])}.yaml"
        path = os.path.join(DECISIONS_DIR, filename)
        with open(path, "w", encoding="utf-8") as handle:
            yaml.safe_dump(decision, handle, sort_keys=False, allow_unicode=True)
        written.append((decision_id, path, candidate))
    return written, unresolved


if __name__ == "__main__":
    import argparse

    from issue_body import extract_section, get_xml_text

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("issue_number", type=int)
    parser.add_argument("issue_title")
    args = parser.parse_args()

    body = os.environ.get("ISSUE_BODY", "")
    _, xml_text = get_xml_text(body)
    if not xml_text:
        print("No XML file attached to this issue; nothing to derive a decision from.", file=sys.stderr)
        raise SystemExit(1)

    rationale = extract_section(body, "Description")
    from standards import detect_standard
    standard = detect_standard(xml_text) or "netex"

    written, unresolved = write_decisions(
        xml_text, issue_number=args.issue_number, issue_title=args.issue_title,
        issue_rationale=rationale, standard=standard,
    )

    for decision_id, path, candidate in written:
        print(f"Wrote {path} ({decision_id}): {candidate['class']}.{candidate['property']}"
              + (f"/@{candidate['attribute']}" if candidate['kind'] == 'new-attribute' else ""))
    for reason in unresolved:
        print(f"Could not auto-derive a decision: {reason}", file=sys.stderr)

    if not written:
        print("No candidates could be mechanically derived from this issue's XML.", file=sys.stderr)
        raise SystemExit(1)
