"""Single-decision helper for the "Publish decision" workflow: loads one
decision YAML, writes its generated ttl block to a file, and prints
GitHub Actions step outputs (class name, decision id, source issue) so the
workflow can use them without re-parsing YAML in bash.

With --skip-unpublishable (used for push-triggered runs, where any change to
a decision file fires the workflow), a decision that is not publishable -
not accepted/implemented, not NeTEx, or an unsupported rule type - is
reported as skipped (exit 0, publish=false) instead of failing the run.
Explicit requests (workflow_dispatch, "publish" label) still fail loudly.
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decision_to_ttl import DECISIONS_DIR, SUPPORTED_TYPES, load_decisions, profile_member_ttl


def write_outputs(values: dict) -> None:
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            for key, value in values.items():
                handle.write(f"{key}={value}\n")


def unpublishable_reason(decision: dict):
    if decision.get("status") not in ("accepted", "implemented"):
        return f"has status {decision.get('status')!r}, not accepted/implemented"
    if decision.get("standard") != "netex":
        return f"has standard {decision.get('standard')!r}; only netex decisions are published to the ontology"
    if decision["decision"]["type"] not in SUPPORTED_TYPES:
        return f"has decision.type {decision['decision']['type']!r}, not one this generator supports"
    return None


def main() -> int:
    args = [arg for arg in sys.argv[1:] if arg != "--skip-unpublishable"]
    soft_skip = len(args) != len(sys.argv) - 1
    decision_id, ttl_block_path = args

    matches = sorted(glob.glob(os.path.join(DECISIONS_DIR, f"{decision_id}*.yaml")))
    if not matches:
        print(f"No decision file found for {decision_id!r} under {DECISIONS_DIR}", file=sys.stderr)
        return 1
    if len(matches) > 1:
        print(f"Ambiguous decision id {decision_id!r}, matched: {matches}", file=sys.stderr)
        return 1

    path, decision = load_decisions(matches)[0]
    reason = unpublishable_reason(decision)
    if reason:
        message = f"{os.path.basename(path)} {reason}"
        if soft_skip:
            print(f"::notice::Not publishing: {message}")
            write_outputs({"publish": "false"})
            return 0
        print(message, file=sys.stderr)
        return 1

    with open(ttl_block_path, "w", encoding="utf-8") as handle:
        handle.write(profile_member_ttl(decision) + "\n")

    class_name = decision["subject"]["class"].split(":", 1)[1]
    issues = decision.get("links", {}).get("issues") or []
    write_outputs({
        "publish": "true",
        "decision_id": decision["id"],
        "class_name": class_name,
        "title": decision["title"],
        "issue": issues[0] if issues else "",
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
