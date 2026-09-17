"""CI step: detect SIRI vs NeTEx from the issue body and expose it as a
GitHub Actions step output, so later steps can conditionally check out only
the relevant official schema repository.
"""
import os

from issue_body import get_xml_text
from standards import detect_standard


def main() -> None:
    body = os.environ.get("ISSUE_BODY", "")
    _, xml_text = get_xml_text(body)
    standard = detect_standard(xml_text) if xml_text else None

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(f"standard={standard or ''}\n")


if __name__ == "__main__":
    main()
