"""Check that a proposal issue actually contains a usable XML example, and
enrich it with a mechanical diff against the current Nordic SIRI ontology.

Well-formedness check: schema-agnostic by design. This repository does not
yet have an agreed, mirrored source for the SIRI/NeTEx XSD (see
docs/SIRI-PROFILE-BASELINE.md), so full schema conformance is not checked
here. That is a separate, later step once the official-source question is
resolved.

Ontology diff: purely mechanical comparison of element names against the
Nordic SIRI ontology sources. It does not decide anything; that is still a
CCB judgement call.

Reads the raw issue body from the ISSUE_BODY environment variable and writes
a human-readable result to validation-result.md next to this script.
"""
import os
import sys
import xml.etree.ElementTree as ET

from issue_body import get_xml_text
from ontology_diff import build_report

RESULT_PATH = os.path.join(os.path.dirname(__file__), "validation-result.md")


def well_formed(xml_text: str):
    try:
        ET.fromstring(xml_text)
        return True, ""
    except ET.ParseError as error:
        return False, str(error)


def main() -> int:
    body = os.environ.get("ISSUE_BODY", "")
    source, xml_text = get_xml_text(body)

    lines = ["## Automated XML check", ""]
    ok = True
    if not xml_text:
        ok = False
        lines.append(
            "No XML example was found, neither pasted nor attached as a file. "
            "Please edit this issue and add one."
        )
    else:
        valid, error = well_formed(xml_text)
        if valid:
            lines.append(f"The XML from the {source} is well-formed.")
            lines.append("")
            lines.append(
                "This only checks that the XML parses. It does not yet check it "
                "against the SIRI or NeTEx XSD; that step is not wired into CI yet."
            )
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
