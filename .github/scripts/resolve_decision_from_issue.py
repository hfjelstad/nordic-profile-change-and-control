"""Find which decision file corresponds to a CCB issue number, so a workflow
triggered by *labeling the issue itself* (rather than a manual Actions input)
knows which decision to publish. Prints `decision_id=<id>` for GITHUB_OUTPUT.
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decision_to_ttl import DECISIONS_DIR, load_decisions


def main() -> int:
    issue_number = int(sys.argv[1])
    paths = sorted(p for p in glob.glob(os.path.join(DECISIONS_DIR, "*.yaml")) if "TEMPLATE" not in p)

    matches = []
    for path, decision in load_decisions(paths):
        linked = set(decision.get("links", {}).get("issues") or [])
        ccb_issue = decision.get("ccb", {}).get("issue")
        if ccb_issue is not None:
            linked.add(ccb_issue)
        if issue_number in linked:
            matches.append(decision["id"])

    if not matches:
        print(f"No decision file links back to issue #{issue_number}. Create/accept the decision first.", file=sys.stderr)
        return 1
    if len(matches) > 1:
        print(f"Issue #{issue_number} is linked from more than one decision: {matches}. Publish them individually via workflow_dispatch instead.", file=sys.stderr)
        return 1

    print(f"decision_id={matches[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
