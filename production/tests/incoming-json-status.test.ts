import { it, expect } from "vitest";
import {
  parseReceiptJson,
  jsonSuggestions,
  jsonMappingVisualState,
} from "../shared/incoming-json";
const variants = [
  { id: "black", sku: "SYNTHETIC", color: "Đen", size: "M" },
  { id: "gray", sku: "SYNTHETIC", color: "Xám tiêu đậm", size: "M" },
];
function fixture(color: string, flag = false) {
  const p = parseReceiptJson(
    JSON.stringify({
      schema: "comsflow.production.import.v1",
      import_mode: "WAREHOUSE_RECEIPT",
      document: {
        document_id: "SYNTHETIC-STATUS",
        document_type: "WAREHOUSE_RECEIPT",
        receipt_date: "2026-11-02",
        supplier: "Synthetic",
      },
      items: [
        {
          sku: "SYNTHETIC",
          color,
          size: "M",
          quantity: 10,
          source_row: 1,
          needs_review: flag,
        },
      ],
    }),
  );
  const line = jsonSuggestions(p.lines, variants, [])[0];
  return {
    line,
    mapping: {
      key: line.key,
      sku: line.suggestedSku,
      color: line.suggestedColor,
      keepUnmatched: false,
      reviewed: false,
    },
  };
}
it("exact catalogue match is ready while a flagged source still requires amber review", () => {
  const a = fixture("Đen");
  expect(jsonMappingVisualState(a.line, a.mapping, variants)).toMatchObject({
    kind: "ready",
    tone: "green",
    label: "Khớp danh mục",
    needsAction: false,
  });
  const b = fixture("Đen", true);
  expect(jsonMappingVisualState(b.line, b.mapping, variants)).toMatchObject({
    kind: "review",
    tone: "amber",
    needsAction: true,
  });
  expect(
    jsonMappingVisualState(b.line, { ...b.mapping, reviewed: true }, variants)
      .tone,
  ).toBe("green");
});
it("missing or stale catalogue choices stay red even if their review checkbox was checked", () => {
  const a = fixture("Trắng");
  expect(
    jsonMappingVisualState(a.line, { ...a.mapping, reviewed: true }, variants),
  ).toMatchObject({ kind: "missing", tone: "red" });
  const b = fixture("Đen");
  expect(
    jsonMappingVisualState(
      b.line,
      { ...b.mapping, sku: "UNKNOWN", reviewed: true },
      variants,
    ).kind,
  ).toBe("missing");
  expect(jsonMappingVisualState(b.line, b.mapping, []).kind).toBe("missing");
});
it("suggested/manual colour changes switch from amber to green only after review and never retain a stale match label", () => {
  const a = fixture("Xám đậm");
  expect(jsonMappingVisualState(a.line, a.mapping, variants)).toMatchObject({
    kind: "review",
    tone: "amber",
  });
  expect(
    jsonMappingVisualState(a.line, { ...a.mapping, reviewed: true }, variants),
  ).toMatchObject({ kind: "ready", label: "Đã kiểm tra ánh xạ" });
  const b = fixture("Đen"),
    changed = { ...b.mapping, color: "Xám tiêu đậm" };
  expect(jsonMappingVisualState(b.line, changed, variants)).toMatchObject({
    tone: "amber",
    label: "Đã chọn lại · cần kiểm tra",
  });
  expect(
    jsonMappingVisualState(
      b.line,
      { ...changed, color: "", reviewed: true },
      variants,
    ).tone,
  ).toBe("red");
});
it("unmatched choices remain clearly separate and require their own acknowledgement", () => {
  const a = fixture("Không rõ"),
    m = { ...a.mapping, color: "Không rõ", keepUnmatched: true };
  expect(jsonMappingVisualState(a.line, m, variants)).toMatchObject({
    kind: "unmatched",
    tone: "amber",
    pendingReview: true,
  });
  expect(
    jsonMappingVisualState(a.line, { ...m, reviewed: true }, variants),
  ).toMatchObject({ kind: "unmatched", tone: "purple", needsAction: false });
});
