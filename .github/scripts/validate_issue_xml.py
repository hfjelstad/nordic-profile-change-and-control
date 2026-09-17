"""Check that a proposal issue actually contains a usable XML example.

This is intentionally schema-agnostic: it only checks that the pasted or
attached XML is well-formed. It does NOT validate against the SIRI or NeTEx
XSD, because this repository does not yet have an agreed, mirrored source
for that schema (see docs/SIRI-PROFILE-BASELINE.md). That is a separate,
later step once the official-source question is resolved.

Reads the raw issue body from the ISSUE_BODY environment variable (the
format GitHub renders for an Issue Form: "### <Label>" headings followed by
the answer, or "_No response_" if empty) and writes a human-readable result
to validation-result.md next to this script.
"""
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

FIELD_XML_EXAMPLE = "XML example"
FIELD_XML_FILE = "XML file"
RESULT_PATH = os.path.join(os.path.dirname(__file__), "validation-result.md")


def extract_section(body: str, heading: str) -> str:
    pattern = re.compile(rf"### {re.escape(heading)}\s*\n(.*?)(?=\n### |\Z)", re.DOTALL)
    match = pattern.search(body)
    if not match:
        return ""
    text = match.group(1).strip()
    return "" if text in ("", "_No response_") else text


def strip_code_fence(text: str) -> str:
    match = re.match(r"^```[a-zA-Z]*\n(.*)\n```$", text.strip(), re.DOTALL)
    return match.group(1) if match else text


def find_file_url(text: str) -> str:
    match = re.search(r"\[[^\]]*\]\((https?://\S+)\)", text)
    return match.group(1) if match else ""


def well_formed(xml_text: str):
    try:
        ET.fromstring(xml_text)
        return True, ""
    except ET.ParseError as error:
        return False, str(error)


def main() -> int:
    body = os.environ.get("ISSUE_BODY", "").replace("\r\n", "\n")
    pasted = extract_section(body, FIELD_XML_EXAMPLE)
    file_section = extract_section(body, FIELD_XML_FILE)

    source = ""
    xml_text = ""
    if pasted:
        source = "pasted example"
        xml_text = strip_code_fence(pasted)
    elif file_section:
        url = find_file_url(file_section)
        if url:
            source = f"attached file ({url})"
            with urllib.request.urlopen(url, timeout=15) as response:
                xml_text = response.read().decode("utf-8", errors="replace")

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
