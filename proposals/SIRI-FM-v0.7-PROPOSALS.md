# SIRI-FM v0.7 proposal bundle

This is an intake package derived from the supplied SIRI-FM v0.7 PDF. It is not a decision and does not change the accepted Nordic profile.

The bundle can be submitted as one parent GitHub issue with six linked child issues. GitHub issue numbers are tracking IDs. Each child is independently reviewable and may be accepted, rejected or deferred. A stable decision ID is assigned only after acceptance.

## Parent issue

**Title:** Review SIRI-FM v0.7 as a set of Nordic profile proposals

**Purpose:** Review the supplied SIRI-FM v0.7 document, confirm source boundaries and coordinate the six child proposals below.

**Source:** `SIRI-FM — The Service Interface for Real Time Information - Facility Monitoring`, v0.7, last changed 21 May 2026, 20 pages.

**Important boundary:** The PDF is evidence for proposals. It is not itself a normative CCB decision. The European SIRI profile, XSD version, generated ontology version and NeTEx facility registry contract must be confirmed separately.

## Child proposals

### FM-001: FacilityMonitoringDelivery and FacilityCondition structure

**Proposed decision:** `required`

**Targets:** `siri:FacilityMonitoringDelivery`, `siri:FacilityCondition`, `siri:ServiceDelivery`

**Proposal:** Require a FacilityMonitoringDelivery to contain one or more FacilityCondition objects. Require FacilityCondition to identify a facility and contain FacilityStatus; allow zero or more MonitoredCounting entries, optional MonitoringInfo, Remedy, SituationRef and ValidityPeriod as described in the PDF.

**Evidence:** PDF pages 2–4, Components and FacilityConditionStructure.

**Open questions:** Exact generated QNames, request/delivery target names, and whether the single XML-file rule belongs here or in a package/delivery decision.

### FM-002: Facility status and remedy semantics

**Proposed decision:** `required`

**Targets:** `siri:FacilityStatus`, `siri:Status`, `siri:Remedy`

**Proposal:** Require FacilityStatus/Status with the values `unknown`, `available`, `notAvailable` or `partiallyAvailable`. Support optional natural-language Description and AccessibilityAssessment. When a facility is partially or completely unavailable, allow or require Remedy according to the confirmed operational rule, with RemedyType values `unknown`, `replace`, `repair` and `remove`.

**Evidence:** PDF pages 4–5 and 9.

**Open questions:** Whether Remedy is conditionally required for unavailable states, and whether additional remedy codes are allowed.

### FM-003: MonitoredCounting and monitoring information

**Proposed decision:** `conditional`

**Targets:** `siri:MonitoredCounting`, `siri:MonitoringInfo`, `siri:MonitoringPeriod`

**Proposal:** Permit repeated MonitoredCounting values for availability, reserved, in-use, out-of-order, present and current-state counts. Count requires an integer value; unit and trend are optional. Permit MonitoringInterval and MonitoringPeriod to describe how the facility status is observed.

**Evidence:** PDF pages 5–8 and example on page 20.

**Open questions:** Confirm the final code lists, the spelling of `CountedFeatureUnit` versus the example's `CountingFeatureUnit`, and whether trend is part of the Nordic contract or only the base schema.

### FM-004: Accessibility, limitations and suitability

**Proposed decision:** `required`

**Targets:** `siri:AccessibilityAssessment`, `siri:AccessibilityLimitation`, `siri:Suitability`, ACSB elements

**Proposal:** Use ACSB for facility accessibility. Require MobilityImpairedAccess when AccessibilityAssessment is present. Support limitations such as wheelchair, step-free, escalator-free, lift-free and audible-signal access, plus suitability statements tied to a UserNeed.

**Evidence:** PDF pages 10–12 and the wheelchair example on page 19.

**Open questions:** Confirm ACSB namespace/QNames, the complete UserNeed vocabulary and whether `unknown`, `false` and `true` are the only permitted accessibility values.

### FM-005: Facility registry, NeTEx references and feature vocabulary

**Proposed decision:** `conditional`

**Targets:** `siri:FacilityRef`, NeTEx facility registry, `Features`, `AllFacilitiesFeatureStructure`

**Proposal:** Resolve FacilityRef against a facility registry containing static facility information. Use the agreed NeTEx facility model where applicable. Support facility feature categories including access facilities and parking facilities, with the PDF's listed values.

**Evidence:** PDF pages 1–2 and 15–16; examples on pages 16–20.

**Open questions:** Identify the exact NeTEx classes and identifier rules, and decide whether Equipment/Parking are NeTEx objects, SIRI-FM vocabulary, or a separate national layer.

### FM-006: SIRI-FM examples as validation fixtures

**Proposed decision:** `informative`

**Targets:** PDF examples, request/delivery pairs, NeTEx static facility data

**Proposal:** Add the supplied examples as positive validation fixtures: minimal request, delivery with multiple conditions, accessibility-filtered request/response, parking request and monitored counting response. Add negative fixtures only after the normative child decisions have been accepted.

**Evidence:** PDF pages 16–20.

**Open questions:** Confirm whether example timestamps and identifiers should be replaced with deterministic fixtures, and define expected validation results for each example.

## Suggested review order

1. Confirm source and version boundaries.
2. Review FM-001 and FM-002 as the structural/status core.
3. Review FM-005 because FacilityRef and the NeTEx registry affect cross-standard semantics.
4. Review FM-003 and FM-004.
5. Accept FM-006 as fixtures only after the normative rules are settled.

## Lifecycle

```text
PDF evidence
  -> parent bundle issue
  -> six child issues
  -> independent CCB review
  -> accepted decision IDs
  -> ontology / SHACL / documentation projection
  -> validation fixtures
```

The bundle is a coordination device. It must not be treated as one indivisible decision.
