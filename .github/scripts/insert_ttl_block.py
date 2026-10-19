"""Insert a generated profile:ProfileMember ttl block into the right place in
the profile's membership allowlist (netex-nordic.ttl): right after the last
ProfileMember entry that
already hangs on the same Nordic profile node (profile:memberOf nordic:X), so
new fields land next to their class's existing fields instead of at the end
of the file. If the node has no members yet, the block goes right after the
node's own nordic:X a profile:ProfileClass declaration.

The node itself is never created here: bringing a new class into the profile
is a scope decision of its own, not a side effect of adding a field.

Used by the "Publish decision" workflow between decision_to_ttl.py (which
produces the block) and committing/pushing to the ontology repository.
"""
import re

# A Turtle statement in the baseline ends with " ." at the end of a line;
# literals like "0..1" never do, so this is a safe statement terminator.
_STATEMENT_END = r"[\s\S]*?\s\.[ \t]*\r?\n"


def insert_block(baseline_text: str, class_name: str, ttl_block: str) -> str:
    node = f"nordic:{re.escape(class_name)}"
    member_pattern = re.compile(
        rf"\[\] a profile:ProfileMember ;\s*profile:memberOf {node}\s*;" + _STATEMENT_END
    )
    matches = list(member_pattern.finditer(baseline_text))
    if not matches:
        class_pattern = re.compile(rf"^{node} a profile:ProfileClass\s*;" + _STATEMENT_END, re.MULTILINE)
        matches = list(class_pattern.finditer(baseline_text))
    if not matches:
        raise ValueError(
            f"No nordic:{class_name} profile:ProfileClass node found in the profile; "
            "adding a new class to the profile needs manual handling."
        )
    insert_at = matches[-1].end()
    return baseline_text[:insert_at] + ttl_block.rstrip("\n") + "\n" + baseline_text[insert_at:]


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline_file", help="Path to netex-nordic.ttl (holds the membership allowlist)")
    parser.add_argument("class_name", help="e.g. StopPlace")
    parser.add_argument("ttl_block_file", help="Path to a file containing the ttl block to insert")
    args = parser.parse_args()

    with open(args.baseline_file, encoding="utf-8") as handle:
        baseline_text = handle.read()
    with open(args.ttl_block_file, encoding="utf-8") as handle:
        ttl_block = handle.read()

    try:
        updated = insert_block(baseline_text, args.class_name, ttl_block)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

    with open(args.baseline_file, "w", encoding="utf-8") as handle:
        handle.write(updated)
