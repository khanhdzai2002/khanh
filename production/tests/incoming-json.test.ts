import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction as tx } from "../server/db";
import { migrate } from "../server/migrate";
import { saveSku, createOrder, loadOrder, receive } from "../server/service";
import {
  createIncoming,
  previewIncomingAllocation,
  confirmIncoming,
} from "../server/incoming-goods";
import { previewReceiptJson, createJsonReceipt } from "../server/incoming-json";
import { parseReceiptJson, jsonSuggestions } from "../shared/incoming-json";
import { loadReceivingReport } from "../server/receiving-report";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  name: "Synthetic JSON warehouse",
  role: "Administrator",
};
const item = (extra: any = {}) => ({
  sku: "SYNTHETIC-JSON",
  color: "Cam cháy",
  size: "M",
  quantity: 120,
  source_row: 1,
  bag_no: "1",
  sku_source: "handwritten",
  needs_review: true,
  review_note: "Kiểm tra số lượng",
  ...extra,
});
const doc = (extra: any = {}) => ({
  schema: "comsflow.production.import.v1",
  import_mode: "WAREHOUSE_RECEIPT",
  document: {
    document_id: "SYNTHETIC-DOC-01",
    document_type: "WAREHOUSE_RECEIPT",
    receipt_date: "2026-11-01",
    inspection_date: "2026-11-01",
    receipt_number: "1",
    supplier: "SYNTHETIC Factory",
    supplier_review_required: true,
    checker: "Synthetic checker",
  },
  items: [
    item(),
    item({ source_row: 2, bag_no: "2", quantity: 80, needs_review: false }),
    item({
      source_row: 3,
      bag_no: "",
      sku: "SYNTHETIC-OLD",
      color: "Trắng",
      size: "XL",
      quantity: 10,
      needs_review: false,
    }),
  ],
  notes: ["Synthetic source notes"],
  ...extra,
});
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','json-test',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
async function fixture() {
  const v = await tx((db) =>
    saveSku(db, actor, {
      sku: "SYNTHETIC-JSON",
      color: "Cam cháy (phối đen)",
      size: "M",
      stock: 30,
      inbound: 10,
    }),
  );
  return { v };
}
async function setup(source = doc()) {
  const p = await tx((db) =>
    previewReceiptJson(db, actor, { text: JSON.stringify(source) }),
  );
  const body = {
    date: p.source.document.receipt_date,
    supplier: p.source.document.supplier,
    note: "Synthetic import",
    metadataReviewed: true,
    mappings: p.lines.map((l) => ({
      key: l.key,
      sku: l.suggestedSku,
      color: l.suggestedColor || l.color,
      keepUnmatched: !l.knownSku,
      reviewed: true,
    })),
  };
  return { p, body };
}
async function draft(s: Awaited<ReturnType<typeof setup>>) {
  const { id } = await tx((db) => createJsonReceipt(db, actor, s.p.id, s.body));
  return (
    await pool.query("SELECT * FROM incoming_goods_drafts WHERE id=$1", [id])
  ).rows[0];
}
it("parses fenced/BOM JSON, keeps repeated SKU across bags and sums duplicate source cells without overwriting", () => {
  const input = doc({
    items: [
      item(),
      item({ quantity: 7 }),
      item({ source_row: 2, bag_no: "2", quantity: 80, needs_review: false }),
      item({ source_row: 3, bag_no: "", size: "S", quantity: 0 }),
    ],
  });
  const p = parseReceiptJson(
    "\uFEFF```json\n" + JSON.stringify(input) + "\n```",
  );
  expect(p).toMatchObject({ total: 207, ignoredZero: 1 });
  expect(p.lines).toHaveLength(2);
  expect(p.lines[0].quantities.M).toBe(127);
  expect(p.lines[0].sourceItems).toEqual([1, 2]);
  expect(p.lines[1].bag).toBe("2");
});
it("rejects malformed JSON, other import modes/schemas, invalid dates and noninteger/negative/missing quantities", () => {
  expect(() => parseReceiptJson("{invalid")).toThrow("JSON không hợp lệ");
  for (const bad of [
    doc({ schema: "other" }),
    doc({ import_mode: "PRODUCTION_ORDER" }),
    {
      ...doc(),
      document: { ...doc().document, document_type: "PRODUCTION_ORDER" },
    },
    { ...doc(), document: { ...doc().document, receipt_date: "2026-02-30" } },
    doc({ items: [item({ quantity: -1 })] }),
    doc({ items: [item({ quantity: 1.5 })] }),
    doc({ items: [item({ quantity: "120" })] }),
    doc({ items: [item({ size: "42" })] }),
  ])
    expect(() => parseReceiptJson(JSON.stringify(bad))).toThrow();
});
it("never turns retired sizes into XL; zeros ignored, empty/oversized sheets blocked", () => {
  expect(() =>
    parseReceiptJson(JSON.stringify(doc({ items: [item({ size: "XXL" })] }))),
  ).toThrow("đã ngừng");
  expect(
    parseReceiptJson(
      JSON.stringify(
        doc({ items: [item(), item({ size: "XS", quantity: 0 })] }),
      ),
    ),
  ).toMatchObject({ total: 120, ignoredZero: 1 });
  expect(() =>
    parseReceiptJson(JSON.stringify(doc({ items: [item({ quantity: 0 })] }))),
  ).toThrow("không có sản phẩm");
  expect(() =>
    parseReceiptJson(
      JSON.stringify(
        doc({
          items: Array.from({ length: 251 }, (_, i) =>
            item({ source_row: i + 1 }),
          ),
        }),
      ),
    ),
  ).toThrow("250");
  expect(() =>
    parseReceiptJson(
      JSON.stringify(
        doc({ items: [item({ quantity: 1000000 }), item({ quantity: 1 })] }),
      ),
    ),
  ).toThrow("vượt");
});
it("suggests colours only within product, asks review for shortcuts/diacritics and leaves ambiguous colours blank", () => {
  const p = parseReceiptJson(
    JSON.stringify(doc({ items: [item({ color: "Trắng" })] })),
  );
  const v = (sku: string, color: string) => ({
    id: randomUUID(),
    sku,
    color,
    size: "M",
  });
  expect(
    jsonSuggestions(
      p.lines,
      [v("OTHER", "Trắng"), v("SYNTHETIC-JSON", "Trắng (phối đen)")],
      [],
    )[0],
  ).toMatchObject({ suggestedColor: "Trắng (phối đen)" });
  expect(
    jsonSuggestions(
      p.lines,
      [
        v("SYNTHETIC-JSON", "Trắng (phối đen)"),
        v("SYNTHETIC-JSON", "Trắng (phối đỏ)"),
      ],
      [],
    )[0].suggestedColor,
  ).toBe("");
  const red = parseReceiptJson(
    JSON.stringify(doc({ items: [item({ color: "Đỗ" })] })),
  );
  expect(
    jsonSuggestions(red.lines, [v("SYNTHETIC-JSON", "Đỏ")], [])[0].matchSource,
  ).toContain("cần kiểm tra");
});
it("preview never creates receipts, orders, SKUs or drafts", async () => {
  await fixture();
  const s = await setup();
  expect(s.p).toMatchObject({ total: 210 });
  expect(s.p.lines).toHaveLength(3);
  for (const table of [
    "incoming_goods_drafts",
    "production_receipts",
    "production_orders",
    "incoming_json_sources",
  ])
    expect((await pool.query(`SELECT * FROM ${table}`)).rowCount).toBe(0);
  expect((await pool.query("SELECT * FROM variants")).rowCount).toBe(1);
});
it("requires metadata and flagged/suggested/unknown line review and exact complete mappings", async () => {
  await fixture();
  const s = await setup();
  await expect(
    tx((db) =>
      createJsonReceipt(db, actor, s.p.id, {
        ...s.body,
        metadataReviewed: false,
      }),
    ),
  ).rejects.toThrow();
  await expect(
    tx((db) =>
      createJsonReceipt(db, actor, s.p.id, {
        ...s.body,
        mappings: s.body.mappings.map((m, i) =>
          i === 0 ? { ...m, reviewed: false } : m,
        ),
      }),
    ),
  ).rejects.toThrow("cần xác nhận");
  await expect(
    tx((db) =>
      createJsonReceipt(db, actor, s.p.id, {
        ...s.body,
        mappings: s.body.mappings.slice(1),
      }),
    ),
  ).rejects.toThrow("đủ từng dòng");
  await expect(
    tx((db) =>
      createJsonReceipt(db, actor, s.p.id, {
        ...s.body,
        mappings: s.body.mappings.map((m, i) =>
          i === 2 ? { ...m, keepUnmatched: false } : m,
        ),
      }),
    ),
  ).rejects.toThrow("chọn đúng");
  expect(
    (await pool.query("SELECT * FROM incoming_goods_drafts")).rowCount,
  ).toBe(0);
});
it("creates only a grouped four-size draft, preserving source flags, notes, identifiers and blank bags", async () => {
  await fixture();
  const s = await setup(),
    d = await draft(s);
  expect(d.version).toBe(2);
  expect(d.form.rows).toHaveLength(12);
  expect(d.form.rows.reduce((n: number, r: any) => n + r.qty, 0)).toBe(210);
  expect(d.form.rows.filter((r: any) => r.bag === "")).toHaveLength(4);
  expect(new Set(d.form.rows.map((r: any) => r.lineGroupId)).size).toBe(3);
  const source = (await pool.query("SELECT * FROM incoming_json_sources"))
    .rows[0];
  expect(source.source).toEqual(s.p.source);
  expect(source.document_id).toBe("SYNTHETIC-DOC-01");
  expect(source.decisions.mappings).toEqual(s.body.mappings);
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
  await expect(
    pool.query("UPDATE incoming_json_sources SET original_total=1"),
  ).rejects.toThrow("append-only");
});
it("same preview concurrent retries return one draft; different data is rejected", async () => {
  await fixture();
  const s = await setup();
  const [a, b] = await Promise.all([
    tx((db) => createJsonReceipt(db, actor, s.p.id, s.body)),
    tx((db) => createJsonReceipt(db, actor, s.p.id, s.body)),
  ]);
  expect(a).toEqual(b);
  expect(
    (await pool.query("SELECT * FROM incoming_goods_drafts")).rowCount,
  ).toBe(1);
  await expect(
    tx((db) =>
      createJsonReceipt(db, actor, s.p.id, { ...s.body, note: "changed" }),
    ),
  ).rejects.toThrow("nội dung khác");
});
it("document IDs are unique across previews/users/case even while draft, preventing duplicate imports", async () => {
  await fixture();
  const s = await setup();
  await draft(s);
  const source = doc();
  source.document.document_id = " synthetic-doc-01 ";
  const second = await setup(source);
  await expect(
    tx((db) => createJsonReceipt(db, actor, second.p.id, second.body)),
  ).rejects.toThrow("đã có phiếu");
  const other = {
    id: randomUUID(),
    name: "Synthetic second operator",
    role: "Warehouse Operator",
  };
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','json-second',$2,$3)",
    [other.id, other.name, other.role],
  );
  const otherPreview = await tx((db) =>
    previewReceiptJson(db, other, { text: JSON.stringify(doc()) }),
  );
  await expect(
    tx((db) => createJsonReceipt(db, other, otherPreview.id, s.body)),
  ).rejects.toThrow("đã có phiếu");
  expect(
    (await pool.query("SELECT * FROM incoming_goods_drafts")).rowCount,
  ).toBe(1);
});
it("expired and cross-owner previews cannot create drafts; refreshed catalog revalidated", async () => {
  await fixture();
  const s = await setup();
  await pool.query(
    "UPDATE import_previews SET created_at=now()-interval '31 minutes' WHERE id=$1",
    [s.p.id],
  );
  await expect(
    tx((db) => createJsonReceipt(db, actor, s.p.id, s.body)),
  ).rejects.toThrow("hết hạn");
  const fresh = await setup();
  await expect(
    tx((db) =>
      createJsonReceipt(
        db,
        { ...actor, id: randomUUID() },
        fresh.p.id,
        fresh.body,
      ),
    ),
  ).rejects.toThrow("được phép");
  await pool.query("DELETE FROM inventory_snapshots");
  await pool.query("DELETE FROM variants");
  await expect(
    tx((db) => createJsonReceipt(db, actor, fresh.p.id, fresh.body)),
  ).rejects.toThrow("chọn đúng");
});
it("JSON draft uses existing FIFO/unmatched confirmation atomically and never creates stock or production orders", async () => {
  const { v } = await fixture();
  const make = (qty: number, time: string) =>
    tx((db) =>
      createOrder(db, actor, {
        time,
        supplier: "SYNTHETIC Factory",
        delivery: null,
        requestedBy: actor.name,
        notes: "Synthetic",
        status: "Đang sản xuất",
        items: [{ variantId: v, qty, priority: "THƯỜNG" }],
      }),
    );
  const a = await make(150, "2026-10-29T10:00:00+07:00"),
    b = await make(100, "2026-10-30T10:00:00+07:00"),
    s = await setup(),
    d = await draft(s);
  const p = await tx((db) =>
    previewIncomingAllocation(db, actor, d.id, {
      expectedVersion: d.version,
      form: d.form,
    }),
  );
  expect(p).toMatchObject({ entered: 210, allocated: 200, remaining: 10 });
  const body = {
    expectedVersion: d.version,
    form: d.form,
    checked: true,
    acceptUnmatched: true,
    allocationPreviewId: p.id,
    orders: p.orders,
  };
  const r = await tx((db) => confirmIncoming(db, actor, d.id, body));
  expect(r).toMatchObject({
    received: 210,
    matchedReceived: 200,
    unmatchedReceived: 10,
  });
  expect((await loadOrder(pool, a.id)).items[0].received).toBe(150);
  expect((await loadOrder(pool, b.id)).items[0].received).toBe(50);
  expect((await pool.query("SELECT * FROM production_orders")).rowCount).toBe(
    2,
  );
  expect((await pool.query("SELECT * FROM variants")).rowCount).toBe(1);
  expect(
    (await pool.query("SELECT body FROM variants")).rows[0].body,
  ).toMatchObject({ stock: 30, inbound: 10 });
  expect((await loadReceivingReport(pool, {})).totals).toMatchObject({
    received: 210,
    unmatched: 10,
    pending: 50,
  });
  expect(await tx((db) => confirmIncoming(db, actor, d.id, body))).toEqual(r);
});
it("pre-existing manual drafts, orders, receipts and images remain byte-for-byte unchanged through import and migrations", async () => {
  const { v } = await fixture();
  const old = await tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-20T10:00:00+07:00",
      supplier: "OTHER",
      delivery: null,
      requestedBy: actor.name,
      notes: "Old synthetic",
      status: "Nháp",
      items: [{ variantId: v, qty: 100, priority: "THƯỜNG" }],
    }),
  );
  await tx((db) =>
    receive(db, actor, old.id, randomUUID(), {
      expectedVersion: 1,
      date: "2026-10-20",
      note: "Old receipt",
      lines: [{ itemId: old.items[0].id, qty: 20 }],
    }),
  );
  const manual = await tx((db) =>
    createIncoming(db, actor, {
      images: [
        {
          name: "old-synthetic.png",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        },
      ],
    }),
  );
  const before = {
    order: await loadOrder(pool, old.id),
    receipts: (await pool.query("SELECT * FROM production_receipts")).rows,
    draft: (
      await pool.query("SELECT * FROM incoming_goods_drafts WHERE id=$1", [
        manual.id,
      ])
    ).rows,
    images: (await pool.query("SELECT * FROM incoming_goods_images")).rows,
  };
  await draft(await setup());
  await migrate();
  expect(await loadOrder(pool, old.id)).toEqual(before.order);
  expect((await pool.query("SELECT * FROM production_receipts")).rows).toEqual(
    before.receipts,
  );
  expect(
    (
      await pool.query("SELECT * FROM incoming_goods_drafts WHERE id=$1", [
        manual.id,
      ])
    ).rows,
  ).toEqual(before.draft);
  expect(
    (await pool.query("SELECT * FROM incoming_goods_images")).rows,
  ).toEqual(before.images);
});
it("JSON routes enforce auth/read/receive/CSRF and expose source on the shared draft reader", async () => {
  await fixture();
  const app = makeApp(),
    server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    expect((await fetch(base + "/api/incoming-json")).status).toBe(401);
    const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      }),
      cookie = login.headers.get("set-cookie")!.split(";")[0],
      me = await (
        await fetch(base + "/api/me", { headers: { Cookie: cookie } })
      ).json();
    const headers = {
      Cookie: cookie,
      Origin: process.env.PUBLIC_URL!,
      "Content-Type": "application/json",
      "X-CSRF-Token": me.csrf,
    };
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (
        await fetch(base + "/api/incoming-json/preview", {
          method: "POST",
          headers,
          body: JSON.stringify({ text: JSON.stringify(doc()) }),
        })
      ).status,
    ).toBe(403);
    await pool.query("UPDATE users SET role='Warehouse Operator' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (
        await fetch(base + "/api/incoming-json/preview", {
          method: "POST",
          headers: { ...headers, "X-CSRF-Token": "wrong" },
          body: JSON.stringify({ text: JSON.stringify(doc()) }),
        })
      ).status,
    ).toBe(403);
    const p = await (
      await fetch(base + "/api/incoming-json/preview", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: JSON.stringify(doc()) }),
      })
    ).json();
    const body = {
      date: p.source.document.receipt_date,
      supplier: p.source.document.supplier,
      metadataReviewed: true,
      mappings: p.lines.map((l: any) => ({
        key: l.key,
        sku: l.suggestedSku,
        color: l.suggestedColor || l.color,
        keepUnmatched: !l.knownSku,
        reviewed: true,
      })),
    };
    const made = await fetch(base + `/api/incoming-json/${p.id}/create`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    expect(made.status).toBe(201);
    const d = await made.json();
    const loaded = await (
      await fetch(base + `/api/incoming/${d.id}`, {
        headers: { Cookie: cookie },
      })
    ).json();
    expect(loaded.jsonSource.document_id).toBe("SYNTHETIC-DOC-01");
    const exported = await fetch(base + `/api/incoming-json/${d.id}/source`, {
      headers: { Cookie: cookie },
    });
    expect(exported.status).toBe(200);
    expect(await exported.json()).toEqual(p.source);
    expect(
      await (
        await fetch(base + "/api/incoming-json", {
          headers: { Cookie: cookie },
        })
      ).json(),
    ).toHaveLength(1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
