import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  inventorySourceSchema,
  parseBaseUrl,
  normalizeInventory,
  type InventorySource,
} from "../shared/lark-inventory";
import {
  inventoryFields,
  readInventory,
  saveInventorySource,
  inventorySource,
  previewInventory,
  confirmInventory,
} from "../server/lark-inventory";
import { pool, transaction } from "../server/db";
import { migrate } from "../server/migrate";
import { saveSku, variants } from "../server/service";
import { skuSchema } from "../shared/domain";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  name: "Synthetic inventory admin",
  role: "Administrator",
};
const source: InventorySource = inventorySourceSchema.parse({
  url: "https://synthetic.larksuite.com/wiki/SyntheticNode123?table=tblSynthetic&view=vewSynthetic",
  mapping: {
    sku: "Mã sản phẩm",
    color: "Màu",
    date: "Ngày kiểm",
    sizes: { S: "S", M: "M", L: "", XL: "XL" },
  },
  blankAsZero: true,
  createMissing: false,
});
const record = (
  id: string,
  date = "2026-10-16",
  extra: Record<string, unknown> = {},
) => ({
  record_id: id,
  fields: {
    "Mã sản phẩm": [{ text: "SYNTHETIC" }],
    Màu: "Cam",
    "Ngày kiểm": date,
    S: 11,
    M: 12,
    XL: null,
    ...extra,
  },
});
const tx = transaction;
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','synthetic-inventory',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
it("parses wiki/base identifiers; rejects arbitrary URLs and missing view", () => {
  expect(parseBaseUrl(source.url)).toMatchObject({
    kind: "wiki",
    token: "SyntheticNode123",
    tableId: "tblSynthetic",
    viewId: "vewSynthetic",
  });
  expect(parseBaseUrl(source.url.replace("/wiki/", "/base/")).kind).toBe(
    "base",
  );
  for (const url of [
    "https://evil.test/base/ABCDE?table=tblA&view=vewA",
    source.url.replace("https:", "http:"),
    source.url.replace("larksuite.com", "larksuite.com.evil.test"),
    source.url.replace("&view=vewSynthetic", ""),
    source.url.replace("https://", "https://user:pass@"),
  ])
    expect(() => parseBaseUrl(url)).toThrow();
});
it("takes latest date per product/colour, zeroes blank size, maps active XL only once", () => {
  const result = normalizeInventory(
    [record("old", "2026-10-14", { S: 999 }), record("new")],
    source,
  );
  expect(result.errors).toEqual([]);
  expect(result.rows.map((r) => [r.size, r.stock])).toEqual([
    ["S", 11],
    ["M", 12],
    ["XL", 0],
  ]);
  expect(result.warnings.join()).toContain("1 dòng ngày kiểm cũ");
});
it("handles Lark timestamps, rich text, single selection and formula numeric values", () => {
  const result = normalizeInventory(
    [
      record("r", "2026-10-16", {
        "Ngày kiểm": Date.parse("2026-10-16T00:00:00+07:00"),
        Màu: ["Cam"],
        M: { type: 2, value: [15] },
      }),
    ],
    source,
  );
  expect(result.errors).toEqual([]);
  expect(result.rows[1]).toMatchObject({
    date: "2026-10-16",
    color: "Cam",
    stock: 15,
  });
});
it("blocks duplicate newest rows even if their quantities match", () => {
  const result = normalizeInventory([record("a"), record("b")], source);
  expect(result.rows).toEqual([]);
  expect(result.errors.join()).toContain("trùng 2 dòng");
});
it("rejects negative, decimal, malformed formulas, bad dates and ambiguous colour", () => {
  for (const extra of [
    { M: -1 },
    { M: 1.5 },
    { M: { error: "bad" } },
    { "Ngày kiểm": "31/02/2026" },
    { "Ngày kiểm": "2026-99-99" },
    { Màu: ["Cam", "Đen"] },
  ])
    expect(
      normalizeInventory([record("bad", "2026-10-16", extra)], source).errors
        .length,
    ).toBeGreaterThan(0);
});
it("skip blank mode never converts blanks to zero; no implicit size column", () => {
  const result = normalizeInventory([record("r")], {
    ...source,
    blankAsZero: false,
  });
  expect(result.rows.map((r) => r.size)).toEqual(["S", "M"]);
});
it("validates mapping: repeated column or no size is rejected", () => {
  expect(
    inventorySourceSchema.safeParse({
      ...source,
      mapping: { ...source.mapping, color: source.mapping.sku },
    }).success,
  ).toBe(false);
  expect(
    inventorySourceSchema.safeParse({
      ...source,
      mapping: {
        ...source.mapping,
        sizes: { S: "", M: "", L: "", XL: "" },
      },
    }).success,
  ).toBe(false);
});
function client() {
  return {
    wiki: {
      space: {
        getNode: vi.fn().mockResolvedValue({
          code: 0,
          data: {
            node: { obj_type: "bitable", obj_token: "SyntheticBase123" },
          },
        }),
      },
    },
    bitable: {
      appTableField: {
        list: vi.fn().mockResolvedValue({
          code: 0,
          data: {
            items: ["Mã sản phẩm", "Màu", "Ngày kiểm", "S", "M", "XL"].map(
              (field_name) => ({ field_name, type: 1 }),
            ),
          },
        }),
      },
      appTableRecord: {
        search: vi
          .fn()
          .mockResolvedValueOnce({
            code: 0,
            data: {
              items: [record("a", "2026-10-14")],
              has_more: true,
              page_token: "page2",
            },
          })
          .mockResolvedValueOnce({
            code: 0,
            data: { items: [record("b")], has_more: false },
          }),
      },
    },
  };
}
it("resolves Wiki to Base then pages current search API within selected view and mapped fields only", async () => {
  const c = client();
  const result = await readInventory(source, c as any);
  expect(result.readRows).toBe(2);
  expect(result.errors).toEqual([]);
  expect(c.bitable.appTableRecord.search.mock.calls[0][0]).toMatchObject({
    path: { app_token: "SyntheticBase123", table_id: "tblSynthetic" },
    data: {
      view_id: "vewSynthetic",
      field_names: ["Mã sản phẩm", "Màu", "Ngày kiểm", "S", "M", "XL"],
    },
  });
  expect(
    c.bitable.appTableRecord.search.mock.calls[1][0].params.page_token,
  ).toBe("page2");
});
it("rejects non-Base Wiki node, Lark denial, bad paging, duplicate IDs and renamed fields", async () => {
  const nonbase = client();
  nonbase.wiki.space.getNode.mockResolvedValue({
    code: 0,
    data: { node: { obj_type: "docx", obj_token: "private" } },
  });
  await expect(inventoryFields(source.url, nonbase as any)).rejects.toThrow(
    "không trỏ tới",
  );
  const denied = client();
  denied.bitable.appTableField.list.mockResolvedValue({
    code: 999,
    msg: "secret response must not leak",
  } as any);
  await expect(inventoryFields(source.url, denied as any)).rejects.toThrow(
    "mã 999",
  );
  for (const data of [
    { items: [record("a")], has_more: true },
    { items: [record("same"), record("same")], has_more: false },
  ]) {
    const c = client();
    c.bitable.appTableRecord.search
      .mockReset()
      .mockResolvedValue({ code: 0, data });
    await expect(readInventory(source, c as any)).rejects.toThrow();
  }
  const renamed = client();
  renamed.bitable.appTableField.list.mockResolvedValue({
    code: 0,
    data: { items: [] },
  });
  await expect(readInventory(source, renamed as any)).rejects.toThrow(
    "Cột ánh xạ",
  );
});
async function prepare(createMissing = false) {
  const config = { ...source, createMissing };
  await tx((db) =>
    saveInventorySource(db, actor, { source: config, version: 0 }),
  );
  const saved = await inventorySource(pool);
  const { version, updatedAt, ...stored } = saved;
  return { source: stored as InventorySource, version };
}
async function seed() {
  return tx((db) =>
    saveSku(
      db,
      actor,
      skuSchema.parse({
        sku: "SYNTHETIC",
        color: "Cam",
        size: "M",
        stock: 30,
        inbound: 10,
        day1: 20,
        day2: 20,
        health: "Tăng trưởng",
        inventoryAt: "2026-10-14T00:00:00+07:00",
      }),
    ),
  );
}
async function preview(config: Awaited<ReturnType<typeof prepare>>) {
  return tx((db) =>
    previewInventory(
      db,
      actor,
      config.source,
      config.version,
      normalizeInventory([record("r")], config.source),
    ),
  );
}
it("preview does not change stock; confirm replaces not adds, keeps V9 inputs and audits, repeat is idempotent", async () => {
  await seed();
  const config = await prepare();
  const p = await preview(config);
  expect(p.count).toBe(1);
  expect((await variants())[0].stock).toBe(30);
  await tx((db) => confirmInventory(db, actor, p.id));
  expect((await variants())[0]).toMatchObject({
    stock: 12,
    inbound: 10,
    day1: 20,
    day2: 20,
    health: "Tăng trưởng",
    inventoryAt: "2026-10-16T00:00:00+07:00",
  });
  const count = (await pool.query("SELECT count(*) FROM inventory_snapshots"))
    .rows[0].count;
  expect(await tx((db) => confirmInventory(db, actor, p.id))).toMatchObject({
    replayed: true,
  });
  expect(
    (await pool.query("SELECT count(*) FROM inventory_snapshots")).rows[0]
      .count,
  ).toBe(count);
  expect(
    (
      await pool.query(
        "SELECT details FROM activity_logs WHERE action='lark.inventory.confirm'",
      )
    ).rows[0].details.rows[1],
  ).toMatchObject({ previous: 30, stock: 12 });
});
it("creates missing SKUs only when opted in; zero size stays known zero and opening lifecycle", async () => {
  const config = await prepare(true),
    p = await preview(config);
  expect(p.count).toBe(3);
  await tx((db) => confirmInventory(db, actor, p.id));
  expect(await variants()).toHaveLength(3);
  expect((await variants()).find((v) => v.size === "XL")).toMatchObject({
    stock: 0,
    health: "Mở bán",
    inbound: 0,
  });
});
it("blocks config and SKU version conflicts and rolls back all partial writes", async () => {
  const id = await seed(),
    config = await prepare(true),
    p = await preview(config);
  await pool.query("UPDATE variants SET version=version+1 WHERE id=$1", [id]);
  await expect(tx((db) => confirmInventory(db, actor, p.id))).rejects.toThrow(
    "nhân viên khác",
  );
  expect(await variants()).toHaveLength(1);
  expect((await variants())[0].stock).toBe(30);
  await tx((db) => saveInventorySource(db, actor, { source, version: 1 }));
  await expect(tx((db) => confirmInventory(db, actor, p.id))).rejects.toThrow(
    "Cấu hình nguồn",
  );
  await expect(
    tx((db) => saveInventorySource(db, actor, { source, version: 1 })),
  ).rejects.toThrow("Cấu hình nguồn");
});
it("protects newer stock, refuses empty/invalid/expired previews and another actor", async () => {
  const id = await seed(),
    config = await prepare();
  await pool.query(
    "UPDATE variants SET body=jsonb_set(body,'{inventoryAt}','\"2026-10-17T00:00:00+07:00\"') WHERE id=$1",
    [id],
  );
  const p = await preview(config);
  expect(p.count).toBe(0);
  expect(p.rows[1].action).toBe("older");
  await expect(tx((db) => confirmInventory(db, actor, p.id))).rejects.toThrow(
    "Sửa lỗi",
  );
  await expect(
    tx((db) => confirmInventory(db, { ...actor, id: randomUUID() }, p.id)),
  ).rejects.toThrow("của bạn");
  await pool.query(
    "UPDATE variants SET body=jsonb_set(body,'{inventoryAt}','\"2026-10-14T00:00:00+07:00\"') WHERE id=$1",
    [id],
  );
  const fresh = await preview(config);
  await pool.query(
    "UPDATE import_previews SET body=jsonb_set(body,'{fetchedAt}','\"2026-01-01T00:00:00Z\"') WHERE id=$1",
    [fresh.id],
  );
  await expect(
    tx((db) => confirmInventory(db, actor, fresh.id)),
  ).rejects.toThrow("15 phút");
});
it("inventory endpoints require session, Admin and CSRF; source reload persists on backend", async () => {
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    expect((await fetch(base + "/api/lark/inventory/source")).status).toBe(401);
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0],
      me = await (
        await fetch(base + "/api/me", { headers: { Cookie: cookie } })
      ).json();
    const post = (path: string, body: any, csrf = me.csrf) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: process.env.PUBLIC_URL!,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(body),
      });
    expect(
      (
        await post(
          "/api/lark/inventory/source",
          { source, version: 0 },
          "wrong",
        )
      ).status,
    ).toBe(403);
    expect(
      (await post("/api/lark/inventory/source", { source, version: 0 })).status,
    ).toBe(200);
    expect(
      await (
        await fetch(base + "/api/lark/inventory/source", {
          headers: { Cookie: cookie },
        })
      ).json(),
    ).toMatchObject({ url: source.url, version: 1, blankAsZero: true });
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    for (const path of [
      "/api/lark/inventory/source",
      "/api/lark/inventory/fields",
      "/api/lark/inventory/preview",
      `/api/lark/inventory/${randomUUID()}/confirm`,
    ])
      expect((await post(path, {})).status).toBe(403);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

it("allows first inventory import for catalogue SKUs with unknown stock despite a newer creation timestamp", async () => {
  await tx((db) =>
    saveSku(
      db,
      actor,
      skuSchema.parse({
        sku: "SYNTHETIC",
        color: "Cam",
        size: "M",
        stock: null,
        inventoryAt: "2026-10-17T00:00:00+07:00",
      }),
    ),
  );
  const config = await prepare(),
    p = await preview(config);
  expect(p.count).toBe(1);
  expect(p.rows.find((r) => r.size === "M")?.action).toBe("update");
  await tx((db) => confirmInventory(db, actor, p.id));
  expect((await variants())[0].stock).toBe(12);
});

it("planning inventory scope updates selected SKU only and never creates unrelated catalogue rows", async () => {
  const m = await seed();
  const s = await tx((db) =>
    saveSku(
      db,
      actor,
      skuSchema.parse({
        sku: "SYNTHETIC",
        color: "Cam",
        size: "S",
        stock: 99,
        inventoryAt: "2026-10-14T00:00:00+07:00",
      }),
    ),
  );
  const config = await prepare(true);
  const p = await tx((db) =>
    previewInventory(
      db,
      actor,
      config.source,
      config.version,
      normalizeInventory([record("r")], config.source),
      [m],
    ),
  );
  expect(p.rows).toHaveLength(1);
  expect(p.count).toBe(1);
  expect(p.rows[0].size).toBe("M");
  await tx((db) => confirmInventory(db, actor, p.id));
  const all = await variants();
  expect(all).toHaveLength(2);
  expect(all.find((v) => v.id === m)?.stock).toBe(12);
  expect(all.find((v) => v.id === s)?.stock).toBe(99);
});
it("unmatched selected SKU stays unchanged and missing/deleted selection is rejected", async () => {
  const id = await tx((db) =>
    saveSku(
      db,
      actor,
      skuSchema.parse({
        sku: "SYNTHETIC-OTHER",
        color: "Cam",
        size: "M",
        stock: 44,
      }),
    ),
  );
  const config = await prepare();
  const result = normalizeInventory([record("r")], config.source);
  const p = await tx((db) =>
    previewInventory(db, actor, config.source, config.version, result, [id]),
  );
  expect(p.rows).toEqual([]);
  expect(p.count).toBe(0);
  expect(p.warnings.join()).toContain("giữ nguyên");
  expect((await variants())[0].stock).toBe(44);
  await expect(
    tx((db) =>
      previewInventory(db, actor, config.source, config.version, result, [
        randomUUID(),
      ]),
    ),
  ).rejects.toThrow("SKU đã thay đổi");
});
it("Planner may confirm own scoped stock preview but cannot configure Base or read whole source", async () => {
  const id = await seed(),
    config = await prepare();
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie: cookie } })
    ).json();
    await pool.query("UPDATE users SET role='Production Planner' WHERE id=$1", [
      me.user.id,
    ]);
    const post = (url: string, body: any) =>
      fetch(base + url, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: process.env.PUBLIC_URL!,
          "Content-Type": "application/json",
          "X-CSRF-Token": me.csrf,
        },
        body: JSON.stringify(body),
      });
    expect(
      (await post("/api/lark/inventory/source", { source, version: 1 })).status,
    ).toBe(403);
    expect((await post("/api/lark/inventory/preview", {})).status).toBe(403);
    expect(
      (await post("/api/lark/inventory/preview", { ids: [id, id] })).status,
    ).toBe(400);
    const owner = { ...actor, id: me.user.id, role: "Production Planner" };
    const p = await tx((db) =>
      previewInventory(
        db,
        owner,
        config.source,
        config.version,
        normalizeInventory([record("r")], config.source),
        [id],
      ),
    );
    expect((await post(`/api/lark/inventory/${p.id}/confirm`, {})).status).toBe(
      200,
    );
    expect((await variants())[0].stock).toBe(12);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});
