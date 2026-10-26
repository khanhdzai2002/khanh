import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { pool, transaction } from "../server/db";
import { migrate } from "../server/migrate";
import {
  saveSku,
  createOrder,
  loadOrder,
  editOrder,
  receive,
  orderAction,
  variants,
} from "../server/service";
import { skuSchema, totals } from "../shared/domain";
import {
  previewSales,
  confirmSales,
  salesReport,
  syncSales,
  previewV9,
  confirmV9,
} from "../server/imports";
import { makeApp } from "../server/app";
it("không tạo SKU có bán hợp lệ từ dòng đã trả hết số lượng", async () => {
  const input = upload(
    "replace",
    'Order ID,Order Line ID,Order Status,Product Name,Variation,Quantity,Sku Quantity of return,Created Time\nSYNTHETIC-RETURN,LINE-RETURN,Completed,Áo MIU66,"Trắng phối đen, M",5,5,2026-10-14 10:00:00',
  );
  const preview = await tx((db) => previewSales(db, actor, input));
  expect(preview.errors).toEqual([]);
  await tx((db) => confirmSales(db, actor, preview.id));
  expect((await salesReport(pool)).variants).toHaveLength(0);
  await tx((db) => syncSales(db, actor, "2"));
  expect(await variants()).toHaveLength(0);
});
const actor = {
  id: randomUUID(),
  name: "SYNTHETIC Test Planner",
  role: "Administrator",
};
const tx = <T>(fn: (db: any) => Promise<T>) => transaction(fn);
async function seed() {
  const variantId = await tx((db) =>
    saveSku(
      db,
      actor,
      skuSchema.parse({
        sku: "TEST-ERP",
        color: "Cam thử nghiệm",
        size: "M",
        stock: 30,
        inbound: 10,
        day1: 20,
        day2: 20,
        health: "Tăng trưởng",
      }),
    ),
  );
  return variantId;
}
async function order(qty = 1000) {
  const variantId = await seed();
  return tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-16T10:00:00+07:00",
      supplier: "Xưởng thử nghiệm",
      delivery: "2026-10-20",
      requestedBy: actor.name,
      status: "Nháp",
      notes: "SYNTHETIC TEST ONLY",
      items: [{ variantId, qty, priority: "THƯỜNG" }],
    }),
  );
}
const input = (o: any) => ({
  code: o.code,
  time: o.time,
  supplier: o.supplier,
  delivery: o.delivery,
  requestedBy: o.requestedBy,
  notes: o.notes,
  status: o.status,
  items: o.items.map((i: any) => ({
    id: i.id,
    variantId: i.variantId,
    qty: i.qty,
    priority: i.priority,
  })),
});
const receipt = (o: any, qty: number, key = randomUUID()) =>
  tx((db) =>
    receive(db, actor, o.id, key, {
      expectedVersion: o.version,
      date: "2026-10-17",
      note: "Đợt giao thử",
      lines: [{ itemId: o.items[0].id, qty }],
    }),
  );
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Unsafe database");
  await migrate();
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE users,products,suppliers,planning_policies,session CASCADE",
  );
  await pool.query(
    'INSERT INTO planning_policies VALUES(1,\'{"targetDays":5,"leadDays":3,"safeDays":0,"includeLead":false,"roundTo":1}\',1)',
  );
  await pool.query(
    "INSERT INTO users VALUES($1,'test','test-open-id',$2,'Administrator',false)",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
describe("PostgreSQL — giao dịch lệnh và biên nhận", () => {
  it("migration lặp và đồng thời giữ nguyên lệnh, biên nhận và lịch sử", async () => {
    const o = await order();
    await receipt(o, 300);
    const before = await loadOrder(pool, o.id);
    const history = (
      await pool.query("SELECT * FROM production_receipts WHERE order_id=$1", [
        o.id,
      ])
    ).rows;
    await Promise.all([migrate(), migrate()]);
    expect(await loadOrder(pool, o.id)).toEqual(before);
    expect(
      (
        await pool.query(
          "SELECT * FROM production_receipts WHERE order_id=$1",
          [o.id],
        )
      ).rows,
    ).toEqual(history);
    expect(
      Number(
        (await pool.query("SELECT count(*) AS n FROM schema_migrations"))
          .rows[0].n,
      ),
    ).toBe(8);
  });
  it("tạo lệnh nhiều màu nhiều size, không tự chuyển Nháp thành đã gửi", async () => {
    const ids: string[] = [];
    for (const color of ["Cam thử", "Trắng thử"])
      for (const size of ["S", "M", "L"])
        ids.push(
          await tx((db) =>
            saveSku(
              db,
              actor,
              skuSchema.parse({ sku: "TEST-MATRIX", color, size }),
            ),
          ),
        );
    const o = await tx((db) =>
      createOrder(db, actor, {
        time: "2026-10-16T10:00:00+07:00",
        supplier: "Test",
        delivery: null,
        requestedBy: actor.name,
        status: "Nháp",
        notes: "",
        items: ids.map((variantId) => ({
          variantId,
          qty: 10,
          priority: "ƯU TIÊN",
        })),
      }),
    );
    expect(o.items).toHaveLength(6);
    expect(totals(o)).toMatchObject({ placed: 60, status: "Nháp" });
  });
  it("1.000 → nhận 300 + 450 → 750/250/75%, đợt 3 đủ hàng", async () => {
    let o = await order();
    await receipt(o, 300);
    o = await loadOrder(pool, o.id);
    await receipt(o, 450);
    o = await loadOrder(pool, o.id);
    expect(totals(o)).toMatchObject({
      placed: 1000,
      received: 750,
      pending: 250,
      percent: 75,
      status: "Đã giao một phần",
    });
    await receipt(o, 250);
    expect(totals(await loadOrder(pool, o.id))).toMatchObject({
      received: 1000,
      pending: 0,
      status: "Đã giao đủ",
    });
    const sku = (await variants())[0];
    expect(sku.stock).toBe(30);
    expect(sku.inbound).toBe(10);
  });
  it("cho nhận vượt số đặt, nhận thêm sau đủ hàng, giữ tồn và số đặt gốc", async () => {
    let o = await order(10);
    await receipt(o, 15);
    o = await loadOrder(pool, o.id);
    expect(totals(o)).toMatchObject({
      placed: 10,
      received: 15,
      pending: 0,
      excess: 5,
      percent: 150,
      status: "Đã giao vượt",
    });
    await receipt(o, 2);
    o = await loadOrder(pool, o.id);
    expect(totals(o)).toMatchObject({
      placed: 10,
      received: 17,
      pending: 0,
      excess: 7,
      percent: 170,
    });
    const body = input(o);
    body.notes = "Sửa ghi chú sau khi giao dư";
    await tx((db) =>
      editOrder(db, actor, o.id, {
        order: body,
        expectedVersion: o.version,
        reason: "Đối soát giao dư",
      }),
    );
    expect((await loadOrder(pool, o.id)).items[0]).toMatchObject({
      qty: 10,
      received: 17,
    });
    expect(
      (await pool.query("SELECT * FROM production_receipts")).rowCount,
    ).toBe(2);
    expect((await variants())[0]).toMatchObject({ stock: 30, inbound: 10 });
  });
  it("giao dư một SKU không bù số còn thiếu SKU khác dù tổng vượt 100%", async () => {
    let o = await order(10);
    const other = await tx((db) =>
      saveSku(
        db,
        actor,
        skuSchema.parse({ sku: "OTHER", color: "Cam", size: "S", stock: 0 }),
      ),
    );
    o = await tx((db) =>
      editOrder(db, actor, o.id, {
        order: {
          ...input(o),
          items: [
            ...input(o).items,
            { variantId: other, qty: 10, priority: "THƯỜNG" },
          ],
        },
        expectedVersion: o.version,
        reason: "Thêm SKU thử nghiệm",
      }),
    );
    await receipt(o, 30);
    o = await loadOrder(pool, o.id);
    expect(totals(o)).toMatchObject({
      placed: 20,
      received: 30,
      pending: 10,
      excess: 20,
      percent: 150,
      status: "Đã giao một phần",
    });
    await expect(
      tx((db) =>
        receive(db, actor, o.id, randomUUID(), {
          expectedVersion: o.version,
          date: "2026-10-17",
          note: "",
          lines: [{ itemId: randomUUID(), qty: 1 }],
        }),
      ),
    ).rejects.toThrow("không thuộc lệnh");
    await expect(
      pool.query("UPDATE production_order_items SET received=-1 WHERE id=$1", [
        o.items[0].id,
      ]),
    ).rejects.toThrow();
  });
  it("gửi lặp đồng thời cùng khóa chỉ ghi một lần", async () => {
    const o = await order();
    const key = randomUUID();
    const result = await Promise.all([
      receipt(o, 300, key),
      receipt(o, 300, key),
    ]);
    expect(result[0]).toEqual(result[1]);
    expect((await loadOrder(pool, o.id)).items[0].received).toBe(300);
    expect(
      (await pool.query("SELECT * FROM production_receipts")).rowCount,
    ).toBe(1);
  });
  it("cùng khóa nhưng payload khác bị từ chối", async () => {
    const o = await order();
    const key = randomUUID();
    await receipt(o, 300, key);
    await expect(receipt(o, 450, key)).rejects.toThrow("nội dung khác");
  });
  it("hai đợt nhận đồng thời cùng version chỉ một lần thắng", async () => {
    const o = await order(10);
    const results = await Promise.allSettled([receipt(o, 7), receipt(o, 7)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await loadOrder(pool, o.id)).items[0].received).toBe(7);
  });
  it("sửa sau nhận giữ nguyên biên nhận, người sửa, trước và sau", async () => {
    let o = await order();
    await receipt(o, 300);
    o = await loadOrder(pool, o.id);
    const before = (await pool.query("SELECT * FROM production_receipt_items"))
      .rows;
    const body = input(o);
    body.items[0].qty = 1200;
    const after = await tx((db) =>
      editOrder(db, actor, o.id, {
        expectedVersion: o.version,
        reason: "Xưởng điều chỉnh số đặt",
        order: body,
      }),
    );
    expect(totals(after)).toMatchObject({
      placed: 1200,
      received: 300,
      pending: 900,
    });
    expect(
      (await pool.query("SELECT * FROM production_receipt_items")).rows,
    ).toEqual(before);
    const revision = (
      await pool.query("SELECT * FROM production_order_revisions")
    ).rows[0];
    expect(revision.actor_id).toBe(actor.id);
    expect(revision.before.items[0].qty).toBe(1000);
    expect(revision.after.items[0].qty).toBe(1200);
  });
  it("chặn giảm số đặt dưới đã nhận", async () => {
    let o = await order();
    await receipt(o, 300);
    o = await loadOrder(pool, o.id);
    const body = input(o);
    body.items[0].qty = 299;
    await expect(
      tx((db) =>
        editOrder(db, actor, o.id, {
          expectedVersion: o.version,
          reason: "Test giảm sai",
          order: body,
        }),
      ),
    ).rejects.toThrow("đã nhận");
  });
  it("chặn thay SKU dòng đã nhận", async () => {
    let o = await order();
    await receipt(o, 300);
    o = await loadOrder(pool, o.id);
    const other = await tx((db) =>
      saveSku(
        db,
        actor,
        skuSchema.parse({ sku: "OTHER", color: "Cam thử", size: "M" }),
      ),
    );
    const body = input(o);
    body.items[0].variantId = other;
    await expect(
      tx((db) =>
        editOrder(db, actor, o.id, {
          expectedVersion: o.version,
          reason: "Test đổi sai",
          order: body,
        }),
      ),
    ).rejects.toThrow("khóa SKU");
  });
  it("không xóa dòng có biên nhận", async () => {
    let o = await order();
    await receipt(o, 300);
    o = await loadOrder(pool, o.id);
    const other = await tx((db) =>
      saveSku(
        db,
        actor,
        skuSchema.parse({ sku: "OTHER", color: "Trắng", size: "L" }),
      ),
    );
    const body = input(o);
    body.items = [{ variantId: other, qty: 3, priority: "THƯỜNG" }];
    await expect(
      tx((db) =>
        editOrder(db, actor, o.id, {
          expectedVersion: o.version,
          reason: "Test xóa sai",
          order: body,
        }),
      ),
    ).rejects.toThrow("xóa dòng đã nhận");
  });
  it("không cho client sửa received", async () => {
    const o = await order();
    const body = input(o);
    body.items[0].received = 500;
    await expect(
      tx((db) =>
        editOrder(db, actor, o.id, {
          expectedVersion: o.version,
          reason: "Test payload",
          order: body,
        }),
      ),
    ).rejects.toThrow();
  });
  it("chặn trùng SKU trong một lệnh", async () => {
    const o = await order();
    const body = input(o);
    body.items.push({ ...body.items[0], id: undefined });
    await expect(
      tx((db) =>
        editOrder(db, actor, o.id, {
          expectedVersion: o.version,
          reason: "Test trùng SKU",
          order: body,
        }),
      ),
    ).rejects.toThrow("trùng");
  });
  it("hai nhân viên sửa cùng version → một thành công, một xung đột", async () => {
    const o = await order();
    const other = {
      ...actor,
      id: randomUUID(),
      name: "SYNTHETIC Second Planner",
    };
    await pool.query(
      "INSERT INTO users VALUES($1,'test','second',$2,'Production Planner',false)",
      [other.id, other.name],
    );
    const body = input(o);
    body.notes = "Changed";
    const result = await Promise.allSettled([
      tx((db) =>
        editOrder(db, actor, o.id, {
          expectedVersion: o.version,
          reason: "Người một sửa",
          order: body,
        }),
      ),
      tx((db) =>
        editOrder(db, other, o.id, {
          expectedVersion: o.version,
          reason: "Người hai sửa",
          order: body,
        }),
      ),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (result.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason.status,
    ).toBe(409);
    expect(
      (await pool.query("SELECT * FROM production_order_revisions")).rowCount,
    ).toBe(1);
  });
  it("hủy phần còn lại giữ hàng nhận; phải reopen để sửa qty", async () => {
    let o = await order();
    await receipt(o, 300);
    o = await loadOrder(pool, o.id);
    o = await tx((db) =>
      orderAction(db, actor, o.id, "cancel", {
        expectedVersion: o.version,
        reason: "Dừng thử nghiệm",
      }),
    );
    expect(totals(o)).toMatchObject({ received: 300, pending: 0 });
    const body = input(o);
    body.items[0].qty = 900;
    await expect(
      tx((db) =>
        editOrder(db, actor, o.id, {
          expectedVersion: o.version,
          reason: "Sửa chưa reopen",
          order: body,
        }),
      ),
    ).rejects.toThrow("khôi phục");
    o = await tx((db) =>
      editOrder(db, actor, o.id, {
        expectedVersion: o.version,
        reason: "Khôi phục để sửa",
        reopen: true,
        order: body,
      }),
    );
    expect(totals(o)).toMatchObject({ pending: 600, received: 300 });
  });
  it("xóa mềm, không cho nhận, khôi phục giữ biên nhận và audit", async () => {
    let o = await order();
    await receipt(o, 300);
    o = await loadOrder(pool, o.id);
    o = await tx((db) =>
      orderAction(db, actor, o.id, "delete", {
        expectedVersion: o.version,
        reason: "Xóa thử nghiệm",
      }),
    );
    expect(o.deletedAt).toBeTruthy();
    expect(o.pendingAtDeletion).toBe(700);
    await expect(receipt(o, 10)).rejects.toThrow("đã xóa");
    o = await tx((db) =>
      orderAction(db, actor, o.id, "restore", {
        expectedVersion: o.version,
        reason: "Khôi phục thử nghiệm",
      }),
    );
    expect(o.deletedAt).toBeNull();
    expect(totals(o).received).toBe(300);
    expect((await pool.query("SELECT * FROM archived_orders")).rowCount).toBe(
      2,
    );
  });
  it("mã cũ sau đổi và mã trong lệnh đã xóa đều không tái sử dụng", async () => {
    let o = await order();
    const oldCode = o.code;
    const body = input(o);
    body.code = "RENAMED-TEST";
    o = await tx((db) =>
      editOrder(db, actor, o.id, {
        expectedVersion: o.version,
        reason: "Đổi mã thử nghiệm",
        order: body,
      }),
    );
    await expect(
      tx((db) =>
        createOrder(db, actor, {
          ...input(o),
          code: oldCode,
          items: o.items.map((i) => ({
            variantId: i.variantId,
            qty: 1,
            priority: "THƯỜNG",
          })),
        }),
      ),
    ).rejects.toThrow("được sử dụng");
  });
  it("receipt và audit bất biến ở database", async () => {
    const o = await order();
    await receipt(o, 300);
    await expect(
      pool.query("UPDATE production_receipts SET note='tamper'"),
    ).rejects.toThrow("append-only");
    await expect(pool.query("DELETE FROM activity_logs")).rejects.toThrow(
      "append-only",
    );
  });
});
function upload(mode = "replace", rows?: string) {
  const csv =
    rows ||
    'Order ID,Order Line ID,Order Status,Product Name,Variation,Quantity,Created Time\nTEST01,LINE01,Đã hoàn tất,Áo MIU66,"Trắng phối đen, M",20,2026-10-14 12:00:00\nTEST02,LINE02,Đã hoàn tất,Áo MIU66,"Trắng phối đen, M",50,2026-10-15 10:00:00';
  return {
    filename: "synthetic-sales.csv",
    base64: Buffer.from(csv).toString("base64"),
    periodStart: "2026-10-08",
    periodEnd: "2026-10-15",
    exportedAt: "2026-10-15T10:41:00+07:00",
    mode,
  };
}
describe("Import, kỳ báo cáo và V9 JSON", () => {
  it("preview không thay dữ liệu; confirm lặp không nhân đôi; bỏ ngày cuối chưa trọn", async () => {
    const preview = await tx((db) => previewSales(db, actor, upload()));
    expect(preview.errors).toEqual([]);
    expect((await salesReport(pool)).variants).toHaveLength(0);
    await tx((db) => confirmSales(db, actor, preview.id));
    await tx((db) => confirmSales(db, actor, preview.id));
    const report = await salesReport(pool);
    expect(report.variants).toHaveLength(1);
    expect(report.lastFullDay).toBe("2026-10-14");
    expect(report.variants[0].r2).toBe(10);
  });
  it("bổ sung chống trùng, không thay dữ liệu ngoài kỳ", async () => {
    const a = await tx((db) => previewSales(db, actor, upload()));
    await tx((db) => confirmSales(db, actor, a.id));
    const b = await tx((db) => previewSales(db, actor, upload("append")));
    const result = await tx((db) => confirmSales(db, actor, b.id));
    expect(result.skipped).toBe(2);
    expect(
      (await pool.query("SELECT * FROM daily_sales WHERE active")).rowCount,
    ).toBe(2);
  });
  it("bổ sung thiếu khóa dòng bị chặn ở preview", async () => {
    const data = upload("append");
    data.base64 = Buffer.from(
      "Order ID,Order Status,Quantity,Created Time\nX,Completed,1,2026-10-14",
    ).toString("base64");
    const p = await tx((db) => previewSales(db, actor, data));
    expect(p.errors.length).toBeGreaterThan(0);
    await expect(tx((db) => confirmSales(db, actor, p.id))).rejects.toThrow(
      "sửa lỗi",
    );
  });
  it("chuyển bán sang dự báo giữ tồn, inbound, vòng đời và test", async () => {
    const id = await tx((db) =>
      saveSku(
        db,
        actor,
        skuSchema.parse({
          sku: "MIU66",
          color: "Trắng (phối tay đen)",
          size: "M",
          stock: 35,
          inbound: 12,
          health: "Mở bán",
          pilotQty: 7,
        }),
      ),
    );
    const p = await tx((db) => previewSales(db, actor, upload()));
    await tx((db) => confirmSales(db, actor, p.id));
    await tx((db) => syncSales(db, actor, "7"));
    const s = (await variants()).find((s) => s.id === id)!;
    expect(s).toMatchObject({
      stock: 35,
      inbound: 12,
      health: "Mở bán",
      pilotQty: 7,
      abnormal: true,
    });
    expect(s.manualRate).toBe(20 / 7);
  });
  it("V9 preview phát hiện trùng; không tự chạy migrations đổi targetDays 10 về 5", async () => {
    const r = { sku: "TEST-V9", color: "Trắng", size: "S", stockKnown: false };
    const p = await tx((db) =>
      previewV9(db, actor, {
        filename: "synthetic-v9.json",
        data: { rows: [r, r], orders: [], config: { targetDays: "10" } },
      }),
    );
    expect(p.errors.some((s) => s.includes("Trùng"))).toBe(true);
    expect(
      (await pool.query("SELECT body FROM planning_policies")).rows[0].body
        .targetDays,
    ).toBe(5);
  });
  it("V9 import giữ unknown stock; không nhập snapshot sales thành báo cáo hiện tại", async () => {
    const p = await tx((db) =>
      previewV9(db, actor, {
        filename: "synthetic-v9.json",
        data: {
          rows: [
            { sku: "TEST-V9", color: "Trắng", size: "S", stockKnown: false },
          ],
          orders: [],
          sales: { rows: [["2026-10-14", "TEST-V9", "Trắng", "S", 999]] },
        },
      }),
    );
    expect(p.errors).toEqual([]);
    await tx((db) => confirmV9(db, actor, p.id));
    expect((await variants())[0].stock).toBeNull();
    expect((await salesReport(pool)).variants).toHaveLength(0);
  });
});
describe("HTTP — quyền và phiên", () => {
  it("Railway health không cần login, kiểm tra DB và không lộ lỗi kết nối", async () => {
    const server = makeApp().listen(0, "127.0.0.1");
    await new Promise<void>((ok) => server.once("listening", ok));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      for (const path of ["/health", "/api/health"]) {
        const response = await fetch(base + path);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
      }
      const failure = Object.assign(new Error("synthetic-private-db-details"), {
        code: "ECONNREFUSED",
      });
      vi.spyOn(pool, "query").mockRejectedValueOnce(failure);
      const unavailable = await fetch(base + "/health");
      expect(unavailable.status).toBe(503);
      expect(await unavailable.text()).not.toContain(
        "synthetic-private-db-details",
      );
    } finally {
      vi.restoreAllMocks();
      await new Promise<void>((ok) => server.close(() => ok()));
    }
  });
  it("anonymous 401, CSRF/Origin bị chặn, Viewer và Warehouse bị chặn sửa", async () => {
    const server = makeApp().listen(0, "127.0.0.1");
    await new Promise<void>((ok) => server.once("listening", ok));
    const base = "http://127.0.0.1:" + (server.address() as any).port;
    try {
      expect((await fetch(base + "/api/skus")).status).toBe(401);
      expect((await fetch(base + "/auth/dev", { method: "POST" })).status).toBe(
        403,
      );
      const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0],
        me = await (
          await fetch(base + "/api/me", { headers: { Cookie: cookie } })
        ).json();
      expect(
        (
          await fetch(base + "/api/orders", {
            method: "POST",
            headers: {
              Origin: process.env.PUBLIC_URL!,
              Cookie: cookie,
              "Content-Type": "application/json",
            },
            body: "{}",
          })
        ).status,
      ).toBe(403);
      for (const role of ["Viewer", "Warehouse Operator"]) {
        await pool.query("UPDATE users SET role=$1 WHERE id=$2", [
          role,
          me.user.id,
        ]);
        expect(
          (
            await fetch(base + "/api/orders", {
              method: "POST",
              headers: {
                Origin: process.env.PUBLIC_URL!,
                Cookie: cookie,
                "X-CSRF-Token": me.csrf,
                "Content-Type": "application/json",
              },
              body: "{}",
            })
          ).status,
        ).toBe(403);
      }
    } finally {
      await new Promise<void>((ok) => server.close(() => ok()));
    }
  });
});

it("XLSX TikTok đọc được số lượng, màu và size qua preview", async () => {
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Orders");
  sheet.addRow([
    "Order ID",
    "Order Line ID",
    "Order Status",
    "Product Name",
    "Variation",
    "Quantity",
    "Created Time",
  ]);
  sheet.addRow([
    "SYN-XLSX",
    "LINE-XLSX",
    "Completed",
    "Áo MIU66",
    "Trắng phối đen, M",
    5,
    "2026-10-14 10:00:00",
  ]);
  const bytes = await wb.xlsx.writeBuffer();
  const p = await tx((db) =>
    previewSales(db, actor, {
      ...upload(),
      filename: "synthetic.xlsx",
      base64: Buffer.from(bytes).toString("base64"),
    }),
  );
  expect(p.errors).toEqual([]);
  expect(p.rows[0]).toMatchObject({ qty: 5, size: "M", kind: "single" });
});
it("V9 phục hồi lệnh đã xóa, biên nhận và lưu nguyên nhật ký cũ", async () => {
  const legacy = {
    key: "legacy-order",
    id: "V9-TEST-ARCHIVED",
    time: "2026-10-14T10:30",
    supplier: "Xưởng V9 thử",
    delivery: "2026-10-20",
    requestedBy: "Tên cũ chưa xác thực",
    notes: "",
    status: "Đang sản xuất",
    cancelled: false,
    deletedAt: "2026-10-15T10:00:00Z",
    deletedReason: "Xóa nhầm trong V9",
    items: [
      {
        sku: "V9-TEST",
        color: "Trắng",
        size: "S",
        qty: 1000,
        received: 750,
        priority: "THƯỜNG",
      },
    ],
    receipts: [
      {
        date: "2026-10-14",
        note: "Đợt 1",
        lines: [{ sku: "V9-TEST", color: "Trắng", size: "S", qty: 300 }],
      },
      {
        date: "2026-10-15",
        note: "Đợt 2",
        lines: [{ sku: "V9-TEST", color: "Trắng", size: "S", qty: 450 }],
      },
    ],
    editLog: [
      {
        at: "2026-10-14T09:00:00Z",
        by: "Người sửa cũ",
        reason: "Điều chỉnh trước nhập",
        before: { qty: 900 },
        after: { qty: 1000 },
      },
    ],
  };
  const p = await tx((db) =>
    previewV9(db, actor, {
      filename: "synthetic-v9.json",
      data: { rows: [], orders: [], deletedHistory: [legacy] },
    }),
  );
  expect(p.errors).toEqual([]);
  await tx((db) => confirmV9(db, actor, p.id));
  const r = (await pool.query("SELECT id FROM production_orders")).rows[0];
  const o = await loadOrder(pool, r.id);
  expect(totals(o)).toMatchObject({
    placed: 1000,
    received: 750,
    pending: 250,
  });
  expect(o.deletedAt).toBeTruthy();
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    2,
  );
  const saved = (
    await pool.query(
      "SELECT details FROM activity_logs WHERE action='v9.order.source'",
    )
  ).rows[0].details;
  expect(saved.legacy.editLog).toEqual(legacy.editLog);
});
it("V9 bản nháp có lượng được nhập với metadata gốc, không tự gửi", async () => {
  const p = await tx((db) =>
    previewV9(db, actor, {
      filename: "synthetic-draft.json",
      data: {
        rows: [],
        orders: [
          {
            sku: "V9-DRAFT",
            color: "Cam",
            size: "M",
            qty: 8,
            priority: "ƯU TIÊN",
          },
        ],
        meta: {
          orderId: "V9-DRAFT-CODE",
          orderTime: "2026-10-14T10:30",
          orderSupplier: "Xưởng thử",
          requestedBy: "Người đặt cũ",
          orderStatus: "Nháp",
        },
      },
    }),
  );
  expect(p.errors).toEqual([]);
  await tx((db) => confirmV9(db, actor, p.id));
  const id = (await pool.query("SELECT id FROM production_orders")).rows[0].id;
  expect(await loadOrder(pool, id)).toMatchObject({
    code: "V9-DRAFT-CODE",
    status: "Nháp",
    items: [{ qty: 8, received: 0 }],
  });
});
it("thay thế kỳ giữ lịch sử nguồn và không cộng chồng số bán", async () => {
  const p = await tx((db) => previewSales(db, actor, upload()));
  await tx((db) => confirmSales(db, actor, p.id));
  const next = upload();
  next.base64 = Buffer.from(
    Buffer.from(next.base64, "base64").toString().replace(",20,", ",40,"),
  ).toString("base64");
  const p2 = await tx((db) => previewSales(db, actor, next));
  await tx((db) => confirmSales(db, actor, p2.id));
  expect((await salesReport(pool)).variants[0].qty).toBe(90);
  expect(
    (await pool.query("SELECT * FROM daily_sales WHERE NOT active")).rowCount,
  ).toBe(2);
  expect((await pool.query("SELECT * FROM sales_imports")).rowCount).toBe(2);
});
it("V9 từ chối biên nhận không khớp trước khi ghi bất kỳ lệnh nào", async () => {
  const p = await tx((db) =>
    previewV9(db, actor, {
      filename: "bad-synthetic.json",
      data: {
        rows: [],
        orders: [],
        history: [
          {
            id: "BAD-RECEIPT",
            time: "2026-10-14T10:00",
            items: [
              { sku: "V9", color: "Cam", size: "S", qty: 10, received: 7 },
            ],
            receipts: [
              {
                date: "2026-10-14",
                lines: [{ sku: "V9", color: "Cam", size: "S", qty: 6 }],
              },
            ],
          },
        ],
      },
    }),
  );
  expect(p.errors.length).toBeGreaterThan(0);
  await expect(tx((db) => confirmV9(db, actor, p.id))).rejects.toThrow();
  expect((await pool.query("SELECT * FROM production_orders")).rowCount).toBe(
    0,
  );
});
it("xuất XLSX lệnh là ma trận size, không phải HTML đổi đuôi", async () => {
  const o = await order(60);
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(
      `${base}/api/export/orders?id=${o.id}&format=xlsx`,
      { headers: { Cookie: cookie } },
    );
    expect(response.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
    const header = wb.worksheets[0].getRow(1).values;
    expect(header).not.toContain("XS");
    expect(header).toContain("S");
    expect(header).not.toContain("2XL");
    expect(header).toContain("XL");
    expect(wb.worksheets[0].getRow(2).values).toContain(60);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

// Regressions from the V9 action audit: empty catalogue and filtered sales transfer.
function composeDraft(code?: string) {
  const newSkus = ["Cam", "Trắng"].flatMap((color) =>
    ["S", "M", "L"].map((size) => ({
      id: randomUUID(),
      sku: "TEST-COMPOSE",
      color,
      size,
    })),
  );
  return {
    order: {
      code,
      time: "2026-10-17T10:00:00+07:00",
      supplier: "SYNTHETIC Xưởng",
      delivery: null,
      requestedBy: actor.name,
      notes: "SYNTHETIC ONLY",
      status: "Nháp",
      items: newSkus.map((s) => ({
        variantId: s.id,
        qty: 10,
        priority: "THƯỜNG",
      })),
    },
    newSkus,
  };
}
const compose = async (raw: unknown, id?: string) => {
  const { composeOrder } = await import("../server/order-composer");
  return tx((db) => composeOrder(db, actor, raw, id));
};
describe("V9 thao tác lập lệnh và lọc bán hàng", () => {
  it("danh mục trống: thêm ngay nhiều màu/size, tồn chưa biết, không giả định đã gửi", async () => {
    const o = await compose(composeDraft());
    expect(o.items).toHaveLength(6);
    expect(totals(o)).toMatchObject({
      placed: 60,
      received: 0,
      pending: 60,
      status: "Nháp",
    });
    expect(
      (await variants()).every(
        (s) => s.stock === null && s.health === "Mở bán",
      ),
    ).toBe(true);
  });
  it("tái sử dụng SKU khác hoa/thường và giữ số bán/tồn/vòng đời", async () => {
    const id = await tx((db) =>
      saveSku(db, actor, {
        sku: "TEST-COMPOSE",
        color: "CAM",
        size: "S",
        stock: 35,
        inbound: 12,
        health: "Tăng trưởng",
        day1: 20,
      }),
    );
    const o = await compose(composeDraft());
    expect(o.items.some((i) => i.variantId === id)).toBe(true);
    expect(await variants()).toHaveLength(6);
    expect((await variants()).find((v) => v.id === id)).toMatchObject({
      stock: 35,
      inbound: 12,
      day1: 20,
      health: "Tăng trưởng",
    });
  });
  it("lỗi mã trùng rollback cả SKU nháp và audit", async () => {
    await compose(composeDraft("SYNTHETIC-CODE"));
    const d = composeDraft("SYNTHETIC-CODE");
    d.newSkus.forEach((s) => (s.sku = "TEST-ROLLBACK"));
    const before = (
      await pool.query("SELECT count(*)::int AS n FROM activity_logs")
    ).rows;
    await expect(compose(d)).rejects.toBeTruthy();
    expect((await variants()).some((s) => s.sku === "TEST-ROLLBACK")).toBe(
      false,
    );
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM activity_logs")).rows,
    ).toEqual(before);
  });
  it("chặn trùng mã–màu–size sau ánh xạ ID nháp, không để danh mục tạo dở", async () => {
    const d = composeDraft();
    d.newSkus[1] = { ...d.newSkus[0], id: d.newSkus[1].id };
    await expect(compose(d)).rejects.toThrow("trùng");
    expect(await variants()).toHaveLength(0);
  });
  it("chặn giả mạo danh mục đã lưu và SKU nháp không thuộc lệnh", async () => {
    const o = await compose(composeDraft());
    const d = composeDraft();
    d.newSkus[0].id = o.items[0].variantId as ReturnType<typeof randomUUID>;
    d.order.items[0].variantId = o.items[0].variantId as ReturnType<
      typeof randomUUID
    >;
    await expect(compose(d)).rejects.toThrow("định danh SKU");
    const unused = composeDraft();
    unused.newSkus.push({
      id: randomUUID(),
      sku: "TEST-UNUSED",
      color: "Cam",
      size: "XL",
    });
    await expect(compose(unused)).rejects.toThrow("không có trong lệnh");
  });
  it("sửa sau nhận một phần: thêm mã/màu mới, giữ biên nhận và ghi lý do", async () => {
    let o = await compose(composeDraft());
    const line = o.items[0];
    await receipt(o, 3);
    o = await loadOrder(pool, o.id);
    const v = { id: randomUUID(), sku: "TEST-NEW", color: "Đen", size: "XL" };
    const changed = await compose(
      {
        order: {
          ...input(o),
          items: [
            ...input(o).items,
            { variantId: v.id, qty: 7, priority: "CẤP BÁCH" },
          ],
        },
        newSkus: [v],
        expectedVersion: o.version,
        reason: "SYNTHETIC thêm dòng",
      },
      o.id,
    );
    expect(changed.items.find((i) => i.id === line.id)?.received).toBe(3);
    expect(changed.items).toHaveLength(7);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM production_receipts"))
        .rows[0].n,
    ).toBe(1);
    expect(
      (await pool.query("SELECT reason FROM production_order_revisions"))
        .rows[0].reason,
    ).toBe("SYNTHETIC thêm dòng");
    const invalid = input(changed);
    invalid.items = invalid.items.filter((i: any) => i.id !== line.id);
    await expect(
      compose(
        {
          order: invalid,
          newSkus: [],
          expectedVersion: changed.version,
          reason: "SYNTHETIC xóa sai",
        },
        o.id,
      ),
    ).rejects.toThrow("xóa dòng đã nhận");
  });
  it("lệnh hủy phải khôi phục trước khi thêm SKU; lỗi không tạo danh mục dở", async () => {
    let o = await compose(composeDraft());
    await tx((db) =>
      orderAction(db, actor, o.id, "cancel", {
        expectedVersion: o.version,
        reason: "SYNTHETIC hủy",
      }),
    );
    o = await loadOrder(pool, o.id);
    const v = {
      id: randomUUID(),
      sku: "TEST-REOPEN",
      color: "Đen",
      size: "XL",
    };
    const raw = {
      order: {
        ...input(o),
        items: [
          ...input(o).items,
          { variantId: v.id, qty: 7, priority: "THƯỜNG" },
        ],
      },
      newSkus: [v],
      expectedVersion: o.version,
      reason: "SYNTHETIC sửa hủy",
    };
    await expect(compose(raw, o.id)).rejects.toThrow("khôi phục");
    expect((await variants()).some((s) => s.sku === v.sku)).toBe(false);
    expect((await compose({ ...raw, reopen: true }, o.id)).cancelled).toBe(
      false,
    );
  });
  it("hai người sửa cùng phiên bản chỉ một người thành công", async () => {
    const o = await compose(composeDraft());
    const raw = {
      order: input(o),
      newSkus: [],
      expectedVersion: o.version,
      reason: "SYNTHETIC đồng thời",
    };
    const results = await Promise.allSettled([
      compose(raw, o.id),
      compose(raw, o.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("sync chỉ SKU đang chọn, giữ các SKU khác và tồn/vòng đời/test hiện có", async () => {
    const csv =
      'Order ID,Order Line ID,Order Status,Product Name,Variation,Quantity,Created Time\nSYNTHETIC-A,LA,Completed,Áo MIU66,"Trắng phối đen, M",10,2026-10-14 10:00:00\nSYNTHETIC-B,LB,Completed,Áo MIU37,"Đen, S",12,2026-10-14 10:00:00';
    const p = await tx((db) => previewSales(db, actor, upload("replace", csv)));
    expect(p.errors).toEqual([]);
    await tx((db) => confirmSales(db, actor, p.id));
    const report = await salesReport(pool);
    expect(report.variants).toHaveLength(2);
    const selected = report.variants.find((r) => r.sku === "MIU66")!;
    const id = await tx((db) =>
      saveSku(db, actor, {
        sku: selected.sku,
        color: selected.color.toUpperCase(),
        size: selected.size,
        stock: 35,
        inbound: 12,
        health: "Mở bán",
        pilotQty: 7,
      }),
    );
    expect(await tx((db) => syncSales(db, actor, "7", [selected]))).toEqual({
      count: 1,
    });
    expect(await variants()).toHaveLength(1);
    expect((await variants())[0]).toMatchObject({
      id,
      stock: 35,
      inbound: 12,
      health: "Mở bán",
      pilotQty: 7,
      abnormal: true,
    });
    await expect(tx((db) => syncSales(db, actor, "2", []))).rejects.toThrow(
      "Chọn SKU",
    );
    await expect(
      tx((db) =>
        syncSales(db, actor, "2", [
          { sku: "UNKNOWN", color: "Cam", size: "M" },
        ]),
      ),
    ).rejects.toThrow("Chọn SKU");
  });
});

it("API compose giữ RBAC/CSRF, export lệnh theo bộ lọc và lỗi không làm lộ dữ liệu", async () => {
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const origin = process.env.PUBLIC_URL!;
  try {
    expect(
      (
        await fetch(base + "/api/orders/compose", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(composeDraft()),
        })
      ).status,
    ).toBe(401);
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: origin },
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie: cookie } })
    ).json();
    const post = (
      path: string,
      raw: unknown,
      csrf = me.csrf,
      method = "POST",
    ) =>
      fetch(base + path, {
        method,
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(raw),
      });
    expect(
      (await post("/api/orders/compose", composeDraft(), "bad-csrf")).status,
    ).toBe(403);
    const created = await post(
      "/api/orders/compose",
      composeDraft("SYNTHETIC-HTTP-ONE"),
    );
    expect(created.status).toBe(201);
    const o = await created.json();
    expect(
      (
        await post(
          `/api/orders/${o.id}/compose`,
          {
            order: input(o),
            newSkus: [],
            expectedVersion: o.version,
            reason: "SYNTHETIC API edit",
          },
          me.csrf,
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (await post("/api/orders/compose", composeDraft("SYNTHETIC-HTTP-TWO")))
        .status,
    ).toBe(201);
    const csv = await (
      await fetch(base + "/api/export/orders?search=SYNTHETIC-HTTP-ONE", {
        headers: { Cookie: cookie },
      })
    ).text();
    expect(csv).toContain("SYNTHETIC-HTTP-ONE");
    expect(csv).not.toContain("SYNTHETIC-HTTP-TWO");
    const done = await (
      await fetch(base + "/api/export/orders?filter=done", {
        headers: { Cookie: cookie },
      })
    ).text();
    expect(done).not.toContain("SYNTHETIC-HTTP-ONE");
    for (const role of ["Viewer", "Warehouse Operator", "Manager"]) {
      await pool.query("UPDATE users SET role=$1 WHERE id=$2", [
        role,
        me.user.id,
      ]);
      expect((await post("/api/orders/compose", composeDraft())).status).toBe(
        403,
      );
      expect(
        (await post(`/api/orders/${o.id}/compose`, {}, me.csrf, "PUT")).status,
      ).toBe(403);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

it("hai người tạo lệnh mới cùng danh mục: không trùng SKU và không trùng mã tự sinh", async () => {
  const [a, b] = await Promise.all([
    compose(composeDraft()),
    compose(composeDraft()),
  ]);
  expect(a.code).not.toBe(b.code);
  expect(await variants()).toHaveLength(6);
  expect(new Set([...a.items, ...b.items].map((i) => i.variantId)).size).toBe(
    6,
  );
});

it("CSV bán hàng theo mã/kỳ giữ công thức, combo có phân loại, chặn khoảng ngày ngược", async () => {
  const p = await tx((db) =>
    previewSales(
      db,
      actor,
      upload(
        "replace",
        'Order ID,Order Line ID,Order Status,Product Name,Variation,Quantity,Created Time\nSYNTHETIC-X,EX,Completed,Áo MIU66,"Trắng phối đen, M",10,2026-10-14 10:00:00\nSYNTHETIC-Y,EY,Completed,Áo MIU37,"Đen, S",12,2026-10-14 10:00:00\nSYNTHETIC-Z,EZ,Completed,Áo MIU66,"COMBO 2 ÁO, M",3,2026-10-14 10:00:00',
      ),
    ),
  );
  await tx((db) => confirmSales(db, actor, p.id));
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const headers = { Cookie: login.headers.get("set-cookie")!.split(";")[0] };
    const csv = await (
      await fetch(
        base + "/api/export/sales?sku=MIU66&from=2026-10-14&to=2026-10-14",
        { headers },
      )
    ).text();
    expect(csv).toContain("MIU66");
    expect(csv).not.toContain("MIU37");
    expect(csv).toContain("TB/ngày 2 ngày");
    const combo = await (
      await fetch(base + "/api/export/combos?sku=MIU66", { headers })
    ).text();
    expect(combo).toContain("COMBO 2 ÁO");
    const empty = await (
      await fetch(base + "/api/export/sales?from=2026-10-15&to=2026-10-15", {
        headers,
      })
    ).text();
    expect(empty).not.toContain("MIU66");
    expect(
      (
        await fetch(base + "/api/export/sales?from=2026-10-15&to=2026-10-14", {
          headers,
        })
      ).status,
    ).toBe(400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

it("Excel mẫu dạng row phân mảnh: inspect không ghi, preview/confirm tạo đúng ma trận và giữ ngày chưa trọn", async () => {
  const { fragmentedWorkbook } = await import("./fixtures/tiktok-fragments");
  const { inspectSales } = await import("../server/imports");
  const bytes = await fragmentedWorkbook();
  const inspection = await inspectSales(
    "Tất cả đơn hàng-2026-10-15-10_41 (1).xlsx",
    bytes,
  );
  expect(inspection).toMatchObject({
    periodStart: "2026-10-14",
    periodEnd: "2026-10-15",
    dataRows: 4,
    stableKeys: true,
  });
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM import_previews")).rows[0]
      .n,
  ).toBe(0);
  const p = await tx((db) =>
    previewSales(db, actor, {
      filename: "synthetic-fragmented.xlsx",
      base64: bytes.toString("base64"),
      periodStart: inspection.periodStart,
      periodEnd: inspection.periodEnd,
      exportedAt: inspection.exportedAt,
      mode: "replace",
    }),
  );
  expect(p.errors).toEqual([]);
  expect(p.summary).toEqual({ single: 30, excluded: 5, combo: 3 });
  expect(p.variants).toHaveLength(2);
  expect(p.variants.reduce((n, r) => n + r.qty, 0)).toBe(30);
  await tx((db) => confirmSales(db, actor, p.id));
  const report = await salesReport(pool);
  expect(report.lastFullDay).toBe("2026-10-14");
  expect(report.variants.reduce((n, r) => n + r.qty, 0)).toBe(30);
  expect(report.variants.reduce((n, r) => n + r.q2, 0)).toBe(10);
});
it("chọn kỳ con từ file: xem trước chỉ nhận dòng trong kỳ, cảnh báo dòng ngoài kỳ, không báo mất dữ liệu", async () => {
  const { fragmentedWorkbook } = await import("./fixtures/tiktok-fragments");
  const bytes = await fragmentedWorkbook();
  const p = await tx((db) =>
    previewSales(db, actor, {
      filename: "synthetic.xlsx",
      base64: bytes.toString("base64"),
      periodStart: "2026-10-15",
      periodEnd: "2026-10-15",
      exportedAt: "2026-10-15T10:41:00+07:00",
      mode: "replace",
    }),
  );
  expect(p.errors).toEqual([]);
  expect(p.outOfPeriod).toBe(1);
  expect(p.warnings.some((w) => w.includes("ngoài kỳ"))).toBe(true);
  expect(p.summary.single).toBe(20);
});
it("import lô lớn và phát lại vẫn đủ số lượng, không nhân đôi; ma trận export khớp tổng", async () => {
  const { fragmentedWorkbook } = await import("./fixtures/tiktok-fragments");
  const synthetic = Array.from({ length: 1200 }, (_, i) => [
    `SYNTHETIC-BULK-${i}`,
    "Completed",
    "",
    `SKU-${i}`,
    "MIU66",
    "Áo MIU66",
    i % 2 ? "Trắng phối đen, M" : "Trắng phối đen, L",
    "2",
    "0",
    "14/10/2026 10:00:00",
  ]);
  const bytes = await fragmentedWorkbook({ rows: synthetic });
  const p = await tx((db) =>
    previewSales(db, actor, {
      filename: "synthetic-bulk.xlsx",
      base64: bytes.toString("base64"),
      periodStart: "2026-10-14",
      periodEnd: "2026-10-14",
      exportedAt: "2026-10-15T10:41:00+07:00",
      mode: "replace",
    }),
  );
  expect(p.errors).toEqual([]);
  await tx((db) => confirmSales(db, actor, p.id));
  await tx((db) => confirmSales(db, actor, p.id));
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM daily_sales WHERE active",
      )
    ).rows[0].n,
  ).toBe(1200);
  const r = await salesReport(pool);
  expect(r.variants.reduce((n, v) => n + v.qty, 0)).toBe(2400);
});
it("endpoint inspect có xác thực/quyền/CSRF và không tạo import preview", async () => {
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const raw = upload();
  const { filename, base64 } = raw;
  try {
    const post = (body: any, headers: any = {}) =>
      fetch(base + "/api/imports/sales/inspect", {
        method: "POST",
        headers: {
          Origin: process.env.PUBLIC_URL!,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    expect((await post({ filename, base64 })).status).toBe(401);
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const Cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie } })
    ).json();
    expect((await post({ filename, base64 }, { Cookie })).status).toBe(403);
    expect(
      (await post({ filename, base64 }, { Cookie, "X-CSRF-Token": me.csrf }))
        .status,
    ).toBe(200);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM import_previews"))
        .rows[0].n,
    ).toBe(0);
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (await post({ filename, base64 }, { Cookie, "X-CSRF-Token": me.csrf }))
        .status,
    ).toBe(403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

it("export ma trận có đủ size/tổng màu; đối soát xuất đúng nhóm và không lẫn bán lẻ", async () => {
  const { fragmentedWorkbook } = await import("./fixtures/tiktok-fragments");
  const bytes = await fragmentedWorkbook();
  const p = await tx((db) =>
    previewSales(db, actor, {
      filename: "synthetic.xlsx",
      base64: bytes.toString("base64"),
      periodStart: "2026-10-14",
      periodEnd: "2026-10-15",
      exportedAt: "2026-10-15T10:41:00+07:00",
      mode: "replace",
    }),
  );
  await tx((db) => confirmSales(db, actor, p.id));
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const headers = { Cookie: login.headers.get("set-cookie")!.split(";")[0] };
    const response = await fetch(
      base + "/api/export/sales?layout=matrix&format=xlsx",
      { headers },
    );
    expect(response.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
    expect(wb.worksheets[0].getRow(1).values).toEqual(
      expect.arrayContaining(["S", "M", "L", "XL", "Tổng màu"]),
    );
    expect(wb.worksheets[0].getRow(2).getCell(4).value).toBe(10);
    expect(wb.worksheets[0].getRow(2).getCell(5).value).toBe(20);
    expect(wb.worksheets[0].getRow(2).getCell(7).value).toBe(30);
    const excluded = await (
      await fetch(base + "/api/export/reconciliation?bucket=excluded", {
        headers,
      })
    ).text();
    expect(excluded).toContain("excluded");
    expect(excluded).toContain("Đã hủy");
    expect(excluded).not.toContain("COMBO 2 ÁO");
    const combo = await (
      await fetch(base + "/api/export/reconciliation?bucket=combo", { headers })
    ).text();
    expect(combo).toContain("COMBO 2 ÁO");
    expect(combo).not.toContain("Đã hủy");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

it("ngày bán không lệch khi server chạy múi giờ Việt Nam; nhập bổ sung vẫn chống trùng", async () => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Ho_Chi_Minh";
  try {
    const p = await tx((db) => previewSales(db, actor, upload()));
    await tx((db) => confirmSales(db, actor, p.id));
    const report = await salesReport(pool);
    expect(report.lastDate).toBe("2026-10-15");
    expect(report.lastFullDay).toBe("2026-10-14");
    expect(report.variants[0].q2).toBe(20);
    const append = await tx((db) => previewSales(db, actor, upload("append")));
    expect(await tx((db) => confirmSales(db, actor, append.id))).toMatchObject({
      skipped: 2,
    });
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
