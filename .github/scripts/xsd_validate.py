"""Validate an XML example against the official SIRI or NeTEx XSD.

Neither schema is vendored into this repository (see docs/SIRI-PROFILE-BASELINE.md
for why). Instead, the CI workflow checks out a pinned tag of the relevant
official TransmodelEcosystem repository fresh at each run, and this script
points lxml at that checkout via the standard's schema_env_var.
"""
import os

from lxml import etree

from standards import STANDARDS, detect_standard

_schema_cache = {}


def load_schema(standard: str):
    if standard in _schema_cache:
        return _schema_cache[standard]

    config = STANDARDS[standard]
    schema_root = os.environ.get(config["schema_env_var"])
    if not schema_root:
        return None

    schema_path = os.path.join(schema_root, config["schema_root_file"])
    if not os.path.exists(schema_path):
        return None

    doc = etree.parse(schema_path)
    schema = etree.XMLSchema(doc)
    _schema_cache[standard] = schema
    return schema


def validate(xml_text: str):
    """Returns (standard_or_none, attempted, valid, errors)."""
    standard = detect_standard(xml_text)
    if standard is None:
        return None, False, False, ["Root element not recognised as SIRI (<Siri>) or NeTEx (<PublicationDelivery>)."]

    schema = load_schema(standard)
    if schema is None:
        return standard, False, False, [f"No {STANDARDS[standard]['label']} XSD checkout available."]

    try:
        doc = etree.fromstring(xml_text.encode("utf-8"))
    except etree.XMLSyntaxError as error:
        return standard, True, False, [str(error)]

    if schema.validate(doc):
        return standard, True, True, []
    return standard, True, False, [str(error) for error in schema.error_log]
