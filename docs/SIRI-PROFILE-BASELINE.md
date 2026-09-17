# SIRI profile baseline

This repository uses the following sources as the initial baseline for SIRI-related change control.

## Baseline sources

| Source | Role | Boundary |
|---|---|---|
| [Nordic SIRI Profile](https://entur.atlassian.net/wiki/spaces/PUBLIC/pages/637370420/Nordic+SIRI+Profile) | Human-readable Nordic profile documentation, examples and historical PDF exports | Nordic profile only; version and section must be cited for each decision |
| [Nordic SIRI Ontology](https://github.com/entur/nordic-siri-ontology) | Machine-readable Nordic vocabulary, relationships and SHACL constraints | Nordic localisation of SIRI; downstream service and organisation layers must import it rather than modify it |
| [SIRI Ontology Generator](https://github.com/hfjelstad/siri-ontology-generator) | Deterministic XSD -> RDF/OWL/Turtle generator | A local checkout exists at `Documents/SIRI Ontology`; its generated output is based on the pinned `TransmodelEcosystem/SIRI` submodule |

The local generator checkout contains `vendor/SIRI`, pinned to the `v2.2` branch, and its generated root currently reports `owl:versionInfo "v2.2-6-g7b1463b"`. It also generates a dedicated `siri-fm.ttl` module from `vendor/SIRI/xsd/siri_facilityMonitoring_service.xsd`. This is a useful technical schema and vocabulary source, but it is not by itself a European SIRI profile.

The Nordic SIRI Ontology README describes `siri.ttl` as an unofficial placeholder and `siri-nordic.ttl` as the Nordic profile layer. With the generator checkout available, the intended layering is now:

```
TransmodelEcosystem/SIRI XSD v2.2 (schema source)
	-> SIRI Ontology Generator
	-> siri.ttl and service modules, including siri-fm.ttl (vocabulary projection)
	-> European SIRI profile (separate profile source, to be identified)
	-> Nordic SIRI Ontology / profile constraints
```

## European profile gap

The technical schema and generated ontology are now identified locally, but the European *profile* is still not identified. An XSD defines structural XML vocabulary and validation primitives; it does not by itself establish the European operational profile or all conformance rules. The CCB must therefore keep these layers separate:

1. **SIRI schema/vocabulary**: the versioned XSD and generated RDF/OWL projection.
2. **European SIRI Profile**: the normative European profile document and rules, once identified.
3. **Nordic SIRI Profile**: shared Nordic constraints and semantics derived from the relevant sources.
4. **National or organisation profile**: stricter rules, codespace conventions and operational choices.
5. **Change decision**: a versioned proposal that states which layer it changes and why.

Until the authoritative European profile document, status and version are confirmed, a Nordic decision must not claim that a rule is required by Europe. It should cite the exact XSD tag/commit and generated ontology version as structural evidence, cite the profile source separately, mark the scope as Nordic or national, and record any unresolved upstream dependency.

## Required evidence for a SIRI change request

A request based on this baseline should include:

- profile name and exact version;
- service, message, object and element targets;
- XML namespace, QName or URI where available;
- request/delivery direction and communication pattern;
- cardinality, code list, timing and conditional rules;
- references between SIRI identifiers and NeTEx objects;
- valid and invalid examples with expected validation results;
- source document section and page;
- whether the rule is European/base, Nordic, national or organisation-specific;
- compatibility impact and effective profile version.

For the Finnish SIRI-FM material, this means the NeTEx facility registry, SIRI-FM request and delivery, `FacilityRef` resolution, ACSB accessibility values and monitoring periods should be assessed as related but separately testable decisions.

## Open baseline action

Before accepting a decision that depends on a European SIRI profile, create a clarification or discovery issue to confirm:

- the authoritative European SIRI profile and version;
- which versioned SIRI XSD is the corresponding technical schema source;
- the generator commit and exact generated ontology version;
- how the European constraints map to the Nordic ontology namespaces;
- which Nordic rules are stricter than, equal to or extensions of the European baseline.
