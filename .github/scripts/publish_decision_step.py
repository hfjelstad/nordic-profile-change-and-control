"""Single-decision helper for the "Publish decision" workflow: loads one
decision YAML, writes its generated ttl block to a file, and prints
GitHub Actions step outputs (class name, decision id, source issue) so the
workflow can use them without re-parsing YAML in bash.
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decision_to_ttl import DECISIONS_DIR, SUPPORTED_TYPES, load_decisions, profile_member_ttl


def main() -> int:
    decision_id = sys.argv[1]
    ttl_block_path = sys.argv[2]

    matches = sorted(glob.glob(os.path.join(DECISIONS_DIR, f"{decision_id}*.yaml")))
    if not matches:
        print(f"No decision file found for {decision_id!r} under {DECISIONS_DIR}", file=sys.stderr)
        return 1
    if len(matches) > 1:
        print(f"Ambiguous decision id {decision_id!r}, matched: {matches}", file=sys.stderr)
        return 1

    path, decision = load_decisions(matches)[0]
    if decision.get("status") not in ("accepted", "implemented"):
        print(f"{path} has status {decision.get('status')!r}, not accepted/implemented", file=sys.stderr)
        return 1
    if decision["decision"]["type"] not in SUPPORTED_TYPES:
        print(f"{path} has decision.type {decision['decision']['type']!r}, not one this generator supports", file=sys.stderr)
        return 1

    with open(ttl_block_path, "w", encoding="utf-8") as handle:
        handle.write(profile_member_ttl(decision) + "\n")

    class_name = decision["subject"]["class"].split(":", 1)[1]
    issues = decision.get("links", {}).get("issues") or []
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(f"decision_id={decision['id']}\n")
            handle.write(f"class_name={class_name}\n")
            handle.write(f"title={decision['title']}\n")
            handle.write(f"issue={issues[0] if issues else ''}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
