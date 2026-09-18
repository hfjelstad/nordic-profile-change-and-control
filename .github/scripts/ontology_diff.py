"""Compare element names used in a submitted XML example against the
current Nordic SIRI or NeTEx ontology sources.

This is a purely mechanical, structural comparison: it lists which element
names are already accepted, which are declared but out of scope, and which
are not found at all. It does NOT decide whether an unmatched element should
be accepted; that remains a CCB decision.

Both NeTEx and SIRI baselines use the same nordic:inProfile profile:X
convention, just under a different namespace prefix, so this is a single
generalised implementation driven by standards.STANDARDS.
"""
import re
import urllib.request
import xml.etree.ElementTree as ET

from standards import STANDARDS, detect_standard


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


def baseline_profile_map(baseline_text: str, prefix: str, in_scope_profile: str) -> dict:
    """Maps a local element/class name to the profile scope it is declared
    under, e.g. "NordicProfile"/"NordicSIRI" or "EnturExtension". Prefers the
    in-scope profile if a name is declared more than once under different
    scopes."""
    mapping = {}
    pattern = re.compile(rf"{prefix}:([A-Za-z][\w-]*)\s+nordic:inProfile\s+profile:([A-Za-z][\w-]*)")
    for match in pattern.finditer(baseline_text):
        name, profile = match.group(1), match.group(2)
        if name not in mapping or profile == in_scope_profile:
            mapping[name] = profile
    return mapping


def _field_element_names(raw_element_value: str):
    """A nordic:element value can be a bare name ("Name"), an attribute
    ("@id"), or a slash-separated path ("Foo/Bar/@id"). Only the plain
    element name segments are relevant here, since they are what is
    compared against XML tag names, not attributes or full paths."""
    names = set()
    for segment in raw_element_value.split("/"):
        segment = segment.strip()
        if segment and not segment.startswith("@"):
            names.add(segment)
    return names


def field_profile_map(baseline_text: str, prefix: str, in_scope_profile: str, class_profiles: dict) -> dict:
    """Maps element names that only appear nested inside a class's
    nordic:ProfileMember block (e.g. "AccessibilityAssessment" as a field of
    Quay) to that owning class's profile scope. Most of the baseline's
    content lives at this nested level, not as its own top-level class
    declaration, so this is needed in addition to baseline_profile_map."""
    mapping = {}
    pattern = re.compile(
        rf"nordic:onClass\s+{prefix}:([A-Za-z][\w-]*)\s*;[\s\S]*?nordic:element\s+\"([^\"]*)\""
    )
    for match in pattern.finditer(baseline_text):
        class_name, raw_element = match.group(1), match.group(2)
        profile = class_profiles.get(class_name)
        if profile is None:
            continue
        for name in _field_element_names(raw_element):
            if name not in mapping or profile == in_scope_profile:
                mapping[name] = profile
    return mapping


def profile_status_map(profile_text: str, prefix: str) -> dict:
    statuses = {}
    pattern = re.compile(
        rf"(?:nordic|{prefix}):([A-Za-z_][\w-]*)\s+a\s+(?:(?:nordic|{prefix}):(?:Service|DataSource)|owl:Class)\s*;"
        r"([\s\S]*?)(?=\n(?:nordic|" + prefix + r"):[A-Za-z_][\w-]*\s+a\s+|\Z)"
    )
    for match in pattern.finditer(profile_text):
        name = match.group(1)
        block = match.group(2)
        status_match = re.search(r'(?:profile|nordic):status\s+"([^"]+)"', block)
        statuses[name] = status_match.group(1) if status_match else "in-scope"
    return statuses


# Top-level envelope/frame elements present in every submission regardless of
# content; never themselves a CCB decision. NeTEx/SIRI classes are always
# PascalCase, so a lowercase-first name (e.g. "quays", "dataObjects",
# "keyList") is reliably a collection wrapper, not a domain object either.
ENVELOPE_ELEMENTS = {
    "netex": {
        "PublicationDelivery", "PublicationTimestamp", "ParticipantRef",
        "ServiceFrame", "SiteFrame", "CompositeFrame", "ResourceFrame",
        "TimetableFrame", "VehicleScheduleFrame", "FareFrame", "GeneralFrame",
    },
    "siri": {"Siri"},
}


def is_structural_wrapper(name: str, standard: str) -> bool:
    """True for XML structure that never itself carries a CCB decision."""
    return name[:1].islower() or name in ENVELOPE_ELEMENTS.get(standard, ())


def classify(xml_names: set, baseline_profiles: dict, status_map: dict, in_scope_profile: str):
    in_scope, other_profile, other_status, unmatched = [], [], [], []
    for name in sorted(xml_names):
        if name in baseline_profiles:
            profile = baseline_profiles[name]
            (in_scope if profile == in_scope_profile else other_profile).append((name, profile))
        elif name in status_map:
            other_status.append((name, status_map[name]))
        else:
            unmatched.append(name)
    return in_scope, other_profile, other_status, unmatched


def build_report(xml_text: str) -> str:
    standard = detect_standard(xml_text)
    if standard is None:
        return ""
    config = STANDARDS[standard]

    try:
        names = local_element_names(xml_text)
        baseline_text = fetch(config["baseline_url"])
        class_profiles = baseline_profile_map(
            baseline_text, config["ontology_prefix"], config["in_scope_profile"]
        )
        # Most of the baseline is nested field members of a class (e.g.
        # Quay's AccessibilityAssessment), not top-level class declarations,
        # so both maps are needed; class-level wins if a name is both.
        baseline_profiles = {
            **field_profile_map(baseline_text, config["ontology_prefix"], config["in_scope_profile"], class_profiles),
            **class_profiles,
        }
        status_map = profile_status_map(fetch(config["profile_url"]), config["ontology_prefix"])
    except Exception as error:  # network failure or unexpected ontology format
        return (
            f"\n## Elements used vs. the current {config['ontology_label']} profile\n\n"
            f"Could not compare against the ontology sources ({error}). "
            "This is best-effort enrichment, not a required check.\n"
        )

    wrapper_names = {name for name in names if is_structural_wrapper(name, standard)}
    content_names = names - wrapper_names

    in_scope, other_profile, other_status, unmatched = classify(
        content_names, baseline_profiles, status_map, config["in_scope_profile"]
    )

    lines = ["", f"## Elements used vs. the current {config['ontology_label']} profile", ""]
    lines.append(f"Found {len(names)} distinct element names in the example.")

    if in_scope:
        lines.append("")
        lines.append(f"Already accepted into the shared {config['ontology_label']} baseline:")
        lines.append(", ".join(f"`{name}`" for name, _ in in_scope))

    if other_profile:
        lines.append("")
        lines.append("Declared in the ontology, but under a different profile scope, not the shared baseline:")
        lines.append(", ".join(f"`{name}` ({profile})" for name, profile in other_profile))

    if other_status:
        lines.append("")
        lines.append("Declared in the ontology, but not in-scope (needs a decision either way):")
        lines.append(", ".join(f"`{name}` ({status})" for name, status in other_status))

    if unmatched:
        lines.append("")
        lines.append(
            "Not found as a named object in either ontology source. This is likely a "
            "genuinely new element this proposal introduces:"
        )
        lines.append(", ".join(f"`{name}`" for name in unmatched))

    if wrapper_names:
        lines.append("")
        lines.append(
            f"{len(wrapper_names)} structural or envelope elements were excluded from this "
            "comparison, since they are XML wrappers rather than profile content: "
            + ", ".join(f"`{name}`" for name in sorted(wrapper_names))
        )

    lines.append("")
    lines.append(
        "This is a mechanical comparison only. It does not decide whether an unmatched or "
        "non-in-scope element should be accepted; that remains a CCB decision."
    )
    return "\n".join(lines)
