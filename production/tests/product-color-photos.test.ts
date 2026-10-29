import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction as tx } from "../server/db";
import { migrate } from "../server/migrate";
import { saveSku, createOrder, loadOrder, dashboard } from "../server/service";
import {
  listProductProfiles,
  saveProductProfile,
  saveProductColorPhoto,
} from "../server/product-profiles";
import { productPhotoFor } from "../shared/product-profiles";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  name: "Synthetic colour photo planner",
  role: "Administrator",
};
const red = {
  name: "red.png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
};
const blue = {
  name: "blue.png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC",
};
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    `INSERT INTO planning_policies VALUES(1,'{"targetDays":5,"leadDays":3,"safeDays":0,"includeLead":false,"roundTo":1}',1) ON CONFLICT(id) DO NOTHING`,
  );
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','color-photo-test',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
async function sku(code: string, color: string, size = "M") {
  return tx((db) =>
    saveSku(db, actor, { sku: code, color, size, stock: 30, inbound: 10 }),
  );
}
async function fixture() {
  const v = await sku("MIU15", "Đen");
  await sku("MIU15", "Đen", "L");
  await sku("MIU15", "Xám tiêu đậm");
  return { v, p: (await listProductProfiles())[0] };
}
const photo = (id: string, color: string, image = red, version = 0) =>
  tx((db) =>
    saveProductColorPhoto(db, actor, id, {
      expectedVersion: version,
      color,
      image,
    }),
  );
it("one image per product/colour shared by sizes, with stable keys and no bytes in dashboard", async () => {
  const { p } = await fixture();
  expect(p.colors).toHaveLength(2);
  expect(p.colors!.find((c) => c.color === "Đen")).toMatchObject({
    version: 0,
    imageUrl: null,
  });
  const black = await photo(p.id, " ĐEN "),
    grey = await photo(p.id, "Xám tiêu đậm", blue);
  expect(black).toMatchObject({
    key: "đen",
    color: "Đen",
    version: 1,
    imageName: "red.png",
  });
  expect(grey.imageUrl).not.toBe(black.imageUrl);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM product_color_profiles"))
      .rows[0].n,
  ).toBe(2);
  const snap = await dashboard();
  expect(snap.products[0].colors).toHaveLength(2);
  expect(JSON.stringify(snap)).not.toContain(red.data);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM variants")).rows[0].n,
  ).toBe(3);
});
it("image resolution uses exact colour including accents, falls back to common, never another product or colour", async () => {
  const { p } = await fixture();
  await sku("MIU15", "Đỏ");
  await sku("MIU15", "Đỗ");
  await sku("MIU37", "Đen");
  await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "In",
      image: blue,
    }),
  );
  const black = await photo(p.id, "Đen"),
    redColor = await photo(p.id, "Đỏ");
  const profiles = await listProductProfiles(),
    common = profiles.find((x) => x.id === p.id)!.imageUrl;
  expect(productPhotoFor(profiles, "miu15", " ĐEN ")).toEqual({
    url: black.imageUrl,
    source: "color",
  });
  expect(productPhotoFor(profiles, "MIU15", "Xám tiêu đậm")).toEqual({
    url: common,
    source: "common",
  });
  expect(productPhotoFor(profiles, "MIU15", "Đỗ").url).toBe(common);
  expect(productPhotoFor(profiles, "MIU15", "Đỏ").url).toBe(redColor.imageUrl);
  expect(productPhotoFor(profiles, "MIU37", "Đen").url).toBeNull();
});
it("replacing/removing a colour image preserves the common image, another colour and type/version", async () => {
  const { p } = await fixture();
  const common = await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "In",
      image: blue,
    }),
  );
  const black = await photo(p.id, "Đen"),
    grey = await photo(p.id, "Xám tiêu đậm", blue);
  const changed = await photo(p.id, "Đen", blue, 1);
  expect(changed.imageUrl).not.toBe(black.imageUrl);
  await tx((db) =>
    saveProductColorPhoto(db, actor, p.id, {
      expectedVersion: 2,
      color: "Đen",
      removeImage: true,
    }),
  );
  const profiles = await listProductProfiles(),
    after = profiles[0];
  expect(after).toMatchObject({
    goodsType: "In",
    version: 1,
    imageUrl: common.imageUrl,
  });
  expect(after.colors!.find((c) => c.key === "xám tiêu đậm")!.imageUrl).toBe(
    grey.imageUrl,
  );
  expect(productPhotoFor(profiles, "MIU15", "Đen")).toEqual({
    url: common.imageUrl,
    source: "common",
  });
  const logs = (
    await pool.query(
      "SELECT details FROM activity_logs WHERE action='product-color-photo.update'",
    )
  ).rows;
  expect(logs).toHaveLength(4);
  expect(JSON.stringify(logs)).not.toContain(red.data);
});
it("per-colour version checks reject stale/concurrent overwrites and leave other colours independent", async () => {
  const { p } = await fixture();
  const results = await Promise.allSettled([
    photo(p.id, "Đen"),
    photo(p.id, "đen", blue),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await photo(p.id, "Xám tiêu đậm", blue)).version).toBe(1);
  await expect(photo(p.id, "Đen", red, 0)).rejects.toThrow(
    "đã được người khác",
  );
});
it("unknown colour/product and invalid image are atomic; retained photos remain manageable when last SKU was removed", async () => {
  const { p } = await fixture();
  await sku("MIU37", "Cam");
  await expect(photo(p.id, "Cam")).rejects.toThrow("Màu chưa có");
  await expect(photo(randomUUID(), "Đen")).rejects.toThrow("Không tìm thấy");
  await expect(
    photo(p.id, "Đen", {
      name: "bad.svg",
      data: Buffer.from("<svg>bad</svg>").toString("base64"),
    }),
  ).rejects.toThrow("Chỉ nhận ảnh");
  expect(
    (await pool.query("SELECT * FROM product_color_profiles")).rowCount,
  ).toBe(0);
  await photo(p.id, "Xám tiêu đậm");
  await pool.query(
    "DELETE FROM inventory_snapshots WHERE variant_id IN(SELECT id FROM variants WHERE color_key='xám tiêu đậm')",
  );
  await pool.query("DELETE FROM variants WHERE color_key='xám tiêu đậm'");
  expect(
    (await listProductProfiles())[0].colors!.some(
      (c) => c.key === "xám tiêu đậm",
    ),
  ).toBe(true);
  expect((await photo(p.id, "Xám tiêu đậm", blue, 1)).version).toBe(2);
});
it("colour-photo writes never alter stock, order type, quantities or order version", async () => {
  const { p, v } = await fixture();
  const o = await tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-29T10:00:00+07:00",
      supplier: "PRIMITEX",
      delivery: null,
      requestedBy: actor.name,
      notes: "Synthetic",
      status: "Đang sản xuất",
      items: [
        { variantId: v, qty: 100, priority: "THƯỜNG", goodsType: "Trơn" },
      ],
    }),
  );
  const before = (
    await pool.query("SELECT id,body,version FROM variants ORDER BY id")
  ).rows;
  await photo(p.id, "Đen");
  expect(await loadOrder(pool, o.id)).toEqual(o);
  expect(
    (await pool.query("SELECT id,body,version FROM variants ORDER BY id")).rows,
  ).toEqual(before);
});
it("colour routes require auth/permission/CSRF, isolate product IDs and roundtrip punctuation in colour keys", async () => {
  const { p } = await fixture();
  const color = "Trắng (phối đỏ / đen & nâu)";
  await sku("MIU15", color);
  await sku("MIU37", "Đen");
  const other = (await listProductProfiles()).find((x) => x.sku === "MIU37")!;
  const saved = await photo(p.id, color);
  const app = makeApp(),
    server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    expect((await fetch(base + saved.imageUrl)).status).toBe(401);
    const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      }),
      cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie: cookie } })
    ).json();
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    const r = await fetch(base + saved.imageUrl, {
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await r.arrayBuffer()).toString("base64")).toBe(
      red.data,
    );
    expect(
      (
        await fetch(
          base +
            `/api/product-profiles/${other.id}/color-image?color=${encodeURIComponent(color)}`,
          { headers: { Cookie: cookie } },
        )
      ).status,
    ).toBe(404);
    const headers = {
        Cookie: cookie,
        Origin: process.env.PUBLIC_URL!,
        "Content-Type": "application/json",
        "X-CSRF-Token": me.csrf,
      },
      payload = JSON.stringify({ color, expectedVersion: 1, image: blue });
    expect(
      (
        await fetch(base + `/api/product-profiles/${p.id}/colors`, {
          method: "PUT",
          headers,
          body: payload,
        })
      ).status,
    ).toBe(403);
    await pool.query("UPDATE users SET role='Production Planner' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (
        await fetch(base + `/api/product-profiles/${p.id}/colors`, {
          method: "PUT",
          headers: { ...headers, "X-CSRF-Token": "wrong" },
          body: payload,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + `/api/product-profiles/${p.id}/colors`, {
          method: "PUT",
          headers,
          body: payload,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(base + `/api/product-profiles/${p.id}/colors`, {
          method: "PUT",
          headers,
          body: payload,
        })
      ).status,
    ).toBe(409);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
