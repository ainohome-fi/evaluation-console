# Aino Selection Console V3.2.5.7 — Evidence Import Handoff Patch

Replace `index.html` and `api/acquisition-import.js` in the existing Aino Selection Console deployment.

## Fixes
- Updates Console UI version to V3.2.5.7.
- Updates imported acquisition adapter/schema to Aino Chrome Capture v0.2.14.1 / `AINO_PRODUCT_ACQUISITION_RECORD_V0.2.14.1`.
- Preserves the captured network response URL in Console provenance.
- Imports the captured AliExpress AI Overview as a separate `supplier_ai_overview` evidence source with explicit provenance that it is platform-generated and not merchant-authored.
- Uses the captured AI Overview as the fallback product description in the canonical acquisition record when no merchant-authored description is available, while preserving its provenance.
- Persists page evidence, including customer reviews and visual evidence, in the canonical acquisition record/evidence pack.
- Keeps aggregate marketplace observations separate from individual customer reviews.

## Important
This patch does not run an assessment and does not change Aino DNA, scoring weights, Gate thresholds, or pricing formulas.

After deployment, re-import the same v0.2.14.1 capture before running Full Assessment.
