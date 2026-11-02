import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { can, AppError } from "../shared/domain";
import { normalizeLabel } from "../shared/incoming-goods";
import {
  inspectionCategories,
  inspectionUploadSchema,
  inspectionEditSchema,
  type InspectionTarget,
  type InspectionImage,
} from "../shared/inspection-images";
import { audit, pool, transaction, type DB } from "./db";
import { permission } from "./auth";
import type { Actor } from "./service";
import { parseInspectionFiles } from "./inspection-files";

const kindSchema = z.enum(["draft", "receipt"]);
const writable = (actor: Actor, owner: string) =>
  can(actor.role as any, "receive") &&
  (actor.id === owner || actor.role === "Administrator");
export async function inspectionTarget(
  db: DB,
  actor: Actor,
  target: InspectionTarget,
  lock = false,
): Promise<{
  target: InspectionTarget;
  owner: string;
  state: string;
  code: string;
  canWrite: boolean;
}> {
  if (target.kind === "receipt") {
    const receipt = (
      await db.query(
        "SELECT r.*,o.code FROM production_receipts r JOIN production_orders o ON o.id=r.order_id WHERE r.id=$1" +
          (lock ? " FOR UPDATE OF r" : ""),
        [target.id],
      )
    ).rows[0];
    if (!receipt) throw new AppError(404, "Không tìm thấy biên nhận");
    const linked = (
      await db.query(
        `SELECT d.id FROM incoming_goods_drafts d WHERE d.state='confirmed' AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.result->'receipts') r WHERE r->>'receiptId'=$1)`,
        [target.id],
      )
    ).rows[0];
    if (linked)
      return inspectionTarget(
        db,
        actor,
        { kind: "draft", id: linked.id },
        lock,
      );
    return {
      target,
      owner: receipt.actor_id,
      state: "confirmed",
      code: receipt.code + " · " + receipt.id.slice(0, 8),
      canWrite: writable(actor, receipt.actor_id),
    };
  }
  const draft = (
    await db.query(
      "SELECT * FROM incoming_goods_drafts WHERE id=$1" +
        (lock ? " FOR UPDATE" : ""),
      [target.id],
    )
  ).rows[0];
  if (
    !draft ||
    (draft.state !== "confirmed" &&
      actor.id !== draft.actor_id &&
      actor.role !== "Administrator")
  )
    throw new AppError(404, "Không tìm thấy phiếu được phép truy cập");
  const source = (
    await db.query(
      "SELECT document_id FROM incoming_json_sources WHERE draft_id=$1",
      [target.id],
    )
  ).rows[0];
  return {
    target,
    owner: draft.actor_id,
    state: draft.state,
    code: source?.document_id || "Phiếu " + target.id.slice(0, 8),
    canWrite: writable(actor, draft.actor_id),
  };
}

// Only metadata is selected here; original image bytes are served separately on demand.
const parentsSql = `WITH parents AS (
 SELECT 'draft'::text AS kind,d.id,d.actor_id,d.state,
 CASE WHEN j.draft_id IS NULL THEN 'manual' ELSE 'json' END AS source,
 COALESCE(j.document_id,'Phiếu '||left(d.id::text,8)) AS code,
 COALESCE(NULLIF(d.form->>'date',''),to_char(d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')) AS receipt_date,
 j.source->'document'->>'inspection_date' AS json_date,
 to_char(d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS created_date,
 COALESCE(d.form->>'supplier',j.source->'document'->>'supplier','') AS supplier,
 COALESCE((SELECT jsonb_agg(DISTINCT r->>'sku') FROM jsonb_array_elements(d.form->'rows') r WHERE NULLIF(r->>'sku','') IS NOT NULL),'[]') AS products,
 COALESCE((SELECT jsonb_agg(DISTINCT r->>'color') FROM jsonb_array_elements(d.form->'rows') r WHERE NULLIF(r->>'color','') IS NOT NULL),'[]') AS colors,
 COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',o.id,'code',o.code)) FROM jsonb_array_elements(d.result->'receipts') r JOIN production_orders o ON o.id::text=r->>'orderId'),'[]') AS orders
 FROM incoming_goods_drafts d LEFT JOIN incoming_json_sources j ON j.draft_id=d.id
 WHERE d.state='confirmed' OR d.actor_id=$1 OR $2='Administrator'
 UNION ALL
 SELECT 'receipt',r.id,r.actor_id,'confirmed','direct',o.code||' · '||left(r.id::text,8),to_char(r.date,'YYYY-MM-DD'),NULL,
 to_char(r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD'),COALESCE(NULLIF(r.supplier_snapshot,''),s.name,''),
 COALESCE((SELECT jsonb_agg(DISTINCT i.identity_snapshot->>'sku') FROM production_receipt_items i WHERE i.receipt_id=r.id),'[]'),
 COALESCE((SELECT jsonb_agg(DISTINCT i.identity_snapshot->>'color') FROM production_receipt_items i WHERE i.receipt_id=r.id),'[]'),
 jsonb_build_array(jsonb_build_object('id',o.id,'code',o.code))
 FROM production_receipts r JOIN production_orders o ON o.id=r.order_id LEFT JOIN suppliers s ON s.id=o.supplier_id
)
SELECT i.name,i.mime,i.sha256,octet_length(i.bytes) AS byte_count,p.*,
 i.id AS image_id,COALESCE(to_char(m.inspection_date,'YYYY-MM-DD'),NULLIF(p.json_date,''),p.receipt_date,p.created_date) AS inspection_date,
 CASE WHEN m.inspection_date IS NOT NULL THEN 'classified' WHEN NULLIF(p.json_date,'') IS NOT NULL THEN 'json' WHEN p.receipt_date IS NOT NULL THEN 'receipt' ELSE 'created' END AS date_source,
 COALESCE(m.category,'Phiếu kiểm hàng') AS category,COALESCE(m.note,'') AS note,COALESCE(m.version,0) AS metadata_version,
 m.uploaded_at,u.name AS uploader
 FROM parents p JOIN incoming_goods_images i ON (p.kind='draft' AND i.draft_id=p.id) OR (p.kind='receipt' AND i.receipt_id=p.id)
 LEFT JOIN inspection_image_metadata m ON m.image_id=i.id LEFT JOIN users u ON u.id=m.uploaded_by`;

async function imageMetadata(
  db: DB,
  actor: Actor,
  where = "",
  args: unknown[] = [],
): Promise<InspectionImage[]> {
  const rows = (
    await db.query(parentsSql + where, [actor.id, actor.role, ...args])
  ).rows;
  return rows.map((r) => ({
    id: r.image_id,
    name: r.name,
    mime: r.mime,
    sha256: r.sha256,
    byteCount: Number(r.byte_count),
    target: { kind: r.kind, id: r.id },
    source: r.source,
    state: r.state,
    code: r.code,
    receiptDate: r.receipt_date,
    inspectionDate: r.inspection_date,
    dateSource: r.date_source,
    category: r.category,
    note: r.note,
    version: r.metadata_version,
    uploadedAt: r.uploaded_at?.toISOString() || null,
    uploader: r.uploader,
    supplier: r.supplier,
    products: r.products,
    colors: r.colors,
    orders: r.orders,
    canWrite: writable(actor, r.actor_id),
    canOpenDraft: r.kind === "draft" && writable(actor, r.actor_id),
  }));
}
export async function inspectionBundle(
  db: DB,
  actor: Actor,
  target: InspectionTarget,
) {
  const parent = await inspectionTarget(db, actor, target);
  const images = await imageMetadata(
    db,
    actor,
    " WHERE p.kind=$3 AND p.id=$4 ORDER BY m.uploaded_at NULLS FIRST,i.name,i.id",
    [parent.target.kind, parent.target.id],
  );
  return {
    target: parent.target,
    code: parent.code,
    canWrite: parent.canWrite,
    images,
  };
}

export async function appendInspectionImages(
  db: DB,
  actor: Actor,
  target: InspectionTarget,
  raw: unknown,
) {
  const input = inspectionUploadSchema.parse(raw),
    images = parseInspectionFiles(input.images);
  const parent = await inspectionTarget(db, actor, target, true);
  const user = (
    await db.query("SELECT role,disabled FROM users WHERE id=$1", [actor.id])
  ).rows[0];
  if (
    !user ||
    user.disabled ||
    !writable({ ...actor, role: user.role }, parent.owner)
  )
    throw new AppError(
      403,
      "Chỉ người lập phiếu hoặc Administrator có quyền nhập hàng mới được thêm ảnh",
    );
  const column = parent.target.kind === "draft" ? "draft_id" : "receipt_id";
  for (const sha of images.map((i) => i.sha).sort())
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "incoming-image:" + sha,
    ]);
  const current = (
    await db.query(
      `SELECT sha256,octet_length(bytes) AS size FROM incoming_goods_images WHERE ${column}=$1`,
      [parent.target.id],
    )
  ).rows;
  const added = images.filter((i) => !current.some((c) => c.sha256 === i.sha));
  if (
    current.length + added.length > 40 ||
    current.reduce((n, r) => n + Number(r.size), 0) +
      added.reduce((n, i) => n + i.bytes.length, 0) >
      80 * 1024 * 1024
  )
    throw new AppError(400, "Một phiếu lưu tối đa 40 ảnh / 80 MB");
  if (parent.state !== "confirmed")
    for (const image of added) {
      if (
        (
          await db.query(
            `SELECT 1 FROM incoming_goods_images i LEFT JOIN incoming_goods_drafts d ON d.id=i.draft_id WHERE i.sha256=$1 AND (d.state='confirmed' OR i.receipt_id IS NOT NULL) LIMIT 1`,
            [image.sha],
          )
        ).rowCount
      )
        throw new AppError(
          409,
          "Ảnh đã thuộc phiếu đã ghi nhận. Mở phiếu cũ để bổ sung, không tạo phiếu nhập trùng",
        );
    }
  for (const image of added) {
    await db.query(
      `INSERT INTO incoming_goods_images(id,${column},name,mime,sha256,bytes) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        image.id,
        parent.target.id,
        image.name,
        image.mime,
        image.sha,
        image.bytes,
      ],
    );
    await db.query(
      `INSERT INTO inspection_image_metadata(image_id,inspection_date,category,note,uploaded_at,uploaded_by,updated_by) VALUES($1,$2,$3,$4,now(),$5,$5)`,
      [image.id, input.inspectionDate, input.category, input.note, actor.id],
    );
  }
  if (added.length)
    await audit(db, actor.id, "inspection.images.append", parent.target.id, {
      target: parent.target,
      inspectionDate: input.inspectionDate,
      category: input.category,
      note: input.note,
      images: added.map((i) => ({ id: i.id, name: i.name, sha256: i.sha })),
    });
  return {
    ...(await inspectionBundle(db, actor, parent.target)),
    added: added.length,
    skipped: images.length - added.length,
  };
}
export async function editInspectionMetadata(
  db: DB,
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const input = inspectionEditSchema.parse(raw);
  const image = (await imageMetadata(db, actor, " WHERE i.id=$3", [id]))[0];
  if (!image) throw new AppError(404, "Không tìm thấy ảnh");
  const parent = await inspectionTarget(db, actor, image.target, true);
  const user = (
    await db.query("SELECT role,disabled FROM users WHERE id=$1", [actor.id])
  ).rows[0];
  if (
    !user ||
    user.disabled ||
    !writable({ ...actor, role: user.role }, parent.owner)
  )
    throw new AppError(403, "Không có quyền phân loại ảnh của phiếu này");
  const before = (
    await db.query(
      "SELECT * FROM inspection_image_metadata WHERE image_id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if ((before?.version || 0) !== input.expectedVersion)
    throw new AppError(409, "Phân loại ảnh đã thay đổi; tải lại trước khi sửa");
  await db.query(
    `INSERT INTO inspection_image_metadata(image_id,inspection_date,category,note,updated_by) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(image_id) DO UPDATE SET inspection_date=EXCLUDED.inspection_date,category=EXCLUDED.category,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now(),version=inspection_image_metadata.version+1`,
    [id, input.inspectionDate, input.category, input.note, actor.id],
  );
  await audit(db, actor.id, "inspection.image.classify", parent.target.id, {
    imageId: id,
    before: {
      inspectionDate: image.inspectionDate,
      dateSource: image.dateSource,
      category: image.category,
      note: image.note,
      version: image.version,
    },
    after: input,
  });
  return (await imageMetadata(db, actor, " WHERE i.id=$3", [id]))[0];
}

const filters = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    search: z.string().max(300).default(""),
    supplier: z.string().max(200).default(""),
    category: z.enum(["", ...inspectionCategories]).default(""),
    source: z.enum(["", "manual", "json", "direct"]).default(""),
    state: z.enum(["", "draft", "confirmed"]).default(""),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(24),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: "Ngày bắt đầu phải trước ngày kết thúc",
  });
export async function inspectionArchive(db: DB, actor: Actor, raw: unknown) {
  const f = filters.parse(raw),
    matches = (text: string, q: string) =>
      normalizeLabel(text).includes(normalizeLabel(q));
  const rows = (await imageMetadata(db, actor)).filter(
    (i) =>
      (!f.category || i.category === f.category) &&
      (!f.source || i.source === f.source) &&
      (!f.state || i.state === f.state) &&
      matches(i.supplier, f.supplier) &&
      matches(
        [
          i.name,
          i.code,
          i.note,
          i.supplier,
          ...i.products,
          ...i.colors,
          ...i.orders.map((o) => o.code),
        ].join(" "),
        f.search,
      ),
  );
  const months = new Map<string, number>();
  for (const i of rows) {
    const month = i.inspectionDate.slice(0, 7);
    months.set(month, (months.get(month) || 0) + 1);
  }
  const dated = rows
    .filter(
      (i) =>
        (!f.from || i.inspectionDate >= f.from) &&
        (!f.to || i.inspectionDate <= f.to) &&
        (!f.month || i.inspectionDate.startsWith(f.month)),
    )
    .sort(
      (a, b) =>
        b.inspectionDate.localeCompare(a.inspectionDate) ||
        (b.uploadedAt || "").localeCompare(a.uploadedAt || "") ||
        a.id.localeCompare(b.id),
    );
  const page = Math.min(
    f.page,
    Math.max(1, Math.ceil(dated.length / f.pageSize)),
  );
  return {
    images: dated.slice((page - 1) * f.pageSize, page * f.pageSize),
    total: dated.length,
    slips: new Set(dated.map((i) => i.target.kind + i.target.id)).size,
    bytes: dated.reduce((n, i) => n + i.byteCount, 0),
    inferred: dated.filter(
      (i) => i.dateSource !== "classified" && i.dateSource !== "json",
    ).length,
    page,
    pageSize: f.pageSize,
    months: [...months]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, count]) => ({ month, count })),
  };
}

export const inspectionRouter = Router();
inspectionRouter.get("/", async (req, res) =>
  res.json(await inspectionArchive(pool, req.actor!, req.query)),
);
inspectionRouter.get("/targets/:kind/:id", async (req, res) =>
  res.json(
    await inspectionBundle(pool, req.actor!, {
      kind: kindSchema.parse(req.params.kind),
      id: z.uuid().parse(req.params.id),
    }),
  ),
);
inspectionRouter.post(
  "/targets/:kind/:id/images",
  permission("receive"),
  rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  async (req, res) =>
    res
      .status(201)
      .json(
        await transaction((db) =>
          appendInspectionImages(
            db,
            req.actor!,
            {
              kind: kindSchema.parse(req.params.kind),
              id: z.uuid().parse(req.params.id),
            },
            req.body,
          ),
        ),
      ),
);
inspectionRouter.put(
  "/images/:id/metadata",
  permission("receive"),
  async (req, res) =>
    res.json(
      await transaction((db) =>
        editInspectionMetadata(
          db,
          req.actor!,
          z.uuid().parse(req.params.id),
          req.body,
        ),
      ),
    ),
);
inspectionRouter.get("/images/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    image = (await imageMetadata(pool, req.actor!, " WHERE i.id=$3", [id]))[0];
  if (!image) throw new AppError(404, "Không tìm thấy ảnh được phép truy cập");
  const data = (
    await pool.query("SELECT bytes FROM incoming_goods_images WHERE id=$1", [
      id,
    ])
  ).rows[0];
  res
    .set("Content-Type", image.mime)
    .set("X-Content-Type-Options", "nosniff")
    .set("Cache-Control", "private, no-store");
  if (req.query.download === "1")
    res.set(
      "Content-Disposition",
      `attachment; filename="phieu-kiem-${id}.${image.mime.split("/")[1]}"; filename*=UTF-8''${encodeURIComponent(image.name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
    );
  res.send(data.bytes);
});
