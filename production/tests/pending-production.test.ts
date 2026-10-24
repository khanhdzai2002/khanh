import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import {
  pendingProduction,
  pendingProductionRows,
  pendingProductBreakdown,
} from "../shared/pending-production";
import { type ProductionOrder } from "../shared/domain";
import { pool, transaction } from "../server/db";
import { migrate } from "../server/migrate";
import { makeApp } from "../server/app";
import { saveSku, createOrder, receive } from "../server/service";
const item = (
  sku: string,
  size: string,
  qty: number,
  received = 0,
  color = "Xám tiêu",
) => ({
  id: randomUUID(),
  variantId: randomUUID(),
  sku,
  color,
  size,
  qty,
  received,
  priority: "THƯỜNG",
});
const order = (
  items: ReturnType<typeof item>[],
  extra: Partial<ProductionOrder> = {},
): ProductionOrder => ({
  id: randomUUID(),
  code: "LSX-SYNTHETIC-" + randomUUID().slice(0, 6),
  time: "2026-10-20T10:00:00+07:00",
  supplier: "Synthetic factory",
  delivery: "2026-10-20",
  requestedBy: "Synthetic planner",
  notes: "",
  status: "Đã xác nhận",
  cancelled: false,
  deletedAt: null,
  version: 1,
  items,
  createdBy: randomUUID(),
  createdAt: "2026-10-20T03:00:00Z",
  updatedAt: "2026-10-20T03:00:00Z",
  ...extra,
});
beforeAll(async () => {
  await migrate();
});
afterAll(async () => {
  await pool.end();
});
it("aggregates remaining by code/colour/size across orders, never counts received again", () => {
  const a = order([
      item("MIU66", "S", 100, 30),
      item("MIU66", "M", 80, 20),
      item("MIU66", "L", 50, 50),
    ]),
    b = order([item("miu66", "S", 20, 5), item("MIU66", "M", 10, 0, "Đen")]);
  const r = pendingProduction([a, b]);
  expect(r.rows).toHaveLength(2);
  expect(r.total).toBe(155);
  expect(r.orderCount).toBe(2);
  const gray = r.rows.find((r) => r.color === "Xám tiêu")!;
  expect(gray.quantities).toMatchObject({ S: 85, M: 60, L: 0 });
  expect(gray.pending).toBe(145);
  expect(gray.sources).toHaveLength(2);
  expect(gray.sources.reduce((n, s) => n + s.pending, 0)).toBe(gray.pending);
});
it("filters product/colour/size/supplier/status and uses Vietnam order dates", () => {
  const a = order([item("MIU66", "S", 100), item("MIU66", "M", 20)], {
      supplier: "One",
      time: "2026-10-20T18:00:00Z",
    }),
    b = order([item("MIU66", "S", 30)], {
      supplier: "Two",
      status: "Đang sản xuất",
    });
  const r = pendingProduction([a, b], {
    sku: "miu66",
    color: "xám tiêu",
    size: "S",
    supplier: "One",
    status: "Đã xác nhận",
    from: "2026-10-21",
    to: "2026-10-21",
  });
  expect(r.total).toBe(100);
  expect(r.rows[0].quantities.M).toBe(0);
  expect(pendingProduction([a, b], { supplier: "Two" }).total).toBe(30);
});
it("search ignores accents and word order, with no colour identity guessing", () => {
  const list = [
    order([item("MIU66", "S", 10), item("MIU79", "M", 20, 0, "Đỏ mận")]),
  ];
  expect(pendingProduction(list, { query: "MIU66 xam tieu" }).total).toBe(10);
  expect(pendingProduction(list, { query: "tieu miu66 xam" }).total).toBe(10);
  expect(pendingProduction(list, { query: "do man" }).total).toBe(20);
  expect(pendingProduction(list, { color: "Xám" }).total).toBe(0);
});
it("excludes deleted, cancelled, completed and default drafts/paused; inclusion is explicit", () => {
  const list = [
    order([item("A", "S", 10)]),
    order([item("B", "M", 20)], { status: "Nháp" }),
    order([item("C", "L", 30)], { status: "Tạm dừng" }),
    order([item("D", "M", 40)], { cancelled: true }),
    order([item("E", "M", 50)], { deletedAt: "2026-10-24T00:00:00Z" }),
    order([item("F", "M", 60, 60)]),
  ];
  expect(pendingProduction(list).total).toBe(10);
  expect(
    pendingProduction(list, { includeDrafts: "true", includePaused: "true" })
      .total,
  ).toBe(60);
});
it("donut includes all products through Others, conserves units and shares after filters", () => {
  const list = [
    order(Array.from({ length: 12 }, (_, i) => item("CODE-" + i, "M", i + 1))),
  ];
  const r = pendingProduction(list);
  expect(r.slices).toHaveLength(9);
  expect(r.slices[8].other).toBe(true);
  expect(r.slices.reduce((n, s) => n + s.pending, 0)).toBe(78);
  expect(r.slices.reduce((n, s) => n + s.share, 0)).toBeCloseTo(100);
  const filtered = pendingProduction(list, { sku: "CODE-1" });
  expect(filtered.slices[0].share).toBe(100);
  expect(filtered.total).toBe(2);
});
it("size/footer/group totals reconcile and exports have no repeated total rows", () => {
  const r = pendingProduction([
    order([item("A", "S", 40, 10), item("A", "M", 20), item("B", "L", 10)]),
  ]);
  expect(Object.values(r.sizeTotals).reduce((n, v) => n + v, 0)).toBe(r.total);
  expect(r.rows.reduce((n, g) => n + g.pending, 0)).toBe(r.total);
  const rows = pendingProductionRows(r);
  expect(rows).toHaveLength(3);
  expect(rows.slice(1).reduce((n, row) => n + Number(row[6]), 0)).toBe(60);
});
it("zero or unmatched data produces no fake shares; invalid range/size/status blocked", () => {
  expect(pendingProduction([]).slices).toEqual([]);
  expect(pendingProduction([order([item("A", "M", 10, 10)])]).total).toBe(0);
  expect(() =>
    pendingProduction([], { from: "2026-10-24", to: "2026-10-20" }),
  ).toThrow();
  expect(() => pendingProduction([], { size: "XXXXL" })).toThrow();
  expect(() => pendingProduction([], { status: "fake" })).toThrow();
});
it("same-colour case combines, overdue/order counts unique across different groups", () => {
  const o = order(
    [
      item("A", "S", 10, 0, "Xám tiêu"),
      item("A", "M", 20, 0, "xám tiêu"),
      item("B", "L", 10),
    ],
    { delivery: "2026-01-01" },
  );
  const r = pendingProduction([o]);
  expect(r.rows).toHaveLength(2);
  expect(r.orderCount).toBe(1);
  expect(r.overdueOrders).toBe(1);
  expect(r.rows.find((r) => r.sku === "A")?.pending).toBe(30);
});
it("filtered export uses PostgreSQL pending amounts, authenticated Viewer and valid XLSX", async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    expect((await fetch(base + "/api/export/pending-production")).status).toBe(
      401,
    );
    const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      }),
      cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
        await fetch(base + "/api/me", { headers: { Cookie: cookie } })
      ).json(),
      actor = me.user;
    const id = await transaction((db) =>
      saveSku(db, actor, { sku: "MIU66", color: "Xám tiêu", size: "S" }),
    );
    const o = await transaction((db) =>
      createOrder(db, actor, {
        time: "2026-10-20T10:00:00+07:00",
        delivery: "2026-10-25",
        supplier: "Synthetic factory",
        requestedBy: actor.name,
        notes: "Synthetic",
        status: "Đã xác nhận",
        items: [{ variantId: id, qty: 100, priority: "THƯỜNG" }],
      }),
    );
    await transaction((db) =>
      receive(db, actor, o.id, randomUUID(), {
        expectedVersion: o.version,
        date: "2026-10-21",
        note: "Synthetic",
        lines: [{ itemId: o.items[0].id, qty: 30 }],
      }),
    );
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [actor.id]);
    const url =
        base + "/api/export/pending-production?query=miu66%20xam%20tieu&size=S",
      csv = await fetch(url, { headers: { Cookie: cookie } });
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain('"MIU66","Xám tiêu","70","0"');
    const excel = await fetch(url + "&format=xlsx", {
        headers: { Cookie: cookie },
      }),
      wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await excel.arrayBuffer()) as any);
    expect(wb.worksheets[0].getCell("C2").value).toBe(70);
    expect(wb.worksheets[0].getCell("G2").value).toBe(70);
    expect(
      (
        await fetch(
          base + "/api/export/pending-production?from=2026-10-24&to=2026-10-20",
          { headers: { Cookie: cookie } },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await pool.query(
          "SELECT received FROM production_order_items WHERE order_id=$1",
          [o.id],
        )
      ).rows[0].received,
    ).toBe(30);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

it("product drilldown conserves colour/size totals with explicit filtered denominators and unique orders", () => {
  const a = order([
    item("MIU37", "S", 400, 0, "Xám"),
    item("MIU37", "M", 800, 0, "Xám"),
    item("MIU37", "L", 800, 0, "Xám"),
    item("MIU37", "S", 1200, 0, "Đen"),
    item("MIU66", "M", 800, 0, "Cam"),
  ]);
  const report = pendingProduction([a]);
  const p = pendingProductBreakdown(report, "MIU37")!;
  expect(p.pending).toBe(3200);
  expect(p.share).toBe(80);
  expect(p.orderCount).toBe(1);
  const gray = p.colors.find((c) => c.color === "Xám")!;
  expect(gray.shareOfProduct).toBe(62.5);
  expect(gray.shareOfReport).toBe(50);
  expect(gray.sizes.find((s) => s.size === "S")).toMatchObject({
    pending: 400,
    shareOfColor: 20,
    shareOfProduct: 12.5,
  });
  expect(p.colors.reduce((n, c) => n + c.shareOfProduct, 0)).toBeCloseTo(100);
  expect(gray.sizes.reduce((n, s) => n + s.shareOfColor, 0)).toBeCloseTo(100);
  expect(gray.sizes.reduce((n, s) => n + s.pending, 0)).toBe(gray.pending);
  expect(pendingProductBreakdown(report, "NOT-FOUND")).toBeNull();
});
it("drilldown follows current colour/size filters and never creates missing quantity or NaN shares", () => {
  const a = order([
    item("MIU37", "S", 100, 30, "Xám"),
    item("MIU37", "M", 200, 200, "Xám"),
    item("MIU37", "L", 300, 0, "Đen"),
  ]);
  const report = pendingProduction([a], { color: "Xám", size: "S" });
  const p = pendingProductBreakdown(report, "MIU37")!;
  expect(p.pending).toBe(70);
  expect(p.share).toBe(100);
  expect(p.colors[0].shareOfProduct).toBe(100);
  expect(p.colors[0].sizes.find((s) => s.size === "S")?.shareOfColor).toBe(100);
  expect(p.colors[0].sizes.find((s) => s.size === "M")?.pending).toBe(0);
  expect(pendingProductBreakdown(pendingProduction([]), "MIU37")).toBeNull();
});
