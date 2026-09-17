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
        "in_scope_profile": "NordicSIRI",
        "ontology_label": "Nordic SIRI",
    },
    "netex": {
        "label": "NeTEx",
        "root_element": "PublicationDelivery",
        "schema_env_var": "NETEX_XSD_ROOT",
        "schema_root_file": "NeTEx_publication.xsd",
        "schema_source_label": "TransmodelEcosystem/NeTEx, pinned tag v2.0.0",
        "ontology_prefix": "netex",
        "baseline_url": "https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic-baseline.ttl",
        "profile_url": "https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic.ttl",
        "in_scope_profile": "NordicProfile",
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
