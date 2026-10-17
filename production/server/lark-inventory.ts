import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit, type DB } from "./db";
import { larkClient, retryRead } from "./auth";
import { AppError, skuSchema } from "../shared/domain";
import {
  inventorySourceSchema,
  parseBaseUrl,
  normalizeInventory,
  type InventorySource,
  type BaseRecord,
} from "../shared/lark-inventory";
import { saveSku, type Actor } from "./service";

type Client = ReturnType<typeof larkClient>;
// User-provided URLs are identifiers only. All HTTP requests use SDK fixed Lark
// endpoints; never fetch the submitted URL or follow its redirects.
async function checked<T extends { code?: number }>(
  call: () => Promise<T>,
  stage: string,
): Promise<T> {
  const result = await retryRead(call);
  if (result.code !== 0)
    throw new AppError(
      502,
      `Không đọc được ${stage} trên Lark (mã ${Number(result.code) || 0}). Kiểm tra quyền API, quyền tài liệu của Custom App và phát hành phiên bản.`,
    );
  return result;
}
async function pathFor(url: string, client: Client) {
  const source = parseBaseUrl(url);
  let token = source.token;
  if (source.kind === "wiki") {
    const result = await checked(
      () => client.wiki.space.getNode({ params: { token } }),
      "trang Wiki",
    );
    if (
      result.data?.node?.obj_type !== "bitable" ||
      !result.data.node.obj_token
    )
      throw new AppError(400, "Trang Wiki này không trỏ tới Lark Base");
    token = result.data.node.obj_token;
  }
  return { app_token: token, table_id: source.tableId };
}
export async function inventoryFields(
  url: string,
  client: Client = larkClient(),
) {
  const path = await pathFor(url, client);
  const fields: { name: string; type: number }[] = [];
  let page: string | undefined;
  const seen = new Set<string>();
  do {
    const result = await checked(
      () =>
        client.bitable.appTableField.list({
          path,
          params: { page_size: 100, page_token: page },
        }),
      "danh sách cột",
    );
    if (!result.data)
      throw new AppError(502, "Lark không trả về danh sách cột");
    fields.push(
      ...(result.data.items || []).map((f) => ({
        name: f.field_name,
        type: f.type,
      })),
    );
    if (!result.data.has_more) break;
    page = result.data.page_token;
    if (!page || seen.has(page) || fields.length > 500)
      throw new AppError(502, "Phân trang cột Lark không hợp lệ");
    seen.add(page);
  } while (true);
  return { fields };
}
export async function readInventory(
  source: InventorySource,
  client: Client = larkClient(),
) {
  const path = await pathFor(source.url, client),
    view = parseBaseUrl(source.url).viewId;
  const fields = [
    source.mapping.sku,
    source.mapping.color,
    source.mapping.date,
    ...Object.values(source.mapping.sizes).filter(Boolean),
  ];
  const available = new Set(
    (await inventoryFields(source.url, client)).fields.map((f) => f.name),
  );
  if (fields.some((name) => !available.has(name)))
    throw new AppError(
      400,
      "Cột ánh xạ không còn tồn tại trên Lark; hãy đọc lại danh sách cột và lưu cấu hình",
    );
  const records: BaseRecord[] = [],
    seen = new Set<string>(),
    ids = new Set<string>();
  const deadline = Date.now() + 120000;
  let page: string | undefined;
  do {
    const result = await checked(
      () =>
        client.bitable.appTableRecord.search({
          path,
          data: { view_id: view, field_names: fields },
          params: { page_size: 500, page_token: page },
        }),
      "bản ghi tồn kho",
    );
    if (!result.data)
      throw new AppError(502, "Lark không trả về dữ liệu tồn kho");
    for (const record of result.data.items || []) {
      if (!record.record_id || ids.has(record.record_id))
        throw new AppError(
          502,
          "Bản ghi Lark trùng hoặc thiếu ID; hãy đọc lại khi bảng ổn định",
        );
      ids.add(record.record_id);
      records.push(record);
    }
    if (records.length > 10000 || Date.now() > deadline)
      throw new AppError(
        400,
        "Nguồn vượt 10.000 dòng hoặc đọc quá 120 giây. Lọc view theo kỳ tồn rồi thử lại; chưa nhập dữ liệu.",
      );
    if (!result.data.has_more) break;
    page = result.data.page_token;
    if (!page || seen.has(page))
      throw new AppError(
        502,
        "Phân trang Lark không hợp lệ; chưa nhập dữ liệu",
      );
    seen.add(page);
  } while (true);
  return normalizeInventory(records, source);
}
export async function inventorySource(db: DB) {
  const r = (
    await db.query(
      "SELECT body,version,updated_at FROM lark_inventory_sources WHERE id=1",
    )
  ).rows[0];
  return r ? { ...r.body, version: r.version, updatedAt: r.updated_at } : null;
}
export async function saveInventorySource(db: DB, actor: Actor, raw: unknown) {
  const { version, source } = z
    .object({
      version: z.number().int().nonnegative(),
      source: inventorySourceSchema,
    })
    .strict()
    .parse(raw);
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('comsflow:lark-inventory'))",
  );
  const old = await inventorySource(db);
  if ((old?.version || 0) !== version)
    throw new AppError(409, "Cấu hình nguồn đã thay đổi");
  await db.query(
    "INSERT INTO lark_inventory_sources(id,body,updated_by) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET body=$1,version=lark_inventory_sources.version+1,updated_by=$2,updated_at=now()",
    [JSON.stringify(source), actor.id],
  );
  await audit(db, actor.id, "lark.inventory.source", "1", {
    before: old,
    after: source,
  });
  return inventorySource(db);
}
export async function previewInventory(
  db: DB,
  actor: Actor,
  source: InventorySource,
  version: number,
  result: Awaited<ReturnType<typeof readInventory>>,
  scope?: string[],
) {
  const current = await inventorySource(db);
  if (
    !current ||
    current.version !== version ||
    JSON.stringify(current.mapping) !== JSON.stringify(source.mapping) ||
    current.url !== source.url ||
    current.blankAsZero !== source.blankAsZero ||
    current.createMissing !== source.createMissing
  )
    throw new AppError(409, "Cấu hình nguồn đã thay đổi trong lúc đọc Lark");
  const variants = (await db.query("SELECT id,body,version FROM variants"))
    .rows;
  const key = (r: any) =>
    JSON.stringify([r.sku.toUpperCase(), r.color.toLowerCase(), r.size]);
  const catalogue = new Map(variants.map((v) => [key(v.body), v]));
  const errors = [...result.errors],
    warnings = [...result.warnings];
  let unknown = 0,
    older = 0;
  if (
    scope &&
    variants.filter((v) => scope.includes(v.id)).length !== scope.length
  )
    throw new AppError(409, "SKU đã thay đổi; hãy tải lại dữ liệu");
  const sourceRows = scope
    ? result.rows.filter((r) => {
        const match = catalogue.get(key(r));
        return match && scope.includes(match.id);
      })
    : result.rows;
  const rows = sourceRows.map((r) => {
    const match = catalogue.get(key(r));
    const isOlder =
      match &&
      match.body.stock !== null &&
      match.body.inventoryAt &&
      r.date <
        new Date(new Date(match.body.inventoryAt).getTime() + 7 * 3600000)
          .toISOString()
          .slice(0, 10);
    const action = isOlder
      ? "older"
      : !match && !source.createMissing
        ? "unknown"
        : match
          ? "update"
          : "create";
    if (action === "older") older++;
    if (action === "unknown") unknown++;
    return {
      ...r,
      id: match?.id || null,
      version: match?.version || null,
      previous: match?.body.stock ?? null,
      action,
    };
  });
  if (scope) {
    const missing = scope.filter((id) => !rows.some((row) => row.id === id));
    if (missing.length)
      warnings.push(
        `${missing.length} SKU được chọn không có số tồn phù hợp trong view Lark: giữ nguyên, không tự đưa về 0.`,
      );
  }
  if (unknown)
    warnings.push(
      `${unknown} SKU chưa có trong danh mục: bỏ qua. Có thể bật tạo SKU còn thiếu rồi xem trước lại.`,
    );
  if (older)
    warnings.push(
      `${older} SKU có tồn trong ứng dụng mới hơn ngày kiểm trên Lark: bỏ qua để bảo vệ dữ liệu mới.`,
    );
  const count = rows.filter((r) =>
    ["update", "create"].includes(r.action),
  ).length;
  if (!count)
    errors.push(
      "Không có SKU đủ điều kiện cập nhật. Kiểm tra view, ngày kiểm, ô trống và danh mục.",
    );
  const id = randomUUID(),
    body = {
      source,
      sourceVersion: version,
      scope: scope || null,
      rows,
      errors,
      warnings,
      readRows: result.readRows,
      count,
      fetchedAt: new Date().toISOString(),
    };
  await db.query(
    "INSERT INTO import_previews(id,actor_id,kind,body) VALUES($1,$2,'lark-inventory',$3)",
    [id, actor.id, JSON.stringify(body)],
  );
  return { id, ...body };
}
export async function confirmInventory(db: DB, actor: Actor, id: string) {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('comsflow:lark-inventory'))",
  );
  const preview = (
    await db.query("SELECT * FROM import_previews WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (
    !preview ||
    preview.actor_id !== actor.id ||
    preview.kind !== "lark-inventory"
  )
    throw new AppError(404, "Không tìm thấy bản xem trước của bạn");
  if (preview.status === "done")
    return { replayed: true, count: preview.body.count };
  const body = preview.body;
  if (body.errors.length)
    throw new AppError(
      400,
      "Sửa lỗi nguồn và xem trước lại trước khi cập nhật",
    );
  if (Date.now() - new Date(body.fetchedAt).getTime() > 15 * 60000)
    throw new AppError(409, "Bản xem trước quá 15 phút; hãy đọc lại Lark");
  const source = await inventorySource(db);
  if (source?.version !== body.sourceVersion)
    throw new AppError(409, "Cấu hình nguồn đã thay đổi");
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('comsflow:order-catalog'))",
  );
  // Lock deterministically, then validate the entire preview before writing anything.
  const current = (
    await db.query(
      "SELECT id,body,version FROM variants ORDER BY id FOR UPDATE",
    )
  ).rows;
  const byId = new Map(current.map((v) => [v.id, v]));
  for (const row of body.rows) {
    if (!["update", "create"].includes(row.action)) continue;
    const old = byId.get(row.id);
    if (row.id && (!old || old.version !== row.version))
      throw new AppError(
        409,
        "SKU đã được nhân viên khác cập nhật; hãy xem trước lại",
      );
    if (
      !row.id &&
      current.some(
        (v) =>
          v.body.sku.toUpperCase() === row.sku &&
          v.body.color.toLowerCase() === row.color.toLowerCase() &&
          v.body.size === row.size,
      )
    )
      throw new AppError(
        409,
        "SKU mới đã được tạo trong lúc xem trước; hãy đọc lại",
      );
    const { id: _id, version: _version, ...oldBody } = old?.body || {};
    await saveSku(
      db,
      actor,
      skuSchema.parse({
        ...oldBody,
        sku: old?.body.sku || row.sku,
        color: old?.body.color || row.color,
        size: row.size,
        stock: row.stock,
        inventoryAt: row.date + "T00:00:00+07:00",
        inventorySource: `Lark Base / ${parseBaseUrl(body.source.url).tableId} / ${row.recordId}`,
      }),
      row.id || undefined,
      row.version || undefined,
    );
  }
  await db.query("UPDATE import_previews SET status='done' WHERE id=$1", [id]);
  await audit(db, actor.id, "lark.inventory.confirm", id, {
    count: body.count,
    source: body.source,
    fetchedAt: body.fetchedAt,
    rows: body.rows,
  });
  return { count: body.count, replayed: false };
}
