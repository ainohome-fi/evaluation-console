# Aino Selection Console V3.2.5.10

Focused patch from the V3.2.5.8 source.

## Changes
- Restores visible previews for URL-based visual evidence using the Aino image proxy.
- Keeps pasted/base64 image evidence working as before.
- Makes the image proxy inspect response bytes instead of trusting CDN Content-Type alone.
- Adds AliExpress CDN-friendly request headers.
- Sends normalized JPEG/PNG/GIF/WebP data URLs to the assessment API.
- Produces evidence-specific image errors when a supplier image genuinely cannot be decoded.
- Keeps the individual sidebar delete function from V3.2.5.8.
- Prevents `[object Object]` from being rendered as a customer review when a usable nested review text field exists.
- Updates visible Console version labels to V3.2.5.10.

## Unchanged
- Selection scoring / VA / DNA / Gate
- Pricing and margin logic
- Acquisition import schema
- Evidence reasoning architecture
- Capture extension
- Maximum 3 unique customer reviews


## V3.2.5.10 diagnostic focus
The prior deployment requested AVIF in the upstream Accept header. AliExpress can content-negotiate a .jpg URL into AVIF, producing the observed 'Supplier returned AVIF/HEIF' error. This build stops advertising AVIF and retries with strict JPEG when needed. Visual preview also attempts the captured supplier URL directly before proxy normalization.
