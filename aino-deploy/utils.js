export function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== "");
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

export function textValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function nowIso() {
  return new Date().toISOString();
}

export function evidence(record, field, value, status, source = "AliExpress product detail", extraction_method = "provider_api") {
  return {
    field,
    value,
    source,
    source_location: null,
    extraction_method,
    status,
    retrieved_at: record.acquisition.retrieved_at,
  };
}

export function addEvidence(record, field, value, status, source, extraction_method) {
  record.evidence.push(
    evidence(record, field, value, status, source, extraction_method)
  );
}
