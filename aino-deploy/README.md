# Aino Selection Console V3.2.5.7 — Image Evidence Fix

This package is based directly on the supplied Aino Selection Console
V3.2.5.7 final-patch source.

## Fixed

### 1. Stale version label
The supplied UI displayed V3.2.5.3 in the pass-gate/sidebar.
It now displays V3.2.5.7.

### 2. Remote visual evidence transport
The supplied Console sent remote image evidence directly to `/api/assess`
as an external image URL. That left the model provider responsible for
retrieving AliExpress CDN images and could produce:

    messages[0].image[1]: unsupported image

The patched Console now:

    image URL
      -> /api/image-proxy
      -> server-side fetch
      -> MIME validation
      -> base64 data URL
      -> /api/assess
      -> multimodal model

### 3. Evidence-level diagnostics
A failed remote image is reported with its evidence number and source URL.
Existing `diagnoseAndFlagEvidence()` can highlight the offending evidence.

### 4. Diagnostic isolation
`testImageUrl()` now tests the Aino image proxy rather than asking the model
provider to fetch the original supplier URL.

## Files changed

- `index.html`
- `api/image-proxy.js`

Existing:
- `api/acquisition-import.js` is preserved unchanged.

## Important deployment note

The supplied V3.2.5.7 ZIP did not contain `api/assess.js`. This patch therefore
fixes the image handoff without replacing or inventing the live assessment
backend. Deploy the package together with the existing V3.2.5.7 backend.

The proxy uses `APP_PASSWORD` when it is configured, matching the Console's
existing `x-app-password` request header.

## What is NOT changed

- Aino DNA
- Gate thresholds
- signal definitions
- scoring weights
- Selection Score
- pricing formulas
- acquisition schema
- review limit (3)
- AI Overview handling
- customer-review handling
- visual-inspection output schema

## Test

1. Deploy.
2. Open the same imported v0.2.14.1 acquisition record.
3. Confirm the Console header/sidebar says V3.2.5.7.
4. Confirm four visual evidence cards are present.
5. Run Full Assessment.
6. The four remote images should be converted to data URLs before reaching
   the assessment endpoint.
