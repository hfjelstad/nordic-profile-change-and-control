"""Validate SIRI-FM example fixtures against a local SIRI XSD schema.

The XSD itself is not vendored into this repository (see docs/SIRI-PROFILE-BASELINE.md
for why source boundaries matter). Point --schema-root at a local checkout of the
SIRI XSD, e.g. the sibling `SIRI/xsd` folder used to generate the Nordic SIRI ontology.

Usage:
    python validate_examples.py --schema-root "C:/path/to/SIRI/xsd" [fixtures_dir]
"""
import argparse
import sys
from pathlib import Path

from lxml import etree


def load_schema(schema_root: Path) -> etree.XMLSchema:
    schema_path = schema_root / "siri.xsd"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {schema_path}")
    doc = etree.parse(str(schema_path))
    return etree.XMLSchema(doc)


def validate_file(schema: etree.XMLSchema, xml_path: Path) -> list[str]:
    doc = etree.parse(str(xml_path))
    if schema.validate(doc):
        return []
    return [str(error) for error in schema.error_log]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixtures_dir", nargs="?", default=".", help="Directory of XML fixtures to validate")
    parser.add_argument("--schema-root", required=True, help="Path to the local SIRI xsd/ directory")
    args = parser.parse_args()

    schema = load_schema(Path(args.schema_root))
    fixtures_dir = Path(args.fixtures_dir)
    xml_files = sorted(fixtures_dir.glob("*.xml"))
    if not xml_files:
        print(f"No .xml fixtures found in {fixtures_dir}")
        return 1

    failures = 0
    for xml_file in xml_files:
        expect_valid = xml_file.name.startswith("valid-")
        errors = validate_file(schema, xml_file)
        passed = (not errors) == expect_valid
        status = "OK" if passed else "MISMATCH"
        print(f"[{status}] {xml_file.name} (expected {'valid' if expect_valid else 'invalid'}, "
              f"schema said {'valid' if not errors else 'invalid'})")
        for error in errors:
            print(f"    {error}")
        if not passed:
            failures += 1

    print(f"\n{len(xml_files) - failures}/{len(xml_files)} fixtures matched their expected result.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
