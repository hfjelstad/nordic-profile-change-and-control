"""Compare element names used in a submitted XML example against the
current Nordic SIRI ontology sources.

This is a purely mechanical, structural comparison: it lists which element
names are already accepted, which are declared but out of scope, and which
are not found at all. It does NOT decide whether an unmatched element should
be accepted; that remains a CCB decision.

Currently covers SIRI only. NeTEx support would follow the same pattern
against netex-nordic-baseline.ttl / netex-nordic.ttl if this proves useful.
"""
import re
import urllib.request
import xml.etree.ElementTree as ET

SIRI_BASELINE_URL = "https://raw.githubusercontent.com/entur/nordic-siri-ontology/main/siri-nordic-baseline.ttl"
SIRI_PROFILE_URL = "https://raw.githubusercontent.com/entur/nordic-siri-ontology/main/siri-nordic.ttl"


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read().decode("utf-8", errors="replace")


def local_element_names(xml_text: str) -> set:
    root = ET.fromstring(xml_text)
    names = set()
    for element in root.iter():
        tag = element.tag
        local = tag.split("}")[-1] if "}" in tag else tag
        names.add(local)
    return names


def baseline_profile_map(baseline_text: str) -> dict:
    """Maps a local element/class name to the profile scope it is declared
    under, e.g. "NordicSIRI" or "EnturExtension". Prefers NordicSIRI if a
    name is declared more than once under different scopes."""
    mapping = {}
    for match in re.finditer(r"siri:([A-Za-z][\w-]*)\s+nordic:inProfile\s+profile:([A-Za-z][\w-]*)", baseline_text):
        name, profile = match.group(1), match.group(2)
        if name not in mapping or profile == "NordicSIRI":
            mapping[name] = profile
    return mapping


def profile_status_map(profile_text: str) -> dict:
    statuses = {}
    pattern = re.compile(
        r"(?:nordic|siri):([A-Za-z_][\w-]*)\s+a\s+(?:(?:nordic|siri):(?:Service|DataSource)|owl:Class)\s*;"
        r"([\s\S]*?)(?=\n(?:nordic|siri):[A-Za-z_][\w-]*\s+a\s+|\Z)"
    )
    for match in pattern.finditer(profile_text):
        name = match.group(1)
        block = match.group(2)
        status_match = re.search(r'(?:profile|nordic):status\s+"([^"]+)"', block)
        statuses[name] = status_match.group(1) if status_match else "in-scope"
    return statuses


def classify(xml_names: set, baseline_profiles: dict, status_map: dict):
    in_scope, other_profile, other_status, unmatched = [], [], [], []
    for name in sorted(xml_names):
        if name in baseline_profiles:
            profile = baseline_profiles[name]
            (in_scope if profile == "NordicSIRI" else other_profile).append((name, profile))
        elif name in status_map:
            other_status.append((name, status_map[name]))
        else:
            unmatched.append(name)
    return in_scope, other_profile, other_status, unmatched


def build_report(xml_text: str) -> str:
    try:
        names = local_element_names(xml_text)
        baseline_profiles = baseline_profile_map(fetch(SIRI_BASELINE_URL))
        status_map = profile_status_map(fetch(SIRI_PROFILE_URL))
    except Exception as error:  # network failure or unexpected ontology format
        return (
            "\n## Elements used vs. the current Nordic SIRI profile\n\n"
            f"Could not compare against the ontology sources ({error}). "
            "This is best-effort enrichment, not a required check.\n"
        )

    in_scope, other_profile, other_status, unmatched = classify(names, baseline_profiles, status_map)

    lines = ["", "## Elements used vs. the current Nordic SIRI profile", ""]
    lines.append(f"Found {len(names)} distinct element names in the example.")

    if in_scope:
        lines.append("")
        lines.append("Already accepted into the shared Nordic SIRI baseline:")
        lines.append(", ".join(f"`{name}`" for name, _ in in_scope))

    if other_profile:
        lines.append("")
        lines.append("Declared in the ontology, but under a different profile scope, not the shared Nordic baseline:")
        lines.append(", ".join(f"`{name}` ({profile})" for name, profile in other_profile))

    if other_status:
        lines.append("")
        lines.append("Declared in the SIRI ontology, but not in-scope (needs a decision either way):")
        lines.append(", ".join(f"`{name}` ({status})" for name, status in other_status))

    if unmatched:
        lines.append("")
        lines.append(
            "Not found as a named object in either ontology source. This can be a core SIRI "
            "envelope element that is not modelled as its own object, or a genuinely new element "
            "this proposal introduces:"
        )
        lines.append(", ".join(f"`{name}`" for name in unmatched))

    lines.append("")
    lines.append(
        "This is a mechanical comparison only. It does not decide whether an unmatched or "
        "non-in-scope element should be accepted; that remains a CCB decision."
    )
    return "\n".join(lines)
