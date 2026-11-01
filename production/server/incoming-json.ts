import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { pool, transaction, audit, type DB } from "./db";
import { permission } from "./auth";
import { AppError, sizes } from "../shared/domain";
import {
  parseReceiptJson,
  jsonSuggestions,
  jsonCreateSchema,
  jsonMappingNeedsReview,
  type JsonVariant,
} from "../shared/incoming-json";
import { createIncoming, saveIncoming, incomingDraft } from "./incoming-goods";
import type { Actor } from "./service";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function catalog(db: DB) {
  const variants = (
    await db.query(
      "SELECT id,body->>'sku' AS sku,body->>'color' AS color,size FROM variants WHERE size=ANY($1::text[]) ORDER BY body->>'sku',body->>'color',size",
      [sizes],
    )
  ).rows as JsonVariant[];
  const aliases = (
    await db.query(
      "SELECT p.code AS sku,a.raw_color,a.color FROM incoming_color_aliases a JOIN products p ON p.id=a.product_id",
    )
  ).rows;
  return { variants, aliases };
}
export async function previewReceiptJson(db: DB, actor: Actor, raw: unknown) {
  const { text } = z
      .object({ text: z.string().min(2).max(1000000) })
      .strict()
      .parse(raw),
    parsed = parseReceiptJson(text),
    c = await catalog(db),
    id = randomUUID();
  await db.query(
    "INSERT INTO import_previews(id,actor_id,kind,body) VALUES($1,$2,'incoming-json',$3)",
    [id, actor.id, JSON.stringify(parsed)],
  );
  return {
    id,
    ...parsed,
    lines: jsonSuggestions(parsed.lines, c.variants, c.aliases),
    variants: c.variants,
    suppliers: (
      await db.query("SELECT name FROM suppliers ORDER BY name")
    ).rows.map((r) => r.name),
  };
}
export async function createJsonReceipt(
  db: DB,
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const input = jsonCreateSchema.parse(raw),
    requestHash = hash(input);
  const preview = (
    await db.query(
      "SELECT * FROM import_previews WHERE id=$1 AND actor_id=$2 AND kind='incoming-json' FOR UPDATE",
      [id, actor.id],
    )
  ).rows[0];
  if (!preview)
    throw new AppError(404, "Không tìm thấy bản xem trước JSON được phép dùng");
  if (preview.status === "confirmed") {
    if (preview.body.requestHash !== requestHash)
      throw new AppError(
        409,
        "Bản xem trước đã tạo phiếu với nội dung khác. Mở phiếu đã lưu",
      );
    return { id: preview.body.draftId };
  }
  if (
    preview.status !== "pending" ||
    Date.now() - new Date(preview.created_at).getTime() > 30 * 60000
  )
    throw new AppError(
      409,
      "Bản xem trước JSON hết hạn. Đọc lại JSON trước khi tạo phiếu",
    );
  const parsed = parseReceiptJson(JSON.stringify(preview.body.source)),
    { source, lines } = parsed,
    c = await catalog(db),
    suggestions = jsonSuggestions(lines, c.variants, c.aliases);
  if (
    input.mappings.length !== lines.length ||
    new Set(input.mappings.map((m) => m.key)).size !== lines.length ||
    input.mappings.some((m) => !lines.some((l) => l.key === m.key))
  )
    throw new AppError(
      400,
      "Ánh xạ phải có đủ từng dòng nguồn, không được trùng hoặc bỏ dòng",
    );
  const documentKey = source.document.document_id
    .normalize("NFKC")
    .toUpperCase();
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "incoming-json:" + documentKey,
  ]);
  if (
    (
      await db.query(
        "SELECT 1 FROM incoming_json_sources WHERE document_key=$1",
        [documentKey],
      )
    ).rowCount
  )
    throw new AppError(
      409,
      "Mã chứng từ JSON này đã có phiếu trên hệ thống. Mở lại phiếu đã lưu trong danh sách, không nhập lần nữa",
    );
  const bags = new Map<string, string>(),
    rows = [];
  for (const line of lines) {
    const m = input.mappings.find((m) => m.key === line.key)!,
      suggestion = suggestions.find((s) => s.key === line.key)!;
    const sku = m.sku.toUpperCase();
    const sameColor = (v: JsonVariant) =>
      v.sku.toUpperCase() === sku &&
      v.color.trim().toLowerCase() === m.color.trim().toLowerCase();
    if (!m.keepUnmatched && !c.variants.some(sameColor))
      throw new AppError(
        400,
        `Dòng ${line.sourceRow}: chọn đúng mã/màu danh mục hoặc chủ động giữ hàng chưa đối chiếu`,
      );
    if (jsonMappingNeedsReview(suggestion, m) && !m.reviewed)
      throw new AppError(
        400,
        `Dòng ${line.sourceRow}: cần xác nhận đã kiểm tra nội dung và ánh xạ`,
      );
    const bagKey = line.bag
      ? "label:" + line.bag
      : "blank-row:" + line.sourceRow;
    if (!bags.has(bagKey)) bags.set(bagKey, randomUUID());
    const lineGroupId = randomUUID();
    for (const size of sizes) {
      const v = c.variants.find((v) => sameColor(v) && v.size === size);
      rows.push({
        id: randomUUID(),
        sku,
        color: m.keepUnmatched ? m.color : c.variants.find(sameColor)!.color,
        size,
        qty: line.quantities[size],
        bag: line.bag,
        bagGroupId: bags.get(bagKey),
        lineGroupId,
        variantId: v?.id || null,
        orderId: null,
        remember: false,
        allocationMode: m.keepUnmatched
          ? ("unmatched" as const)
          : ("auto" as const),
        excessOrderId: null,
      });
    }
  }
  const draft = await createIncoming(db, actor, { images: [] });
  await saveIncoming(db, actor, draft.id, {
    expectedVersion: 1,
    form: {
      date: input.date,
      supplier: input.supplier,
      note: [
        `JSON ${source.document.document_id}`,
        source.document.checker ? `Kiểm hàng: ${source.document.checker}` : "",
        input.note,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 1000),
      rows,
    },
  });
  await db.query(
    "INSERT INTO incoming_json_sources(document_key,document_id,draft_id,actor_id,source_hash,source,decisions,original_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      documentKey,
      source.document.document_id,
      draft.id,
      actor.id,
      hash(source),
      JSON.stringify(source),
      JSON.stringify(input),
      parsed.total,
    ],
  );
  await db.query(
    "UPDATE import_previews SET status='confirmed',body=$2 WHERE id=$1",
    [id, JSON.stringify({ ...preview.body, requestHash, draftId: draft.id })],
  );
  await audit(db, actor.id, "incoming-json.create", draft.id, {
    documentId: source.document.document_id,
    sourceHash: hash(source),
    total: parsed.total,
    lines: lines.length,
    previewId: id,
  });
  return draft;
}
export const incomingJsonRouter = Router();
incomingJsonRouter.use(permission("receive"));
incomingJsonRouter.get("/:id/source", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await incomingDraft(pool, req.actor!, id);
  const row = (
    await pool.query(
      "SELECT source FROM incoming_json_sources WHERE draft_id=$1",
      [id],
    )
  ).rows[0];
  if (!row) throw new AppError(404, "Phiếu không có nguồn JSON");
  res
    .set("Content-Disposition", 'attachment; filename="phieu-hang-ve.json"')
    .type("application/json")
    .send(JSON.stringify(row.source, null, 2));
});
incomingJsonRouter.get("/", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT s.document_id,s.original_total,s.source->'document' AS document,d.id,d.state,d.result,d.created_at FROM incoming_json_sources s JOIN incoming_goods_drafts d ON d.id=s.draft_id WHERE s.actor_id=$1 ORDER BY d.updated_at DESC LIMIT 100",
        [req.actor!.id],
      )
    ).rows,
  ),
);
incomingJsonRouter.post("/preview", async (req, res) =>
  res.json(
    await transaction((db) => previewReceiptJson(db, req.actor!, req.body)),
  ),
);
incomingJsonRouter.post("/:id/create", async (req, res) =>
  res
    .status(201)
    .json(
      await transaction((db) =>
        createJsonReceipt(
          db,
          req.actor!,
          z.uuid().parse(req.params.id),
          req.body,
        ),
      ),
    ),
);
