"""Insert a generated nordic:ProfileMember ttl block into the right place in
an existing baseline ttl file: right after the last ProfileMember entry that
already belongs to the same class, so new fields land next to their class's
existing fields instead of at the end of the file.

Used by the "Publish decision" workflow between decision_to_ttl.py (which
produces the block) and committing/pushing to the ontology repository.
"""
import re


def insert_block(baseline_text: str, class_name: str, ttl_block: str) -> str:
    pattern = re.compile(
        rf"\[\] a nordic:ProfileMember ;\s*\n\s*nordic:onClass netex:{re.escape(class_name)}\s*;"
        r"[\s\S]*?nordic:provenance[\s\S]*?\.\n"
    )
    matches = list(pattern.finditer(baseline_text))
    if not matches:
        raise ValueError(f"No existing nordic:ProfileMember block found for netex:{class_name}; cannot place the new field automatically.")
    insert_at = matches[-1].end()
    return baseline_text[:insert_at] + ttl_block.rstrip("\n") + "\n" + baseline_text[insert_at:]


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline_file", help="Path to netex-nordic-baseline.ttl")
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
