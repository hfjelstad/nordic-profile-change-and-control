"""Validate an XML example against the official SIRI XSD.

The schema is not vendored into this repository (see docs/SIRI-PROFILE-BASELINE.md
for why). Instead, the CI workflow checks out a pinned tag of the official
TransmodelEcosystem/SIRI repository fresh at each run, and this script points
lxml at that checkout via the SIRI_XSD_ROOT environment variable.
"""
import os

from lxml import etree

_schema_cache = None


def load_schema():
    global _schema_cache
    if _schema_cache is not None:
        return _schema_cache

    schema_root = os.environ.get("SIRI_XSD_ROOT")
    if not schema_root:
        return None

    schema_path = os.path.join(schema_root, "siri.xsd")
    if not os.path.exists(schema_path):
        return None

    doc = etree.parse(schema_path)
    _schema_cache = etree.XMLSchema(doc)
    return _schema_cache


def validate(xml_text: str):
    """Returns (attempted, valid, errors). attempted is False if no schema
    was available to validate against (e.g. SIRI_XSD_ROOT not set, or the
    root element is not <Siri>)."""
    schema = load_schema()
    if schema is None:
        return False, False, ["No SIRI XSD checkout available (SIRI_XSD_ROOT not set)."]

    try:
        doc = etree.fromstring(xml_text.encode("utf-8"))
    except etree.XMLSyntaxError as error:
        return True, False, [str(error)]

    local_root_tag = doc.tag.split("}")[-1] if "}" in doc.tag else doc.tag
    if local_root_tag != "Siri":
        return False, False, [f"Root element is <{local_root_tag}>, not <Siri>; skipping SIRI schema check."]

    if schema.validate(doc):
        return True, True, []
    return True, False, [str(error) for error in schema.error_log]
