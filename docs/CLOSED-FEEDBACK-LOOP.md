# Closed feedback loop

The CCB is the decision authority for Nordic profile rules. The human-readable decision register is the product; ontology repositories are machine-readable projections and validation surfaces for those decisions.

## Direction of change

```text
Issue / evidence / implementation feedback
  -> CCB review
  -> accepted decision YAML
  -> ontology and SHACL generation
  -> released profile artefacts
  -> validation and consumer implementations
  -> new evidence or change request
```

The loop is closed when every generated rule can be traced back to an accepted decision, and every proposed change enters through a decision or clarification rather than being edited directly into generated ontology output. Readers should be able to understand the profile without opening RDF, OWL or SHACL.

## Source-of-truth boundaries

| Layer | Source of truth | May change directly? |
|---|---|---|
| Standard schema | Versioned external XSD, such as the SIRI schema source | No, not in this repository |
| European profile | Identified normative European profile document and version | No, unless governed by its owner |
| Nordic decision | Human-readable decision record, represented as accepted YAML under `decisions/` | Yes, through CCB review |
| Nordic ontology overlay | Generated or maintained projection of accepted decisions | Only through the corresponding decision and generation workflow |
| SHACL and documentation | Generated consumer artefacts | No direct normative edits |
| Implementation feedback | Validation results, examples, defects and change proposals | Feeds a new issue or clarification |

A generated ontology may expose a missing rule, an incorrect mapping or an unusable constraint. That is evidence for a new CCB change; it does not silently change the normative decision.

## Decision-to-ontology traceability

Each accepted decision should provide enough information for an ontology or validation repository to record:

- the stable decision ID and GitHub issue number;
- source profile and version;
- exact class, property, service, message or XML target;
- decision type and machine-readable rule;
- scope and effective profile version;
- source evidence and examples;
- affected generated artefacts;
- implementation or validation result.

The ontology layer should link generated shapes, vocabulary terms or bridge mappings back to the decision ID. A release manifest should list the decision IDs included in each ontology/profile release.

## Recommended workflow

1. A contributor submits an issue with source evidence and examples. If the source contains several independently decidable rules, the issue may be a parent bundle with linked child issues.
2. CCB reviewers classify each proposal as European/base, Nordic, national or organisation-specific.
3. Each accepted proposal is written to `decisions/` with its own stable ID; rejected and deferred children remain traceable through the issue bundle.
4. A generator or controlled projection creates ontology terms, SHACL constraints, documentation and test fixtures.
5. CI validates that generated artefacts are reproducible and that each changed artefact has decision provenance.
6. Consumers validate representative data and report failures as linked issues.
7. A defect or changed requirement creates a new decision/change/clarification; generated output is never patched as the final fix.

## NeTEx and SIRI application

The Nordic NeTEx Ontology already demonstrates the intended layering:

```text
Generated NeTEx base
  -> Nordic NeTEx SHACL and vocabulary overlay
  -> SIRI bridge and downstream organisation layers
```

The Nordic SIRI Ontology and the local SIRI Ontology Generator should follow the same pattern:

```text
SIRI XSD schema source
  -> generated SIRI vocabulary modules
  -> identified European profile rules
  -> Nordic SIRI decisions and SHACL overlay
  -> service, country or organisation layers
```

The CCB decision repository sits beside these repositories as the governance source for the Nordic overlay. It should not become a second ontology repository, and the ontology repositories should not become hidden decision registers.

## Minimum release gate

A Nordic profile release should be blocked when any of the following is missing:

- a stable decision ID for each normative change;
- an identified source profile/version;
- exact target and rule semantics;
- a reproducible generated artefact diff;
- at least one positive and negative validation example where applicable;
- a link from generated output back to the decision set;
- a recorded compatibility and effective-version impact.
