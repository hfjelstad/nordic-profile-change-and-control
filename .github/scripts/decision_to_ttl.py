"""Turn accepted CCB decisions into the exact nordic:ProfileMember ttl block
that a downstream ontology repository (e.g. entur/nordic-netex-ontology)
needs to add to its baseline file.

This is the first concrete implementation of the "generation" step described
in docs/CLOSED-FEEDBACK-LOOP.md and docs/CONSUMER-CONTRACT.md: a decision
becomes a normative rule only once it is projected into the ontology, and
that projection should be mechanical, not a manual copy-paste from prose.

Scope: only handles the by far most common decision shape in the current
baseline, a property addition on a class (decision.type in {required,
optional}) with a plain structural path. Other decision types
(excluded/conditional/national/informative, or non-property rules like
element-order/specialization/domain-chain) are out of scope for this first
version and are reported as skipped rather than guessed at.
"""
import argparse
import glob
import os
import sys

import yaml

DECISIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "decisions")

SUPPORTED_TYPES = {"required", "optional"}


def load_decisions(paths):
    decisions = []
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            decisions.append((path, yaml.safe_load(handle)))
    return decisions


def cardinality_for(rule: dict) -> str:
    min_count = rule.get("minCount")
    max_count = rule.get("maxCount")
    lower = "0" if min_count in (None, 0) else str(min_count)
    upper = "n" if max_count in (None, 0) else str(max_count)
    return f"{lower}..{upper}"


def profile_member_ttl(decision: dict) -> str:
    subject = decision["subject"]
    class_name = subject["class"].split(":", 1)[1]
    property_name = subject["property"].split(":", 1)[1]
    path = subject.get("path") or property_name
    cardinality = cardinality_for(decision["decision"]["rule"])
    return (
        "[] a nordic:ProfileMember ;\n"
        f"    nordic:onClass netex:{class_name} ;\n"
        f'    nordic:element "{property_name}" ;\n'
        f'    nordic:path "{path}" ;\n'
        f'    nordic:cardinality "{cardinality}" ;\n'
        f'    nordic:provenance nordic:decision "{decision["id"]}" .'
    )


def build(paths):
    blocks, skipped = [], []
    for path, decision in load_decisions(paths):
        if decision.get("status") not in ("accepted", "implemented"):
            skipped.append((path, f"status is {decision.get('status')!r}, not accepted/implemented"))
            continue
        if decision.get("standard") != "netex":
            skipped.append((path, f"standard is {decision.get('standard')!r}, this generator only handles netex"))
            continue
        if decision["decision"]["type"] not in SUPPORTED_TYPES:
            skipped.append((path, f"decision.type {decision['decision']['type']!r} is not a supported property rule yet"))
            continue
        blocks.append((decision["id"], profile_member_ttl(decision)))
    return blocks, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decision_files", nargs="*", help="Decision YAML files (default: all files under decisions/)")
    args = parser.parse_args()

    paths = args.decision_files or sorted(
        p for p in glob.glob(os.path.join(DECISIONS_DIR, "*.yaml")) if "TEMPLATE" not in p
    )
    blocks, skipped = build(paths)

    for decision_id, ttl in blocks:
        print(f"## --- {decision_id} ---")
        print(ttl)
        print()

    if skipped:
        print("## Skipped (not auto-generated, needs manual handling):", file=sys.stderr)
        for path, reason in skipped:
            print(f"  {os.path.basename(path)}: {reason}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
