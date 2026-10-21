import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import {
  productionReport,
  productionReportRows,
} from "../shared/production-report";
import type { ProductionOrder } from "../shared/domain";
import { pool, transaction } from "../server/db";
import { migrate } from "../server/migrate";
import { makeApp } from "../server/app";
import { saveSku, createOrder } from "../server/service";
const item = (
  sku: string,
  qty: number,
  received = 0,
  color = "Cam",
  size = "M",
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
const today = "2026-10-21";
beforeAll(async () => {
  await migrate();
});
afterAll(async () => {
  await pool.end();
});
it("quantity share sums across orders, not number of orders; pending and placed basis differ", () => {
  const a = order([item("A", 100), item("B", 300)]),
    b = order([item("A", 200, 50)]);
  const r = productionReport([a, b], {}, today);
  expect(r.totals).toMatchObject({
    products: 2,
    orders: 2,
    placed: 600,
    received: 50,
    pending: 550,
    overdueOrders: 2,
  });
  expect(r.products.find((p) => p.sku === "A")?.share).toBeCloseTo(
    (250 / 550) * 100,
  );
  const placed = productionReport([a, b], { basis: "placed" }, today);
  expect(placed.products.map((p) => p.share)).toEqual([50, 50]);
  expect(
    placed.products
      .find((p) => p.sku === "A")
      ?.sources.find((s) => s.id === a.id)?.shareInOrder,
  ).toBe(25);
});
it("deleted/cancelled always excluded; drafts and paused require explicit opt in", () => {
  const list = [
    order([item("A", 10)]),
    order([item("B", 20)], { status: "Nháp" }),
    order([item("C", 30)], { status: "Tạm dừng" }),
    order([item("D", 40)], { cancelled: true }),
    order([item("E", 50)], { deletedAt: "2026-10-21T00:00:00Z" }),
  ];
  expect(productionReport(list, {}, today).totals.placed).toBe(10);
  expect(
    productionReport(
      list,
      { includeDrafts: "true", includePaused: "true" },
      today,
    ).totals.placed,
  ).toBe(60);
});
it("pending scope retains received sizes of an ongoing product for honest progress and per-order share", () => {
  const o = order([
    item("A", 100, 100, "Cam", "M"),
    item("A", 50, 10, "Cam", "S"),
    item("B", 100, 100),
  ]);
  const r = productionReport([o], {}, today),
    p = r.products[0];
  expect(r.products).toHaveLength(1);
  expect(p).toMatchObject({
    sku: "A",
    placed: 150,
    received: 110,
    pending: 40,
  });
  expect(p.colors[0].quantities).toMatchObject({ M: 0, S: 40 });
  expect(p.sources[0].shareInOrder).toBe(60);
  expect(
    productionReport([o], { scope: "all", basis: "placed" }, today).products,
  ).toHaveLength(2);
});
it("filters by exact product/supplier/order date, denominator follows scope while source uses whole order", () => {
  const o = order([item("A", 100), item("B", 300)]);
  const r = productionReport(
    [o],
    {
      sku: "a",
      basis: "placed",
      from: "2026-10-20",
      to: "2026-10-20",
      supplier: o.supplier,
    },
    today,
  );
  expect(r.products[0].share).toBe(100);
  expect(r.products[0].sources[0].shareInOrder).toBe(25);
  expect(productionReport([o], { supplier: "Other" }, today).products).toEqual(
    [],
  );
  expect(productionReport([o], { from: "2026-10-21" }, today).products).toEqual(
    [],
  );
});
it("Vietnam day boundaries and overdue depend on pending qty, not just old due dates", () => {
  const a = order([item("A", 10)], {
      time: "2026-10-20T18:00:00Z",
      delivery: "2026-10-21",
    }),
    b = order([item("B", 20, 20)], { delivery: "2026-10-19" });
  const r = productionReport(
    [a, b],
    { scope: "all", from: "2026-10-21" },
    today,
  );
  expect(r.totals.orders).toBe(1);
  expect(r.totals.overdueOrders).toBe(0);
  expect(
    productionReport([a, b], { scope: "all" }, today).totals.overdueOrders,
  ).toBe(0);
});
it("product, colour and size rollups conserve quantities and unique order counts", () => {
  const o = order([
    item("a", 10, 2, "Cam", "S"),
    item("A", 20, 3, "cam", "M"),
    item("B", 5, 1, "Đen", "XL"),
  ]);
  const r = productionReport(
    [o, order([item("A", 7, 1, "Trắng", "2XL")])],
    {},
    today,
  );
  expect(r.totals.orders).toBe(2);
  expect(r.products[0].colors).toHaveLength(2);
  expect(r.products.reduce((n, p) => n + p.pending, 0)).toBe(r.totals.pending);
  for (const p of r.products)
    expect(
      p.colors.reduce(
        (n, c) => n + Object.values(c.quantities).reduce((a, b) => a + b, 0),
        0,
      ),
    ).toBe(p.pending);
  expect(r.products.reduce((n, p) => n + p.share, 0)).toBeCloseTo(100);
});
it("empty and complete-only data produce no NaN/Infinity, all/placed can show completed products", () => {
  expect(productionReport([], {}, today).totals.products).toBe(0);
  const o = order([item("A", 10, 10)]);
  expect(productionReport([o], {}, today).products).toHaveLength(0);
  const r = productionReport([o], { scope: "all" }, today);
  expect(r.products[0].share).toBe(0);
  expect(
    productionReport([o], { scope: "all", basis: "placed" }, today).products[0]
      .share,
  ).toBe(100);
});
it("invalid dates/basis are rejected instead of silently changing scope", () => {
  expect(() =>
    productionReport([], { from: "2026-10-22", to: "2026-10-20" }, today),
  ).toThrow();
  expect(() => productionReport([], { from: "not-a-date" }, today)).toThrow();
  expect(() => productionReport([], { basis: "revenue" }, today)).toThrow();
});
it("export has one SKU-size-order line each, totals conserve quantity with no duplicate totals rows", () => {
  const r = productionReport(
    [order([item("A", 100, 20, "Cam", "M"), item("B", 300, 50, "Trắng", "L")])],
    { basis: "placed" },
    today,
  );
  const rows = productionReportRows(r);
  expect(rows).toHaveLength(3);
  expect(rows.slice(1).reduce((n, row) => n + Number(row[8]), 0)).toBe(400);
  expect(rows[1][11]).toBe(25);
  expect(rows[1][12]).toBe(25);
});
it("report CSV/XLSX export uses real database and same filters, enforces login and remains read only for Viewer", async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    expect((await fetch(base + "/api/export/production-report")).status).toBe(
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
      saveSku(db, actor, { sku: "SYNTHETIC-REPORT", color: "Cam", size: "M" }),
    );
    await transaction((db) =>
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
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [actor.id]);
    const url =
      base +
      "/api/export/production-report?sku=SYNTHETIC-REPORT&basis=placed&from=2026-10-20&to=2026-10-20";
    const csv = await fetch(url, { headers: { Cookie: cookie } });
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain('"SYNTHETIC-REPORT","Cam","M"');
    const xlsx = await fetch(url + "&format=xlsx", {
        headers: { Cookie: cookie },
      }),
      wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await xlsx.arrayBuffer()) as any);
    expect(wb.worksheets[0].rowCount).toBe(2);
    expect(wb.worksheets[0].getCell("I2").value).toBe(100);
    expect(
      (
        await fetch(
          base + "/api/export/production-report?from=2026-10-21&to=2026-10-20",
          { headers: { Cookie: cookie } },
        )
      ).status,
    ).toBe(400);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM production_orders"))
        .rows[0].n,
    ).toBe(1);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

it("single-order report isolates composition while preserving full-order denominator", () => {
  const a = order([item("A", 100), item("B", 300)]),
    b = order([item("A", 1000)]);
  const r = productionReport(
    [a, b],
    { orderId: a.id, scope: "all", basis: "placed" },
    today,
  );
  expect(r.totals.orders).toBe(1);
  expect(r.totals.placed).toBe(400);
  expect(r.products.find((p) => p.sku === "A")?.share).toBe(25);
  expect(() => productionReport([], { orderId: "bad" })).toThrow();
});
