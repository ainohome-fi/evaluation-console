# Aino Selection Console V3.2.3 — Evidence Hand-off Repair

## Fixes
- Imported variant and fulfilment selections persist through Full Assessment and pricing scenario creation.
- The `acquisition_record` evidence is now actually appended to the Selection AI prompt. V3.2.2 displayed the acquisition evidence but accidentally omitted it from the prompt.
- Selection receives structured product overview, specifications, explicit properties, variants, prices, stock, fulfilment, VAT/customs/compliance, sourcing and mandatory-field status.
- Up to 8 captured product images are attached to the Selection prompt as visual evidence.
- Existing V3.2.2 zero-coverage AI cache is invalidated by pipeline version `selection_ai_v1.2_acquisition_handoff`.
- Existing imported ACS network URLs are migrated to a reconstructable AliExpress product URL using the captured Product ID. The network endpoint is retained separately.
- `api/acquisition-import.js` stores `source_page_url` / `canonical_url` separately from `network_capture_url` and prefers a real product-page URL when supplied by the capture client.
- The evidence hand-off explicitly says customer reviews/ratings and sold/order counts were not captured. They are not invented.

## Deployment
1. Replace `index.html` in the Console repository.
2. Replace `api/acquisition-import.js` in the Console repository.
3. Deploy.
4. Re-run the existing assessment. No new acquisition is required to test the hand-off fix.

## Chrome capture URL preservation
Install the companion `Aino AliExpress Capture POC v0.2.6` package for future captures. It records the original AliExpress product-page URL separately from the ACS network URL.

## Scope
This patch fixes the Acquisition → Selection hand-off. It does not yet implement customer-review capture. Review evidence remains a separate acquisition/evidence enhancement.
