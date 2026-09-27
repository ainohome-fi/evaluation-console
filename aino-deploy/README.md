# Aino Selection Console V3.2.4

## Evidence-state + Acquisition UI repair

Replace the existing `index.html` in the Aino Selection Console deployment with this file.

### Included

1. **Product Acquisition detail panel**
   - Data-quality flag remains visible immediately below the acquisition header.
   - Detailed Product Acquisition data is collapsed by default.
   - Human-readable field formatting replaces raw consecutive supplier text where possible.
   - Features/properties are rendered as bullets.
   - Images are summarized as captured image links rather than long URL strings.
   - Variants are summarized by count and EUR price range, with the detailed table retained below.
   - Supplier price observations are summarized instead of repeated raw strings.
   - VAT and customs/compliance evidence are split into readable bullet points.
   - Raw acquisition evidence, canonical Product Record, and raw supplier response remain available through inspection controls.

2. **Evidence-state / Gate repair**
   - `NO_EVIDENCE` is never treated as a product failure.
   - A partial DNA profile produces `HOLD`, not `REJECT`.
   - A measured DNA threshold shortfall is a hard `REJECT` only when that dimension has at least 60% evidence confidence.
   - A threshold shortfall below the 60% confidence floor becomes `HOLD` with `*_THRESHOLD_UNVERIFIED`.
   - Critical, explicitly evidenced safety hazards remain hard `REJECT` conditions.
   - Safety evidence below its configured floor remains a safety watch and can cap `SELECT` at `TEST`; it does not itself create a product rejection.
   - Gate messaging explicitly distinguishes unresolved evidence from measured failure.

3. **Selection pipeline version**
   - Updated to `selection_ai_v1.3_evidence_state_gate_repair` so the repaired evidence/Gate behavior is distinguishable from the previous hotfix pipeline.

4. **Existing V3.2.3 Hotfix 1 behavior retained**
   - Acquisition evidence is passed to Selection without native supplier CDN image blocks that previously caused unsupported-image request failures.
   - Imported variant and fulfilment selections remain persistent through assessment re-rendering.

### Important

This release does not change the underlying Selection Score weights or thresholds. It changes how missing and low-confidence evidence is treated by the Gate so that an evidence gap is not silently converted into a product failure.
