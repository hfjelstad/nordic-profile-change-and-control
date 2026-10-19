"""Shared per-standard configuration and detection.

Detection is based on the XML root element, not a user-selected field:
<Siri> -> "siri", <PublicationDelivery> -> "netex". This keeps the intake
form free of a picker field and removes the possibility of mislabelling.
"""
import xml.etree.ElementTree as ET

STANDARDS = {
    "siri": {
        "label": "SIRI",
        "root_element": "Siri",
        "schema_env_var": "SIRI_XSD_ROOT",
        "schema_root_file": "siri.xsd",
        "schema_source_label": "TransmodelEcosystem/SIRI, pinned tag v2.2",
        "ontology_prefix": "siri",
        "baseline_url": "https://raw.githubusercontent.com/entur/nordic-siri-ontology/main/siri-nordic-baseline.ttl",
        "profile_url": "https://raw.githubusercontent.com/entur/nordic-siri-ontology/main/siri-nordic.ttl",
        "model_url": "https://raw.githubusercontent.com/entur/nordic-siri-ontology/main/siri-nordic-model.ttl",
        "in_scope_profile": "NordicSIRI",
        "baseline_format": "legacy",
        "ontology_label": "Nordic SIRI",
    },
    "netex": {
        "label": "NeTEx",
        "root_element": "PublicationDelivery",
        "schema_env_var": "NETEX_XSD_ROOT",
        "schema_root_file": "NeTEx_publication.xsd",
        "schema_source_label": "TransmodelEcosystem/NeTEx, pinned tag v2.0.0",
        "ontology_prefix": "netex",
        # The membership allowlist (nordic:X profile nodes and their fields)
        # lives in netex-nordic.ttl itself; there is no separate baseline file.
        "baseline_url": "https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic.ttl",
        "profile_url": "https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic.ttl",
        "model_url": "https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic-model.ttl",
        "model_prefix": "nordic",
        # Downstream profiles using the same profile:ProfileClass vocabulary;
        # their classes are reported as "declared under a different profile".
        "downstream_urls": [
            "https://raw.githubusercontent.com/entur/entur-netex-ontology/main/netex-entur.ttl",
        ],
        "in_scope_profile": "NP",
        "baseline_format": "profile-nodes",
        "ontology_label": "Nordic NeTEx",
    },
}

_ROOT_TO_STANDARD = {config["root_element"]: name for name, config in STANDARDS.items()}


def root_local_name(xml_text: str) -> str:
    root = ET.fromstring(xml_text)
    tag = root.tag
    return tag.split("}")[-1] if "}" in tag else tag


def detect_standard(xml_text: str):
    """Returns a key into STANDARDS, or None if not recognised."""
    try:
        local = root_local_name(xml_text)
    except ET.ParseError:
        return None
    return _ROOT_TO_STANDARD.get(local)
