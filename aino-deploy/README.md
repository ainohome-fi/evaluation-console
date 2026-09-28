# Aino Selection Console V3.2.5.4 — Evidence Object & Provenance Repair

Patch for the existing Aino Selection Console.

## Replace
- `index.html`
- `api/acquisition-import.js`

## Purpose
Repairs the evidence-object/provenance hand-off exposed by V3.2.5.3 testing.

### Fixes
- Normalizes structured customer-review records before rendering, preventing `[object Object]` from appearing in Evidence Intake.
- Rebuilds review evidence from `acquisition.page_evidence.customer_reviews` when an older imported record flattened the records.
- Preserves review provenance and review network-source URLs.
- Rebuilds supplier-image evidence from `acquisition.page_evidence.visual_inspection.images` when available.
- Adds stable evidence IDs: `SUP-001`, `REV-PACK-001`, `IMG-001`…
- Preserves PDP network-capture provenance in the acquisition evidence object.
- Bumps the reasoning cache key to `selection_ai_v2.3_evidence_object_provenance`.
- Fixes the acquisition-import summary's page-evidence scope bug.

## Deliberately unchanged
- Aino DNA definitions and weights
- V_A / Selection Score mathematics
- Gate thresholds and decision bands
- Pricing formulas and commercial rules
- PARTIAL acquisition behavior

After deployment, re-import the same v0.2.10 capture. The existing captured `page_evidence` is sufficient to repair the review and visual evidence objects without another AliExpress capture.
