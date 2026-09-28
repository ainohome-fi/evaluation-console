# Aino Selection Console V3.2.5.2 — Evidence Reasoning Trace + Review & Visual Inspection

## Replace

Replace these files in the existing Console deployment:

- `index.html`
- `api/acquisition-import.js`

## What changed

### Evidence Reasoning Trace
The sequential pipeline now exposes explicit records for:

1. GATHER — source pack
2. OBSERVE — literal observations
3. SYNTHESIZE — established facts, supplier claims, customer reports, unknowns
4. FOOLPROOF — missing evidence, unsupported claims, contradictions, duplicates, overreach, weak-source dependencies
5. CRITIQUE — Aino DNA support, missing evidence, critique, conclusion, confidence
6. SCORE — deterministic downstream scoring
7. NEXT EVIDENCE — prioritized evidence actions

### New source-specific analysis

- `review_analysis` for individual customer-review evidence
- `visual_inspections` for actual image evidence
- Aggregate ratings remain separate from customer reports.
- Visual observations are restricted to what is visibly observable; no laboratory or long-term safety conclusions are inferred from photos.

### New intake sources

- Customer reviews
- Review summary / aggregate review data
- Visual inspection — product image

### v0.2.8 import
The importer accepts the Chrome Capture v0.2.8 `pageEvidence` payload and imports:

- individual review text as `customer_review` evidence
- captured product screenshots as `image` evidence

Selection remains available when Product Acquisition is PARTIAL.

## No changes

- Aino DNA definitions
- V_A weights
- Selection Score formula
- Score bands
- Gate thresholds
- Pricing formulas
- Commercial rule logic
