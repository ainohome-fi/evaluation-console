# Aino Selection Console V3.2.3 Hotfix 1

## Fix
Prevents imported AliExpress supplier CDN image URLs from being sent directly as native model image blocks during Selection assessment. Some supplier CDN responses are rejected by the model provider as unsupported images, causing the whole assessment to fail.

## Behaviour
- Acquisition evidence remains fully available to Selection as structured/text evidence.
- Captured image URLs are retained as provenance text, but are not treated as visually inspected evidence.
- User-pasted/base64 image evidence continues to use native image input.
- No acquisition data is deleted.
- This is a safety/availability hotfix. A future image-normalisation proxy can restore native visual inspection of supplier images by fetching and converting them to validated JPEG/PNG/WebP bytes before submission.

Replace `index.html` in the existing Console project. No backend change is required for this hotfix.
