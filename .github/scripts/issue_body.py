"""Shared helpers for reading GitHub Issue Form bodies.

GitHub renders each form field as a "### <Label>" heading followed by the
answer, or "_No response_" if the field was left empty.
"""
import re

FIELD_XML_EXAMPLE = "XML example"
FIELD_XML_FILE = "XML file"


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


def get_xml_text(body: str):
    """Returns (source_description, xml_text). xml_text is empty if none found."""
    import urllib.request

    body = body.replace("\r\n", "\n")
    pasted = extract_section(body, FIELD_XML_EXAMPLE)
    if pasted:
        return "pasted example", strip_code_fence(pasted)

    file_section = extract_section(body, FIELD_XML_FILE)
    if file_section:
        url = find_file_url(file_section)
        if url:
            with urllib.request.urlopen(url, timeout=15) as response:
                return f"attached file ({url})", response.read().decode("utf-8", errors="replace")

    return "", ""
