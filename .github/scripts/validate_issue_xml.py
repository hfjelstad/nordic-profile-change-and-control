"""Check that a proposal issue actually contains a usable XML example,
validate it against the official SIRI or NeTEx XSD, and enrich it with a
mechanical diff against the current Nordic ontology.

Standard (SIRI vs NeTEx) is detected automatically from the XML root element
(<Siri> vs <PublicationDelivery>), not from a form field, so there is no
picker and no way to mislabel a proposal (see standards.py).

Schema validation: against a pinned tag of the official TransmodelEcosystem
repository, checked out fresh by the CI workflow (not vendored into this
repository; see docs/SIRI-PROFILE-BASELINE.md).

Ontology diff: purely mechanical comparison of element names against the
Nordic ontology sources. It does not decide anything; that is still a CCB
judgement call.

Reads the raw issue body from the ISSUE_BODY environment variable and writes
a human-readable result to validation-result.md next to this script.
"""
import os
import sys
import xml.etree.ElementTree as ET

from issue_body import get_xml_text, has_pasted_example
from ontology_diff import build_report
from standards import STANDARDS
from xsd_validate import validate as xsd_validate

RESULT_PATH = os.path.join(os.path.dirname(__file__), "validation-result.md")


def well_formed(xml_text: str):
    try:
        ET.fromstring(xml_text)
        return True, ""
    except ET.ParseError as error:
        return False, str(error)


def main() -> int:
    try:
        return run()
    except Exception as error:  # last-resort safety net so a comment is always posted
        with open(RESULT_PATH, "w", encoding="utf-8") as handle:
            handle.write(
                "## Automated XML check\n\n"
                f"The check itself failed unexpectedly: `{error}`. Please report this as a bug "
                "in the CCB repository; it is not a statement about your proposal."
            )
        return 1


def run() -> int:
    body = os.environ.get("ISSUE_BODY", "")
    source, xml_text = get_xml_text(body)

    lines = ["## Automated XML check", ""]
    ok = True
    if not xml_text:
        ok = False
        if has_pasted_example(body):
            lines.append(
                "No XML file was attached. The pasted XML example is for human "
                "context only and is not validated automatically. Please attach "
                "the XML as a file."
            )
        else:
            lines.append(
                "No XML file was found. Please edit this issue and attach one."
            )
    else:
        valid, error = well_formed(xml_text)
        if valid:
            lines.append(f"The XML from the {source} is well-formed.")

            standard, attempted, schema_valid, schema_errors = xsd_validate(xml_text)
            standard_label = STANDARDS[standard]["label"] if standard else "unknown standard"
            source_label = STANDARDS[standard]["schema_source_label"] if standard else ""
            lines.append("")
            lines.append(f"## Schema validation ({standard_label})")
            lines.append("")
            if not attempted:
                lines.append(f"Not checked: {schema_errors[0]}")
            elif schema_valid:
                lines.append(f"Valid against the official {standard_label} schema ({source_label}).")
            else:
                ok = False
                lines.append(f"Not valid against the official {standard_label} schema ({source_label}):")
                lines.append("")
                lines.append("```\n" + "\n".join(schema_errors) + "\n```")

            lines.append(build_report(xml_text))
        else:
            ok = False
            lines.append(f"The XML from the {source} is not well-formed:")
            lines.append("")
            lines.append(f"```\n{error}\n```")

    with open(RESULT_PATH, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
