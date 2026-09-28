# Aino Selection Console V3.2.5.3 — Evidence Reasoning Integration

Replace the existing Console `index.html` and `api/acquisition-import.js` with the files in this patch.

## Changes
- Fixes structured AliExpress customer reviews being rendered as `[object Object]`.
- Preserves review records (rating/date/country/verified purchase/review media metadata where available).
- Imports up to 4 captured visual evidence images instead of truncating at 3.
- Preserves review network-source URLs and acquisition network capture URL as provenance.
- Adds capture provenance to the acquisition record.
- Preserves evidence metadata during Console DOM synchronisation.
- Invalidates the prior AI evidence cache with pipeline version `selection_ai_v2.2_evidence_reasoning_trace`.
- Updates visible Console version labels to V3.2.5.3.

## Reasoning contract
GATHER → OBSERVE → SYNTHESIZE → FOOLPROOF → CRITIQUE → SCORE → NEXT EVIDENCE.

No DNA weights, thresholds, score bands, or pricing formulas were changed. Acquisition PARTIAL remains a flag and does not block Selection.
