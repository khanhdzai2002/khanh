import { z } from "zod";
import { AppError, sizes } from "./domain";
import { matchColor, type ColorAlias } from "./incoming-goods";
const itemSchema = z
  .object({
    sku: z.string().trim().min(1).max(90),
    color: z.string().trim().min(1).max(200),
    size: z.enum([...sizes, "XS", "XXL", "2XL"]),
    quantity: z.number().int().min(0).max(1000000),
    source_row: z.number().int().min(1).max(1000000),
    bag_no: z.string().trim().max(80).default(""),
    sku_source: z.string().max(100).default(""),
    needs_review: z.boolean().default(false),
    review_note: z.string().max(2000).default(""),
  })
  .strict();
export const receiptJsonSchema = z
  .object({
    schema: z.literal("comsflow.production.import.v1"),
    import_mode: z.literal("WAREHOUSE_RECEIPT"),
    document: z
      .object({
        document_id: z.string().trim().min(1).max(150),
        document_type: z.literal("WAREHOUSE_RECEIPT"),
        document_type_label: z.string().max(200).optional(),
        receipt_date: z.iso.date(),
        inspection_date: z.iso.date().optional(),
        receipt_number: z.string().max(100).optional(),
        supplier: z.string().trim().min(1).max(200),
        supplier_review_required: z.boolean().default(false),
        checker: z.string().max(500).default(""),
      })
      .strict(),
    items: z.array(itemSchema).min(1).max(2000),
    notes: z.array(z.string().max(2000)).max(100).default([]),
  })
  .strict();
export type JsonReceipt = z.infer<typeof receiptJsonSchema>;
export type JsonLine = {
  key: string;
  sourceRow: number;
  bag: string;
  sku: string;
  color: string;
  quantities: Record<(typeof sizes)[number], number>;
  needsReview: boolean;
  reviewNotes: string[];
  skuSources: string[];
  sourceItems: number[];
};
export function parseReceiptJson(text: string) {
  if (text.length > 1000000)
    throw new AppError(400, "JSON tối đa 1.000.000 ký tự");
  const content = text
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AppError(
      400,
      "JSON không hợp lệ. Dán nguyên một đối tượng JSON, kiểm tra dấu phẩy và dấu ngoặc",
    );
  }
  const checked = receiptJsonSchema.safeParse(raw);
  if (!checked.success) {
    const errors = checked.error.issues
      .slice(0, 5)
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(" · ");
    throw new AppError(
      400,
      "Chỉ nhận JSON WAREHOUSE_RECEIPT theo comsflow.production.import.v1; không nhập JSON lệnh sản xuất. " +
        errors,
    );
  }
  const source = checked.data,
    lines: JsonLine[] = [],
    groups = new Map<string, JsonLine>();
  let ignoredZero = 0;
  source.items.forEach((item, index) => {
    if (!item.quantity) {
      ignoredZero++;
      return;
    }
    if (!(sizes as readonly string[]).includes(item.size))
      throw new AppError(
        400,
        `Dòng ${item.source_row}: size ${item.size} đã ngừng; sửa nguồn trước khi nhập, không tự chuyển sang XL`,
      );
    const sku = item.sku.toUpperCase(),
      key = JSON.stringify([item.source_row, item.bag_no, sku, item.color]);
    let line = groups.get(key);
    if (!line) {
      line = {
        key: String(lines.length + 1),
        sourceRow: item.source_row,
        bag: item.bag_no,
        sku,
        color: item.color,
        quantities: { S: 0, M: 0, L: 0, XL: 0 },
        needsReview: false,
        reviewNotes: [],
        skuSources: [],
        sourceItems: [],
      };
      groups.set(key, line);
      lines.push(line);
    }
    const size = item.size as (typeof sizes)[number];
    line.quantities[size] += item.quantity;
    if (line.quantities[size] > 1000000)
      throw new AppError(
        400,
        `Dòng ${item.source_row}: tổng size ${size} vượt 1.000.000`,
      );
    line.needsReview ||= item.needs_review;
    if (item.review_note && !line.reviewNotes.includes(item.review_note))
      line.reviewNotes.push(item.review_note);
    if (item.sku_source && !line.skuSources.includes(item.sku_source))
      line.skuSources.push(item.sku_source);
    line.sourceItems.push(index + 1);
  });
  if (!lines.length)
    throw new AppError(400, "JSON không có sản phẩm có số lượng dương");
  if (lines.length > 250)
    throw new AppError(
      400,
      "Tối đa 250 dòng mã–màu mỗi phiếu (1.000 ô size). Chia chứng từ thành các phiếu có mã riêng",
    );
  return {
    source,
    lines,
    total: lines.reduce(
      (n, l) => n + sizes.reduce((n, s) => n + l.quantities[s], 0),
      0,
    ),
    ignoredZero,
  };
}
export type JsonVariant = {
  id: string;
  sku: string;
  color: string;
  size: string;
};
export function jsonSuggestions(
  lines: JsonLine[],
  variants: JsonVariant[],
  aliases: ColorAlias[],
) {
  return lines.map((line) => {
    const candidates = variants.filter(
      (v) => v.sku.toUpperCase() === line.sku.toUpperCase(),
    );
    const exact = [...new Set(candidates.map((v) => v.color))].filter(
      (c) => c.trim().toLowerCase() === line.color.trim().toLowerCase(),
    );
    const match =
      exact.length === 1
        ? { color: exact[0], source: "Khớp danh mục" }
        : matchColor(line.sku, line.color, candidates as any, aliases);
    if (!exact.length && match.source === "Khớp danh mục")
      match.source = "Gợi ý chuẩn hóa — cần kiểm tra";
    return {
      ...line,
      suggestedSku: candidates[0]?.sku || line.sku,
      suggestedColor: match.color,
      matchSource: match.source,
      knownSku: !!candidates.length,
    };
  });
}
export const jsonCreateSchema = z
  .object({
    date: z.iso.date(),
    supplier: z.string().trim().min(1).max(200),
    note: z.string().max(500).default(""),
    metadataReviewed: z.literal(true),
    mappings: z
      .array(
        z
          .object({
            key: z.string().min(1).max(20),
            sku: z.string().trim().min(1).max(90),
            color: z.string().trim().min(1).max(200),
            keepUnmatched: z.boolean(),
            reviewed: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(250),
  })
  .strict();
export function jsonMappingNeedsReview(
  suggestion: ReturnType<typeof jsonSuggestions>[number],
  mapping: z.infer<typeof jsonCreateSchema>["mappings"][number],
) {
  const exact =
    mapping.sku.toUpperCase() === suggestion.suggestedSku.toUpperCase() &&
    mapping.color === suggestion.suggestedColor &&
    ["Khớp danh mục", "Quy ước đã lưu"].includes(suggestion.matchSource);
  return suggestion.needsReview || mapping.keepUnmatched || !exact;
}
export function jsonMappingVisualState(
  suggestion: ReturnType<typeof jsonSuggestions>[number],
  mapping: z.infer<typeof jsonCreateSchema>["mappings"][number],
  variants: JsonVariant[],
) {
  if (mapping.keepUnmatched)
    return {
      kind: "unmatched",
      tone: mapping.reviewed ? "purple" : "amber",
      label: "Chưa đối chiếu lệnh",
      detail: mapping.reviewed
        ? "Đã xác nhận giữ nguyên mã/màu nguồn"
        : "Cần xác nhận đã kiểm tra dòng",
      pendingReview: !mapping.reviewed,
      needsAction: !mapping.reviewed,
    };
  const knownSku = variants.some(
    (v) => v.sku.toUpperCase() === mapping.sku.toUpperCase(),
  );
  const knownColor = variants.some(
    (v) =>
      v.sku.toUpperCase() === mapping.sku.toUpperCase() &&
      v.color.trim().toLowerCase() === mapping.color.trim().toLowerCase(),
  );
  if (!knownSku || !mapping.color || !knownColor)
    return {
      kind: "missing",
      tone: "red",
      label: !knownSku ? "Cần chọn mã / màu" : "Cần chọn màu",
      detail: "Chọn danh mục hoặc giữ nguyên chưa đối chiếu",
      pendingReview: false,
      needsAction: true,
    };
  const needs = jsonMappingNeedsReview(suggestion, mapping);
  if (needs && !mapping.reviewed) {
    const unchanged =
      mapping.sku.toUpperCase() === suggestion.suggestedSku.toUpperCase() &&
      mapping.color === suggestion.suggestedColor;
    return {
      kind: "review",
      tone: "amber",
      label:
        unchanged && suggestion.matchSource.startsWith("Gợi ý")
          ? suggestion.matchSource
          : unchanged && suggestion.needsReview
            ? "Khớp màu · nguồn cần kiểm tra"
            : "Đã chọn lại · cần kiểm tra",
      detail: "Xác nhận dòng sau khi kiểm tra mã, màu và số lượng",
      pendingReview: true,
      needsAction: true,
    };
  }
  return {
    kind: "ready",
    tone: "green",
    label: needs ? "Đã kiểm tra ánh xạ" : suggestion.matchSource,
    detail: needs
      ? "Đã xác nhận mã và màu đang chọn"
      : "Mã và màu khớp danh mục",
    pendingReview: false,
    needsAction: false,
  };
}
