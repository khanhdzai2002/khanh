import { randomUUID, createHash } from "node:crypto";
import { readWorkbookRows } from "./xlsx-reader";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  AppError,
  skuSchema,
  sizes,
  isActiveSize,
  stages,
  policySchema,
  defaultPolicy,
  totals,
  type ProductionOrder,
} from "../shared/domain";
import { parseSalesRow, rates, shiftDay, type SalesRow } from "../shared/sales";
import { type DB, audit } from "./db";
import {
  saveSku,
  createOrder,
  receive,
  orderAction,
  loadOrder,
  variants,
  type Actor,
} from "./service";
import {
  checkSalesColumns,
  describeSalesFile,
  isDataRow,
} from "../shared/sales-file";
const digest = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const uploadSchema = z
  .object({
    filename: z.string().min(1).max(200),
    base64: z.string().max(15e6),
    exportedAt: z.iso.datetime({ offset: true }),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    mode: z.enum(["replace", "append"]),
  })
  .strict();
export async function readFileRows(
  filename: string,
  bytes: Buffer,
): Promise<Record<string, string>[]> {
  if (bytes.length > 10e6)
    throw new AppError(413, "Tối đa 10 MB mỗi file; chia kỳ hoặc dùng CSV");
  if (filename.toLowerCase().endsWith(".csv"))
    return parse(bytes.toString("utf8"), {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 100000,
    });
  if (!filename.toLowerCase().endsWith(".xlsx"))
    throw new AppError(400, "Chỉ nhận CSV hoặc XLSX");
  return (await readWorkbookRows(bytes)).rows;
}

export async function inspectSales(filename: string, bytes: Buffer) {
  const workbook = filename.toLowerCase().endsWith(".xlsx")
    ? await readWorkbookRows(bytes)
    : null;
  const rows = workbook?.rows || (await readFileRows(filename, bytes));
  return {
    ...describeSalesFile(filename, rows),
    source: workbook?.source || { sheet: "CSV", headerRow: 1, repeatedRows: 0 },
  };
}
export async function previewSales(db: DB, actor: Actor, raw: unknown) {
  const input = uploadSchema.parse(raw);
  if (input.periodStart > input.periodEnd)
    throw new AppError(400, "Kỳ báo cáo không hợp lệ");
  const bytes = Buffer.from(input.base64, "base64"),
    rows = await readFileRows(input.filename, bytes);
  const fileHash = digest(bytes);
  checkSalesColumns(rows);
  if (rows.length > 100000) throw new AppError(413, "Tối đa 100.000 dòng");
  const errors: string[] = [],
    warnings: string[] = [],
    parsed: SalesRow[] = [],
    keys = new Set<string>();
  let duplicates = 0,
    outOfPeriod = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!isDataRow(row)) continue;
    try {
      if (!row["Order Status"] || !row["Created Time"] || !row.Quantity)
        throw Error("Thiếu cột TikTok bắt buộc");
      const line = row["Order Line ID"] || row["SKU ID"];
      if (input.mode === "append" && !line)
        throw Error(
          "Nhập bổ sung cần Order Line ID hoặc SKU ID ổn định để chống trùng",
        );
      const key = digest(
          line ? row["Order ID"] + "|" + line : fileHash + "|" + i,
        ),
        r = parseSalesRow(row, key);
      z.iso.date().parse(r.date);
      if (r.date < input.periodStart || r.date > input.periodEnd) {
        outOfPeriod++;
        continue;
      }
      if (keys.has(key)) {
        duplicates++;
        throw Error("Trùng định danh đơn/dòng trong file");
      }
      keys.add(key);
      parsed.push(r);
    } catch (e) {
      errors.push(
        `Dòng ${i + 2}: ${e instanceof Error ? e.message : "Không hợp lệ"}`,
      );
    }
  }
  if (!parsed.length)
    errors.push(
      "Không có dòng dữ liệu trong kỳ đã chọn. Kiểm tra kỳ báo cáo được nhận diện từ file.",
    );
  if (outOfPeriod)
    warnings.push(
      `Có ${outOfPeriod} dòng ngoài kỳ đã chọn không được nhập; dữ liệu ngoài kỳ trong hệ thống được giữ nguyên.`,
    );
  if (!rows.some((r) => r["Order Line ID"] || r["SKU ID"]))
    warnings.push(
      "File không có khóa dòng ổn định; chỉ hỗ trợ thay thế kỳ, không bổ sung.",
    );
  warnings.push(
    "Quy tắc lọc hủy/hoàn giữ nguyên V9; kiểm tra danh sách bị loại trước khi xác nhận. Ngày xuất chưa trọn vẹn bị loại khỏi tốc độ chuẩn.",
  );
  const aggregated = new Map<
    string,
    { sku: string; name: string; color: string; size: string; qty: number }
  >();
  for (const row of parsed)
    if (row.kind === "single" && row.qty > 0) {
      const key = JSON.stringify([row.sku, row.color, row.size]);
      const old = aggregated.get(key);
      if (old) old.qty += row.qty;
      else
        aggregated.set(key, {
          sku: row.sku,
          name: row.name,
          color: row.color,
          size: row.size,
          qty: row.qty,
        });
    }
  const id = randomUUID(),
    { base64, ...metadata } = input;
  const body = {
    ...metadata,
    fileHash,
    rows: parsed,
    errors,
    warnings,
    duplicates,
    outOfPeriod,
  };
  await db.query(
    "INSERT INTO import_previews(id,actor_id,kind,body) VALUES($1,$2,$3,$4)",
    [id, actor.id, "sales", JSON.stringify(body)],
  );
  return {
    id,
    ...metadata,
    count: parsed.length,
    errors,
    warnings,
    duplicates,
    outOfPeriod,
    summary: parsed.reduce(
      (a, r) => ({ ...a, [r.kind]: (a[r.kind] || 0) + r.qty }),
      {} as Record<string, number>,
    ),
    rows: parsed.slice(0, 100),
    variants: [...aggregated.values()],
  };
}
export async function confirmSales(db: DB, actor: Actor, id: string) {
  const preview = (
    await db.query("SELECT * FROM import_previews WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!preview || preview.actor_id !== actor.id || preview.kind !== "sales")
    throw new AppError(404, "Không tìm thấy bản xem trước");
  if (preview.status === "done") return { importId: id, replayed: true };
  const body = preview.body;
  if (body.errors.length)
    throw new AppError(400, "Hãy sửa lỗi file trước khi nhập");
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('comsflow:sales-import'))",
  );
  if (body.mode === "replace")
    await db.query(
      "UPDATE daily_sales SET active=false WHERE active AND date BETWEEN $1 AND $2",
      [body.periodStart, body.periodEnd],
    );
  const importId = randomUUID();
  await db.query(
    "INSERT INTO sales_imports(id,preview_id,actor_id,filename,file_hash,period_start,period_end,exported_at,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      importId,
      id,
      actor.id,
      body.filename,
      body.fileHash,
      body.periodStart,
      body.periodEnd,
      body.exportedAt,
      body.mode,
    ],
  );
  let skipped = 0;
  const previousRows = await db.query(
    "SELECT line_key,qty,kind,to_char(date,'YYYY-MM-DD') AS date,sku,color,size FROM daily_sales WHERE line_key=ANY($1::text[]) AND active",
    [(body.rows as SalesRow[]).map((r) => r.lineKey)],
  );
  const previousByKey = new Map(previousRows.rows.map((r) => [r.line_key, r]));
  const pending = [];
  for (const r of body.rows as SalesRow[]) {
    const previous = previousByKey.get(r.lineKey);
    if (previous) {
      if (
        previous.qty !== r.qty ||
        previous.kind !== r.kind ||
        previous.date !== r.date ||
        previous.sku !== r.sku ||
        previous.color !== r.color ||
        previous.size !== r.size
      )
        throw new AppError(
          409,
          "Dòng đã nhập thay đổi nội dung. Hãy dùng thay thế kỳ để đối soát.",
        );
      skipped++;
      continue;
    }
    pending.push({ ...r, id: randomUUID() });
  }
  for (let i = 0; i < pending.length; i += 500) {
    await db.query(
      `INSERT INTO daily_sales(id,import_id,line_key,date,sku,color,size,qty,kind,variation,reason,product_name)
      SELECT x.id,$1,x."lineKey",x.date,x.sku,x.color,x.size,x.qty,x.kind,x.variation,x.reason,x.name
      FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,"lineKey" text,date date,sku text,color text,size text,qty integer,kind text,variation text,reason text,name text)`,
      [importId, JSON.stringify(pending.slice(i, i + 500))],
    );
  }
  await db.query("UPDATE import_previews SET status='done' WHERE id=$1", [id]);
  await audit(db, actor.id, "sales.import", importId, {
    filename: body.filename,
    mode: body.mode,
    rows: body.rows.length,
    skipped,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
  });
  return { importId, skipped };
}
export async function salesReport(db: DB, from?: string, to?: string) {
  const result = await db.query(
    "SELECT d.*,to_char(d.date,'YYYY-MM-DD') AS sale_day,s.exported_at,s.period_start,s.period_end,s.filename FROM daily_sales d JOIN sales_imports s ON s.id=d.import_id WHERE d.active ORDER BY date",
  );
  const all = result.rows.map((r) => ({
    ...r,
    date: r.sale_day,
  }));
  const single = all.filter(
    (r) => r.kind === "single" && r.qty > 0 && isActiveSize(r.size),
  );
  const lastDate = all.at(-1)?.date || null;
  let lastFullDay = lastDate;
  if (lastDate) {
    const exports = all
      .filter((r) => r.date === lastDate)
      .map((r) =>
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(r.exported_at)),
      );
    if (
      exports.some(
        (e) => e.slice(0, 10) <= lastDate && e.slice(11, 16) < "23:55",
      )
    )
      lastFullDay = shiftDay(lastDate, -1);
  }
  const selected = all.filter(
    (r) => (!from || r.date >= from) && (!to || r.date <= to),
  );
  const groups = new Map<string, typeof single>();
  for (const row of single) {
    const key = JSON.stringify([row.sku, row.color, row.size]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const variants = [...groups.entries()]
    .map(([key, rows]) => {
      const [sku, color, size] = JSON.parse(key);
      return {
        sku,
        name: rows.find((r) => r.product_name)?.product_name || "",
        color,
        size,
        qty: selected
          .filter(
            (r) =>
              r.kind === "single" &&
              r.sku === sku &&
              r.color === color &&
              r.size === size,
          )
          .reduce((n, r) => n + r.qty, 0),
        ...rates(rows, lastFullDay!),
      };
    })
    .sort((a, b) => b.qty - a.qty);
  return {
    lastFullDay,
    lastDate,
    variants,
    rows: selected.map((r) =>
      r.kind === "single" && !isActiveSize(r.size)
        ? { ...r, kind: "excluded", reason: "Size đã ngừng kinh doanh" }
        : r,
    ),
    files: [...new Set(all.map((r) => r.filename))],
    coverageWarning:
      "TB chia cố định 2/7 ngày như V9; hãy xác nhận file bao phủ đủ cửa sổ, ngày thiếu không tự nội suy.",
  };
}
export async function syncSales(
  db: DB,
  actor: Actor,
  mode: "2" | "7",
  selected?: { sku: string; color: string; size: string }[],
) {
  const report = await salesReport(db);
  const existing = await variants(db);
  const key = (s: { sku: string; color: string; size: string }) =>
    JSON.stringify([s.sku.toUpperCase(), s.color.toLowerCase(), s.size]);
  const wanted = selected && new Set(selected.map(key));
  if (
    wanted &&
    (wanted.size === 0 ||
      [...wanted].some((k) => !report.variants.some((r) => key(r) === k)))
  )
    throw new AppError(
      400,
      "Chọn SKU có dữ liệu bán hợp lệ trước khi chuyển sang dự báo.",
    );
  let count = 0;
  for (const r of report.variants) {
    if (wanted && !wanted.has(key(r))) continue;
    if (!sizes.includes(r.size as any)) continue;
    const old = existing.find((s) => key(s) === key(r));
    const { id, version, ...fields } = old || {
      id: undefined,
      version: undefined,
    };
    const body = skuSchema.parse({
      ...fields,
      sku: r.sku,
      name: old?.name || r.name,
      color: old?.color || r.color,
      size: r.size,
      day1: r.day1,
      day2: r.day2,
      abnormal: mode === "7",
      manualRate: mode === "7" ? r.r7 : old?.manualRate || 0,
      salesSource: `Doanh số ${mode} ngày; đến ${report.lastFullDay}`,
    });
    await saveSku(db, actor, body, id, version);
    count++;
  }
  return { count };
}
const legacyNumber = (x: unknown) => Number(x || 0);
function legacyOrders(data: any): { source: any; archived: boolean }[] {
  const entries = [
    ...(data.history || []).map((source: any) => ({ source, archived: false })),
    ...(data.deletedHistory || []).map((source: any) => ({
      source,
      archived: true,
    })),
  ];
  const items = (data.orders || [])
    .filter((i: any) => Number(i.qty) > 0)
    .map((i: any) => ({ ...i, received: 0 }));
  if (items.length) {
    const meta = data.meta || {};
    entries.push({
      archived: false,
      source: {
        id: meta.orderId,
        time: meta.orderTime,
        supplier: meta.orderSupplier,
        delivery: meta.deliveryDate,
        requestedBy: meta.requestedBy,
        notes: meta.orderNotes,
        status: meta.orderStatus || "Nháp",
        cancelled: false,
        receipts: [],
        items,
        legacyDraft: true,
      },
    });
  }
  return entries;
}
export async function previewV9(db: DB, actor: Actor, raw: unknown) {
  const input = z
    .object({
      filename: z.string().max(200),
      data: z
        .object({
          rows: z.array(z.any()).max(10000),
          orders: z.array(z.any()).max(10000),
          history: z.array(z.any()).max(5000).optional(),
          deletedHistory: z.array(z.any()).max(5000).optional(),
          config: z.record(z.string(), z.any()).optional(),
        })
        .passthrough(),
    })
    .strict()
    .parse(raw);
  const errors: string[] = [],
    warnings = [
      "Dữ liệu bán hàng nhúng/backup chỉ lưu làm nguồn lịch sử, không thay báo cáo hiện tại.",
      "Không chạy migrations v7/v8 tự đổi policy của V9.",
      "Danh mục customCatalog ngoài backup có thể thiếu; kiểm tra màu sau nhập.",
    ],
    seen = new Set<string>(),
    existing = await variants(db);
  for (const [n, row] of input.data.rows.entries()) {
    try {
      const parsed = legacySku(row);
      const k = JSON.stringify([
        parsed.sku.toLowerCase(),
        parsed.color.toLowerCase(),
        parsed.size,
      ]);
      if (
        seen.has(k) ||
        existing.some(
          (v) =>
            JSON.stringify([
              v.sku.toLowerCase(),
              v.color.toLowerCase(),
              v.size,
            ]) === k,
        )
      )
        throw Error("Trùng SKU trong file hoặc database");
      seen.add(k);
    } catch (e) {
      errors.push(
        `SKU ${n + 1}: ${e instanceof Error ? e.message : "Không hợp lệ"}`,
      );
    }
  }
  for (const { source: h } of legacyOrders(input.data)) {
    if (!h.id || !Array.isArray(h.items))
      errors.push("Lệnh thiếu mã hoặc items");
    else {
      try {
        z.iso
          .datetime({ offset: true })
          .parse(legacyTime(h.time || h.createdAt));
        if (h.delivery) z.iso.date().parse(h.delivery);
        if (!h.items.length) throw Error("Không có dòng hàng");
        if (h.receipts && !Array.isArray(h.receipts))
          throw Error("receipts không phải danh sách");
        for (const receipt of h.receipts || []) {
          z.iso.date().parse(receipt.date);
          if (!Array.isArray(receipt.lines) || !receipt.lines.length)
            throw Error("Biên nhận thiếu dòng");
          const rkeys = new Set<string>();
          for (const line of receipt.lines) {
            const k = JSON.stringify([line.sku, line.color, line.size]);
            if (rkeys.has(k)) throw Error("Trùng SKU trong biên nhận");
            rkeys.add(k);
            if (
              !Number.isSafeInteger(line.qty) ||
              line.qty < 1 ||
              !h.items.some(
                (i: any) =>
                  i.sku === line.sku &&
                  i.color === line.color &&
                  i.size === line.size,
              )
            )
              throw Error("Biên nhận sai số lượng hoặc tham chiếu SKU");
          }
        }
      } catch (e) {
        errors.push(
          `${h.id}: Thời gian hoặc biên nhận không hợp lệ (${e instanceof Error ? e.message : "lỗi"})`,
        );
        continue;
      }
      const code = String(h.id).toLowerCase();
      if (
        seen.has("order:" + code) ||
        (
          await db.query(
            "SELECT 1 FROM order_code_reservations WHERE code=$1",
            [code],
          )
        ).rowCount
      )
        errors.push("Trùng mã lệnh " + h.id);
      seen.add("order:" + code);
      const keys = new Set<string>();
      for (const i of h.items) {
        try {
          legacySku(i);
          if (
            !Number.isInteger(i.qty) ||
            i.qty < 1 ||
            i.qty > 1e6 ||
            !Number.isInteger(i.received) ||
            i.received < 0 ||
            i.received > i.qty
          )
            throw Error("Số đặt/nhận không hợp lệ");
          const key = JSON.stringify([
            String(i.sku).toLowerCase(),
            String(i.color).toLowerCase(),
            i.size,
          ]);
          if (keys.has(key)) throw Error("Trùng dòng SKU");
          keys.add(key);
          const received = (h.receipts || [])
            .flatMap((r: any) => r.lines || [])
            .filter(
              (l: any) =>
                l.sku === i.sku && l.color === i.color && l.size === i.size,
            )
            .reduce((n: number, l: any) => n + Number(l.qty || 0), 0);
          if (received !== i.received)
            throw Error(
              "Số đã nhận không khớp biên nhận; phải đối soát trước nhập",
            );
        } catch (e) {
          errors.push(
            `${h.id}: ${e instanceof Error ? e.message : "Lỗi dòng"}`,
          );
        }
      }
    }
  }
  const cfg = input.data.config || {};
  const policy = {
    ...defaultPolicy,
    ...Object.fromEntries(
      Object.keys(defaultPolicy)
        .filter((k) => cfg[k] !== undefined)
        .map((k) => [k, k === "includeLead" ? cfg[k] : Number(cfg[k])]),
    ),
  };
  if (!policySchema.safeParse(policy).success)
    errors.push("Chính sách V9 không hợp lệ, cần đối soát trước nhập");
  const id = randomUUID();
  await db.query(
    "INSERT INTO import_previews(id,actor_id,kind,body) VALUES($1,$2,$3,$4)",
    [id, actor.id, "v9", JSON.stringify({ input, errors, warnings, policy })],
  );
  return {
    id,
    errors,
    warnings,
    policy: input.data.config ? policy : null,
    currentPolicy: (
      await db.query("SELECT body FROM planning_policies WHERE id=1")
    ).rows[0].body,
    summary: {
      skus: input.data.rows.length,
      orders: input.data.history?.length || 0,
      archived: input.data.deletedHistory?.length || 0,
      draftLines: input.data.orders.length,
    },
  };
}
export function legacySku(r: any) {
  if (!isActiveSize(String(r.size)))
    throw new AppError(
      400,
      "Dữ liệu có size đã ngừng kinh doanh; giữ bản sao lưu để đối soát, không nhập vào danh mục/lệnh mới",
    );
  return skuSchema.parse({
    sku: String(r.sku || "").toUpperCase(),
    color: r.color,
    size: r.size,
    day1: legacyNumber(r.day1),
    day2: legacyNumber(r.day2),
    stock:
      r.stockKnown === false || r.stock === undefined || r.stock === ""
        ? null
        : legacyNumber(r.stock),
    inbound: legacyNumber(r.inbound),
    health: stages.includes(r.health) ? r.health : "Mở bán",
    pilotQty: legacyNumber(r.pilotQty),
    abnormal: !!r.abnormal,
    manualRate: legacyNumber(r.manualRate),
    selected: !!r.selected,
    inventorySource: "Import bản sao lưu V9",
    salesSource: r.salesSource || "Import V9",
  });
}
export async function confirmV9(db: DB, actor: Actor, id: string) {
  const preview = (
    await db.query("SELECT * FROM import_previews WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!preview || preview.actor_id !== actor.id || preview.kind !== "v9")
    throw new AppError(404, "Không có bản xem trước");
  if (preview.status === "done") return { replayed: true };
  if (preview.body.errors.length)
    throw new AppError(400, "Bản V9 còn lỗi/trùng cần đối soát");
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('comsflow:v9-import'))",
  );
  const data = preview.body.input.data;
  const catalog = await variants(db);
  for (const r of data.rows) {
    const body = legacySku(r);
    const variantId = await saveSku(db, actor, body);
    catalog.push({ ...body, id: variantId, version: 1 });
  }
  for (const { source: h, archived } of legacyOrders(data)) {
    const items = [];
    for (const i of h.items) {
      let variant = catalog.find(
        (v) =>
          v.sku === String(i.sku).toUpperCase() &&
          v.color === i.color &&
          v.size === i.size,
      );
      if (!variant) {
        const body = legacySku(i);
        const variantId = await saveSku(db, actor, body);
        variant = { ...body, id: variantId, version: 1 };
        catalog.push(variant);
      }
      items.push({
        variantId: variant.id,
        qty: i.qty,
        priority: i.priority || "THƯỜNG",
      });
    }
    let order = await createOrder(db, actor, {
      code: h.id,
      time: legacyTime(h.time || h.createdAt),
      supplier: h.supplier || "Chưa khai báo (V9)",
      delivery: h.delivery || null,
      requestedBy: h.requestedBy || "Chưa xác định (V9)",
      notes: h.notes || "",
      status: [
        "Nháp",
        "Đã gửi xưởng",
        "Đã xác nhận",
        "Đang sản xuất",
        "Tạm dừng",
      ].includes(h.status)
        ? h.status
        : "Đang sản xuất",
      items,
    });
    for (const [n, r] of (h.receipts || []).entries()) {
      const lines = r.lines
        .filter((l: any) => l.qty > 0)
        .map((l: any) => ({
          itemId: order.items.find(
            (i) =>
              i.sku === String(l.sku).toUpperCase() &&
              i.color === l.color &&
              i.size === l.size,
          )?.id,
          qty: l.qty,
        }));
      if (lines.length) {
        await receive(db, actor, order.id, "v9-" + id + "-" + n, {
          expectedVersion: order.version,
          date: r.date,
          note: "[Nhập V9] " + (r.note || ""),
          lines,
        });
        order = await loadOrder(db, order.id);
      }
    }
    if (h.cancelled && totals(order).pending)
      order = await orderAction(db, actor, order.id, "cancel", {
        expectedVersion: order.version,
        reason: "Nhập trạng thái hủy từ V9",
      });
    if (archived)
      order = await orderAction(db, actor, order.id, "delete", {
        expectedVersion: order.version,
        reason: h.deletedReason || "Nhập lịch sử đã xóa V9",
      });
    await audit(db, actor.id, "v9.order.source", order.id, {
      legacy: h,
      note: "Người nhập không phải người thao tác lịch sử; actor cũ giữ trong legacy.",
    });
  }
  // Preserve full source, embedded sales and old edit logs verbatim for reconciliation.
  await audit(db, actor.id, "v9.backup.source", id, data);
  if (data.config)
    await db.query(
      "UPDATE planning_policies SET body=$1,version=version+1 WHERE id=1",
      [JSON.stringify(preview.body.policy)],
    );
  await db.query("UPDATE import_previews SET status='done' WHERE id=$1", [id]);
  return { imported: true };
}
function legacyTime(x: string) {
  if (/(?:Z|[+-]\d\d:\d\d)$/.test(x)) return new Date(x).toISOString();
  return new Date(x + "+07:00").toISOString();
}
