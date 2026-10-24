import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  sizes,
  skuSchema,
  historicalSkuSchema,
  forecast,
} from "../shared/domain";
import { pool, transaction } from "../server/db";
import { migrate } from "../server/migrate";
import {
  saveSku,
  variants,
  createOrder,
  editOrder,
  loadOrder,
  receive,
} from "../server/service";
import { productionReport } from "../shared/production-report";
import { pendingProduction } from "../shared/pending-production";
import { parseSalesRow } from "../shared/sales";
import {
  inventorySourceSchema,
  normalizeInventory,
} from "../shared/lark-inventory";
import { previewInbound } from "../server/inbound";
import { legacySku } from "../server/imports";
const actor = {
  id: randomUUID(),
  name: "Synthetic size policy",
  role: "Administrator",
};
const tx = transaction;
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','synthetic-size-policy',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
async function historicalFixture() {
  // Simulate records that existed before policy enforcement in the isolated _test
  // database. Re-enable both guards in this transaction before testing any writes.
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Unsafe fixture database");
  return tx(async (db) => {
    const active = await saveSku(db, actor, {
      sku: "SYNTHETIC-SIZES",
      color: "Cam",
      size: "M",
      stock: 10,
    });
    const product = (
      await db.query("SELECT product_id FROM variants WHERE id=$1", [active])
    ).rows[0].product_id;
    await db.query("ALTER TABLE variants DISABLE TRIGGER active_variant_size");
    await db.query(
      "ALTER TABLE production_order_items DISABLE TRIGGER active_order_item_size",
    );
    const oldIds = [];
    for (const size of ["XS", "2XL"]) {
      const id = randomUUID();
      oldIds.push(id);
      const body = historicalSkuSchema.parse({
        sku: "SYNTHETIC-SIZES",
        color: "Cam",
        size,
        stock: 99,
      });
      await db.query(
        "INSERT INTO variants(id,product_id,color_key,size,body) VALUES($1,$2,'cam',$3,$4)",
        [id, product, size, JSON.stringify(body)],
      );
    }
    const id = randomUUID(),
      time = "2026-10-20T10:00:00+07:00";
    await db.query(
      "INSERT INTO production_orders(id,code,body) VALUES($1,'LSX-SYNTHETIC-LEGACY',$2)",
      [
        id,
        JSON.stringify({
          time,
          supplier: "Synthetic factory",
          delivery: "2026-10-28",
          requestedBy: actor.name,
          notes: "Legacy contract",
          status: "Đã xác nhận",
          cancelled: false,
          deletedAt: null,
          createdBy: actor.id,
          createdAt: time,
          updatedAt: time,
        }),
      ],
    );
    for (const variantId of [active, ...oldIds])
      await db.query(
        "INSERT INTO production_order_items(id,order_id,variant_id,qty,priority) VALUES($1,$2,$3,20,'THƯỜNG')",
        [randomUUID(), id, variantId],
      );
    await db.query("ALTER TABLE variants ENABLE TRIGGER active_variant_size");
    await db.query(
      "ALTER TABLE production_order_items ENABLE TRIGGER active_order_item_size",
    );
    return { active, oldIds, order: await loadOrder(db, id) };
  });
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
it("active contract only S/M/L/XL; no forecast for retired historical data", () => {
  expect(sizes).toEqual(["S", "M", "L", "XL"]);
  for (const size of ["XS", "2XL", "XXL"])
    expect(skuSchema.safeParse({ sku: "A", color: "Cam", size }).success).toBe(
      false,
    );
  expect(
    forecast(
      historicalSkuSchema.parse({
        sku: "A",
        color: "Cam",
        size: "XS",
        health: "Tăng trưởng",
        day1: 100,
        day2: 100,
        stock: 0,
      }),
    ).need,
  ).toBe(0);
  expect(
    forecast(
      skuSchema.parse({
        sku: "A",
        color: "Cam",
        size: "M",
        health: "Tăng trưởng",
        day1: 20,
        day2: 20,
        stock: 30,
        inbound: 10,
      }),
    ).need,
  ).toBe(60);
});
it("API/service and DB reject new retired catalogue rows", async () => {
  for (const size of ["XS", "2XL"])
    await expect(
      tx((db) => saveSku(db, actor, { sku: "BAD", color: "Cam", size })),
    ).rejects.toThrow();
  const f = await historicalFixture();
  const pid = (
    await pool.query("SELECT product_id FROM variants WHERE id=$1", [f.active])
  ).rows[0].product_id;
  await expect(
    pool.query(
      "INSERT INTO variants(id,product_id,color_key,size,body) VALUES($1,$2,'den','XS','{}')",
      [randomUUID(), pid],
    ),
  ).rejects.toThrow("ngung");
  expect((await variants()).map((v) => v.size)).toEqual(["M"]);
  expect((await pool.query("SELECT * FROM variants")).rowCount).toBe(3);
});
it("new orders cannot reference retired IDs, DB prevents new/increased production", async () => {
  const f = await historicalFixture();
  await expect(
    tx((db) =>
      createOrder(db, actor, {
        ...input(f.order),
        code: undefined,
        items: [{ variantId: f.oldIds[0], qty: 10, priority: "THƯỜNG" }],
      }),
    ),
  ).rejects.toThrow("S, M, L, XL");
  await expect(
    pool.query(
      "INSERT INTO production_order_items(id,order_id,variant_id,qty,priority) VALUES($1,$2,$3,10,'THƯỜNG')",
      [randomUUID(), f.order.id, f.oldIds[0]],
    ),
  ).rejects.toThrow("ngung");
  await expect(
    pool.query(
      "UPDATE production_order_items SET qty=qty+1 WHERE variant_id=$1",
      [f.oldIds[0]],
    ),
  ).rejects.toThrow("ngung");
  await expect(
    tx((db) => previewInbound(db, actor, { ids: [f.oldIds[0]] })),
  ).rejects.toThrow("S, M, L, XL");
});
it("metadata edits preserve every legacy item ID and quantities; no increase or silent deletion", async () => {
  const f = await historicalFixture();
  const changed = await tx((db) =>
    editOrder(db, actor, f.order.id, {
      expectedVersion: f.order.version,
      reason: "Synthetic metadata correction",
      order: { ...input(f.order), notes: "Corrected note" },
    }),
  );
  expect(changed.items).toEqual(f.order.items);
  const altered = input(changed);
  altered.items.find((i: any) => i.variantId === f.oldIds[0]).qty++;
  await expect(
    tx((db) =>
      editOrder(db, actor, changed.id, {
        expectedVersion: changed.version,
        reason: "Synthetic forbidden",
        order: altered,
      }),
    ),
  ).rejects.toThrow("giữ nguyên");
  await expect(
    tx((db) =>
      editOrder(db, actor, changed.id, {
        expectedVersion: changed.version,
        reason: "Synthetic forbidden",
        order: {
          ...input(changed),
          items: input(changed).items.filter(
            (i: any) => i.variantId !== f.oldIds[0],
          ),
        },
      }),
    ),
  ).rejects.toThrow("giữ nguyên");
});
it("historical receipts can be settled without creating production; audit and contract remain readable", async () => {
  const f = await historicalFixture(),
    old = f.order.items.find((i) => i.variantId === f.oldIds[0])!;
  await tx((db) =>
    receive(db, actor, f.order.id, randomUUID(), {
      expectedVersion: f.order.version,
      date: "2026-10-24",
      note: "Historical settlement",
      lines: [{ itemId: old.id, qty: 5 }],
    }),
  );
  const after = await loadOrder(pool, f.order.id);
  expect(after.items.find((i) => i.id === old.id)).toMatchObject({
    size: "XS",
    qty: 20,
    received: 5,
  });
  const edited = await tx((db) =>
    editOrder(db, actor, after.id, {
      expectedVersion: after.version,
      reason: "Historical note",
      order: { ...input(after), notes: "Keep receipt" },
    }),
  );
  expect(edited.items).toEqual(after.items);
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    1,
  );
});
it("operational pending/report matrices exclude retired balances, preserving historical source totals", async () => {
  const f = await historicalFixture(),
    r = productionReport([f.order]),
    p = pendingProduction([f.order]);
  expect(r.totals.pending).toBe(20);
  const onlyHistoricalPending = {
    ...f.order,
    items: f.order.items.map((i) =>
      i.variantId === f.active ? { ...i, received: i.qty } : i,
    ),
  };
  expect(productionReport([onlyHistoricalPending]).products).toHaveLength(0);
  expect(p.total).toBe(20);
  expect(Object.keys(p.sizeTotals)).toEqual(["S", "M", "L", "XL"]);
  expect(r.products[0].sources[0].shareInOrder).toBeCloseTo(100 / 3);
  expect((await loadOrder(pool, f.order.id)).items).toHaveLength(3);
});
it("sales correctly identify retired aliases for exclusion, never turn XS into S or XXL into XL", () => {
  for (const size of ["XS", "2XL", "XXL"]) {
    const r = parseSalesRow(
      {
        "Order Status": "Completed",
        "Created Time": "2026-10-20 10:00:00",
        "Product Name": "Áo MIU66",
        Variation: "Đen, " + size,
        Quantity: "10",
      },
      "test",
    );
    expect(r.kind).toBe("excluded");
    expect(r.reason).toContain("ngừng");
  }
  expect(
    parseSalesRow(
      {
        "Order Status": "Completed",
        "Created Time": "2026-10-20 10:00:00",
        "Product Name": "Áo MIU66",
        Variation: "Đen, XL",
        Quantity: "10",
      },
      "test",
    ).kind,
  ).toBe("single");
  expect(() => legacySku({ sku: "OLD", color: "Cam", size: "XS" })).toThrow(
    "ngừng",
  );
});
it("Lark mapping has only active columns and refuses remapping a retired column as XL", () => {
  const config = {
    url: "https://synthetic.larksuite.com/base/SyntheticBase123?table=tblSynthetic&view=vewSynthetic",
    mapping: {
      sku: "Mã",
      color: "Màu",
      date: "Ngày",
      sizes: { S: "S", M: "M", L: "L", XL: "XL" },
    },
    blankAsZero: true,
    createMissing: false,
  };
  const source = inventorySourceSchema.parse(config);
  const rows = normalizeInventory(
    [
      {
        record_id: "synthetic",
        fields: {
          Mã: "A",
          Màu: "Cam",
          Ngày: "2026-10-20",
          S: 1,
          M: 2,
          L: 3,
          XL: 4,
          XS: 999,
          XXL: 888,
        },
      },
    ],
    source,
  );
  expect(rows.rows.map((r) => r.size)).toEqual(["S", "M", "L", "XL"]);
  expect(rows.rows.reduce((n, r) => n + r.stock, 0)).toBe(10);
  expect(
    inventorySourceSchema.safeParse({
      ...config,
      mapping: {
        ...config.mapping,
        sizes: { ...config.mapping.sizes, XS: "XS" },
      },
    }).success,
  ).toBe(false);
  expect(
    inventorySourceSchema.safeParse({
      ...config,
      mapping: {
        ...config.mapping,
        sizes: { ...config.mapping.sizes, XL: "# XXL" },
      },
    }).success,
  ).toBe(false);
});
it("migration prunes only retired Lark mapping keys and increments source version", async () => {
  const body = {
    url: "https://synthetic.larksuite.com/base/SyntheticBase123?table=tblSynthetic&view=vewSynthetic",
    mapping: {
      sku: "Mã",
      color: "Màu",
      date: "Ngày",
      sizes: { XS: "XS", S: "S", M: "M", L: "L", XL: "XL", "2XL": "XXL" },
    },
    blankAsZero: true,
  };
  await pool.query(
    "INSERT INTO lark_inventory_sources(id,body,version,updated_by) VALUES(1,$1,3,$2)",
    [JSON.stringify(body), actor.id],
  );
  const sql = await readFile(
    new URL("../migrations/007_retire_sizes.sql", import.meta.url),
    "utf8",
  );
  await pool.query(sql.slice(sql.lastIndexOf("UPDATE lark_inventory_sources")));
  const source = (
    await pool.query("SELECT body,version FROM lark_inventory_sources")
  ).rows[0];
  expect(source.body.mapping.sizes).toEqual({
    S: "S",
    M: "M",
    L: "L",
    XL: "XL",
  });
  expect(source.version).toBe(4);
  expect(source.body.mapping.sku).toBe("Mã");
});
