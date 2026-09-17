# Consumer contract

This document defines the minimum information an accepted CCB decision must provide before a technical repository can consume it automatically.

The issue form is for discussion. The decision file is the normative input. Free-text discussion must not be required to generate a rule.

## Required decision fields

| Field | Purpose |
|---|---|
| `id` | Stable identifier, for example `NP-0001` or `SIRI-0001` |
| `standard` | `netex`, `siri`, `both` or `package` |
| `profile` | Target profile identifier |
| `profileVersion` | Source profile or protocol version the decision applies to |
| `status` | Only `accepted` or `implemented` is consumable as a normative rule |
| `subject` | Exact target in the source standard |
| `decision.type` | `required`, `optional`, `excluded`, `conditional`, `national` or `informative` |
| `decision.rule` | Machine-readable constraint or structural rule |
| `scope` | Countries, services, messages, frames or package context |
| `ccb.decisionVersion` | Profile version in which the decision applies |
| `ccb.effectiveFrom` | First effective profile version |

## NeTEx target

The target must use the generated ontology names, not display labels:

```yaml
subject:
  class: netex:StopPlace
  property: netex:parentSiteRef
```

The consumer needs the exact generated property URI or a stable QName. A human label such as `ParentSiteRef` is not sufficient.

For cross-standard decisions, `subject` should also identify the request and delivery message, and the reference target used to resolve identifiers such as a SIRI `FacilityRef` against a NeTEx facility registry.

Supported first-generation rule fields should include:

```yaml
decision:
  type: excluded
  rule:
    minCount: 0
    maxCount: 0
    class: null
    datatype: null
    in: []
    condition: null
    codes: []
    timing: null
    reference: null
```

The same shape can express a required property:

```yaml
decision:
  type: required
  rule:
    minCount: 1
    maxCount: 1
    class: netex:Route
```

Separate decision types are needed for rules that do not become a property shape, such as:

- `element-order`
- `frame-containment`
- `specialization`
- `domain-chain`
- `mapping`

These must identify the exact source and target terms and should not be encoded only in `rationale`.

## SIRI target

SIRI decisions need a service and message target in addition to a property:

```yaml
subject:
  service: siri:EstimatedTimetable
  message: siri:EstimatedVehicleJourney
  property: siri:FramedVehicleJourneyRef
```

The rule must be able to express cardinality, reference target, conditional requirements, timing constraints and links to NeTEx identifiers.

## Data package target

Package decisions need an explicit package contract rather than a prose description:

```yaml
subject:
  package: nordic:StaticTimetablePackage
decision:
  type: required
  rule:
    manifest: true
    files:
      - path: data/service-frame.xml
        mediaType: application/xml
        required: true
    profileVersion: required
    checksum: required
```

## What is generated downstream

An accepted release from this repository should be consumable by:

1. The Nordic NeTEx repository, which generates or updates SHACL, profile metadata, element ordering and structural overlays.
2. A SIRI profile repository, which generates or updates SIRI validation and cross-standard reference rules.
3. Documentation tooling, which produces the human-readable decision matrix.

The CCB repository should not require downstream repositories to infer whether a statement is normative from Markdown wording.

## Current gap

The initial template is intentionally human-friendly, but it is not yet a complete consumer contract. Before the first technical release, decisions need exact QName/URI targets, typed rule fields, explicit scopes and a versioned release manifest.
