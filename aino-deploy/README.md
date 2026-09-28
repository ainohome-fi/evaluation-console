# Aino Console acquisition-import v0.2.7 compatibility patch

Replace the existing `api/acquisition-import.js` with this file when deploying the Aino AliExpress Capture v0.2.7 extension.

Changes:
- preserves `source_page_url` as the canonical product URL instead of the AliExpress ACS network URL
- stores `additional_observed_evidence` inside the canonical acquisition record
- includes the additional observations in the evidence summary used by Assessment Setup / evidence intake
- updates acquisition schema and adapter labels to `V0.2.7`

No selection formula, DNA, pricing formula, commercial rule, or acquisition mandatory-field logic is changed.
