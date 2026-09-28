# Aino Selection Console V3.2.5.1

## Evidence Integration & Provenance

V3.2.5.1 is a focused integration release following Chrome Capture v0.2.7.

### Purpose

Make the Console actually consume and reason over the additional evidence already captured by Aino AliExpress Capture v0.2.7.

### Changes

1. **Additional observed evidence is preserved and surfaced**
   - Product rating / valid ratings
   - Product sold text
   - Store marketplace metrics
   - Seller positive rate / seller level
   - Available inventory
   - Product video availability

2. **Evidence reasoning now receives the structured additional evidence directly**
   - The acquisition evidence item includes the structured `additional_observed_evidence` object.
   - The reasoning prompt explicitly distinguishes aggregate marketplace observations from individual customer reports.

3. **Source provenance is explicit**
   - The canonical AliExpress product page is passed into the evidence reasoning context as provenance.
   - The internal AliExpress network endpoint is not required as user-facing provenance.

4. **Product image evidence is handled correctly**
   - Captured supplier image URLs are recognised as an available source.
   - The Console does not claim visual inspection when the images are not supplied as native image evidence to the model.
   - Visual inspection remains a separate evidence action.

5. **Customer review evidence is separated from aggregate metrics**
   - A 4.8 rating / 11 valid ratings, sold count, or store metrics are not treated as review text, review themes, safety reports, durability reports, or satisfaction narratives.
   - When no individual review content is supplied, `customer_review_content` remains a missing evidence source.

6. **Deterministic source-pack guardrails**
   - V3.2.5.1 adds marketplace aggregate metrics to GATHER when they exist.
   - It adds the captured supplier-image source when image URLs exist.
   - It keeps visual inspection and individual customer-review content explicitly missing when they have not actually been supplied.

### What did NOT change

- Aino DNA dimensions
- V_A weights/formula
- Selection Score formula
- Score bands
- Gate thresholds
- Pricing formula
- Commercial rules
- Acquisition mandatory-field logic
- Selection availability for PARTIAL acquisition records

### Required deployment

Replace:

- `index.html` with the V3.2.5.1 version in this patch.
- `api/acquisition-import.js` with the included v0.2.7-compatible import endpoint.

Existing `/api/assess` and `/api/storage` remain unchanged.

### Important

After deployment, **re-run the same AliExpress product assessment** using the fresh v0.2.7 capture. Do not expect an old assessment record to retroactively contain the new reasoning. The new run is the end-to-end validation of:

`v0.2.7 Capture → Acquisition Record → GATHER → OBSERVE → SYNTHESIZE → FOOLPROOF → CRITIQUE → SCORE`
