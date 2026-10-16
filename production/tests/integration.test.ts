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
    ).toBe(5);
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
  it("chặn nhận vượt còn chờ và rollback không tạo biên nhận", async () => {
    const o = await order(10);
    await expect(receipt(o, 11)).rejects.toThrow("vượt");
    expect(
      (await pool.query("SELECT * FROM production_receipts")).rowCount,
    ).toBe(0);
    expect((await loadOrder(pool, o.id)).items[0].received).toBe(0);
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
    expect(header).toContain("XS");
    expect(header).toContain("2XL");
    expect(wb.worksheets[0].getRow(2).values).toContain(60);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});
