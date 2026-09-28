# Aino Selection Console V3.2.5.11

Focused image-pipeline reliability patch from V3.2.5.10.

## Fixes
- Prevents visual evidence cards from remaining indefinitely at `Loading captured image…`.
- Adds hard timeouts to browser-side image retrieval and decoding.
- Adds hard timeouts to server-side supplier CDN retrieval and JPEG retry.
- Detects AVIF/HEIF bytes instead of misclassifying them as a generic unsupported image.
- Allows AVIF transport to the browser for preview when Chrome can decode it.
- Converts browser-decodable AVIF/HEIF evidence to JPEG before the model assessment request.
- Keeps JPEG/PNG/GIF/WebP on the direct model-safe path.
- Uses the same normalized image path for assessment and preview where possible.
- Keeps direct supplier URL fallback bounded by an 8-second timeout.

## Unchanged
- Selection scoring / VA / DNA / Gate
- Pricing and margin logic
- Acquisition import schema
- Evidence reasoning architecture
- Capture extension
- Maximum 3 unique customer reviews
- Individual sidebar item deletion

## Diagnostic intent
V3.2.5.10 could leave a visual card at `Loading captured image…` because both the browser image request and the Aino proxy request could remain pending indefinitely. V3.2.5.11 makes every branch time-bounded and treats AVIF as a browser-decodable transport format, then converts it to JPEG in-browser for the model path.
