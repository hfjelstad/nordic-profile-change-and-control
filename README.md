# Nordic Profile Change and Control Board

Shared decision repository for Nordic NeTEx, SIRI and data-package profiles.

This repository is the human-facing source for profile decisions. It is not the NeTEx ontology and it is not a SIRI implementation. Approved decisions are stored as versioned, machine-readable files that downstream repositories can consume.

## Decision flow

```text
Issue form
  -> CCB review
  -> decision file
  -> accepted / rejected / deferred
  -> generated documentation and validation rules
  -> versioned release
  -> consumed by NeTEx and SIRI repositories
```

## Contributing

Contributors do not need to edit RDF, SHACL or XML, and they do not need to fill in the Issue Form by hand. The form defines the target shape of a proposal, not the required interface: describing a change in plain language to a maintainer, or to an assistant that files the issue in that shape, is an equally valid way in. Start with one of:

- New profile decision
- Change an existing decision
- Clarification
- Data package proposal

The issue captures the discussion and is tracked by its GitHub issue number, such as `#123`. An accepted decision is recorded under `decisions/` and receives a separate stable ID such as `NP-0001`, `SIRI-0001` or `PKG-0001`.

## Decision statuses

- `proposed` - submitted for discussion
- `under-review` - being assessed by CCB
- `accepted` - approved normative decision
- `rejected` - considered and not approved
- `deferred` - deliberately left open
- `implemented` - reflected in consuming technical artefacts
- `deprecated` - no longer applies to new profile versions

Absence of a decision does not mean that a feature is allowed. Unassessed subjects remain `deferred` until decided.

## Decision types

- `required` - must be present when the scope applies
- `optional` - may be present
- `excluded` - must not be used
- `conditional` - governed by an explicit condition
- `national` - outside the common Nordic profile
- `informative` - guidance without a validation requirement

## Repository layout

```text
.github/ISSUE_TEMPLATE/   Issue Forms for contributors
  config.yml
  new-decision.yml
  change-decision.yml
  clarification.yml
  data-package.yml
decisions/                Accepted and versioned decision files
proposals/                Evidence-derived intake bundles and child proposals
schemas/                  Schemas for decision files
examples/                 Small illustrative examples
```

## Bundled proposals

When one source document contains several independently decidable rules, create a parent bundle under `proposals/` and split it into child proposals. The parent issue coordinates the discussion; child issues can be accepted, rejected or deferred separately. GitHub issue numbers remain tracking IDs, while stable decision IDs are assigned only to accepted child decisions.

## Scope

The CCB may decide on:

- NeTEx classes, properties, cardinalities and code values
- SIRI services, messages, references and timing rules
- shared identifiers and cross-standard relationships
- data-package structure, manifests and delivery expectations
- common Nordic requirements versus national extensions

For SIRI work, see [SIRI profile baseline](docs/SIRI-PROFILE-BASELINE.md). The Nordic SIRI Profile and Nordic SIRI Ontology are baseline sources for Nordic decisions, but they do not replace an identified European SIRI baseline.

The intended governance model is a [closed feedback loop](docs/CLOSED-FEEDBACK-LOOP.md): accepted decisions generate ontology, SHACL and documentation artefacts; validation and implementation feedback returns as new linked issues and decisions.

Technical artefacts are generated or maintained in downstream repositories, including the Nordic NeTEx ontology repository.
