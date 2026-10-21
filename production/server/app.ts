import express, { type ErrorRequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { z } from "zod";
import { pool, transaction, audit } from "./db";
import { publicOrigin, originAllowed, callbackUrl, larkStatus } from "./config";
import { auth, authenticated, permission, larkClient, retryRead } from "./auth";
import {
  dashboard,
  loadOrder,
  listOrders,
  variants,
  saveSku,
  createOrder,
  editOrder,
  receive,
  orderAction,
} from "./service";
import {
  AppError,
  policySchema,
  skuSchema,
  stages,
  totals,
  forecast,
  sizes,
} from "../shared/domain";
import { initialAdminStatus, bootstrapInitialAdmin } from "./initial-admin";
import { composeOrder } from "./order-composer";
import {
  previewSales,
  inspectSales,
  confirmSales,
  salesReport,
  syncSales,
  previewV9,
  confirmV9,
  readFileRows,
} from "./imports";
import { listUsers, createUser, updateUser, userAccessHistory } from "./users";
import { salesMatrix } from "../shared/sales-matrix";
import {
  inventorySource,
  inventoryFields,
  saveInventorySource,
  readInventory,
  previewInventory,
  confirmInventory,
} from "./lark-inventory";
import { previewInbound, confirmInbound } from "./inbound";
import {
  productionReport,
  productionReportRows,
} from "../shared/production-report";
import { salesFileSchema } from "../shared/sales-file";
const PgStore = connectPg(session);
export function makeApp() {
  const app = express(),
    production = process.env.NODE_ENV === "production";
  publicOrigin();
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw Error("SESSION_SECRET must contain at least 32 characters");
  if (production && process.env.DEV_AUTH === "true")
    throw Error("Production requires HTTPS PUBLIC_URL and DEV_AUTH disabled");
  app.set("trust proxy", production ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
    }),
  );
  app.use(express.json({ limit: "16mb" }));
  app.use(
    session({
      name: "cf.sid",
      secret: process.env.SESSION_SECRET,
      store: new PgStore({ pool }),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        maxAge: 8 * 3600e3,
      },
    }),
  );
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !originAllowed(req.get("Origin"))
    )
      return next(new AppError(403, "Origin không được phép"));
    next();
  });
  app.use(
    "/auth",
    rateLimit({
      windowMs: 60000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    auth,
  );
  app.get(["/health", "/api/health"], async (_req, res) => {
    await pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
    res.json({ ok: true });
  });
  app.use(
    "/api",
    authenticated,
    permission("read"),
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/api/me", (req, res) =>
    res.json({
      user: req.actor,
      csrf: req.session.csrf,
      development:
        process.env.DEV_AUTH === "true" &&
        process.env.NODE_ENV !== "production",
    }),
  );
  app.get("/api/dashboard", async (_req, res) => res.json(await dashboard()));
  app.get("/api/account", async (req, res) => {
    res.json(await initialAdminStatus(pool, req.actor!.id));
  });
  app.post("/api/admin/bootstrap", async (req, res) => {
    z.object({}).strict().parse(req.body);
    const changed = await transaction((db) =>
      bootstrapInitialAdmin(db, req.actor!.id),
    );
    if (!changed)
      throw new AppError(
        403,
        "Không được khởi tạo quản trị viên: cần đúng tài khoản được cấu hình và hệ thống chưa có Administrator hoặc chưa từng dùng bước khởi tạo này.",
      );
    res.json({ ok: true });
  });
  app.get("/api/lark/status", permission("admin"), (_req, res) =>
    res.json({
      ...larkStatus(),
      homepage: publicOrigin(),
      redirectUrl: publicOrigin() + "/auth/callback",
      requiredBackendVariables: [
        "LARK_APP_ID",
        "LARK_APP_SECRET",
        "LARK_TENANT_KEY",
      ],
      domains: ["accounts.larksuite.com", "open.larksuite.com"],
    }),
  );
  app.get("/api/skus", async (_req, res) => res.json(await variants()));
  app.post("/api/skus", permission("plan"), async (req, res) =>
    res.status(201).json({
      id: await transaction((db) => saveSku(db, req.actor!, req.body)),
    }),
  );
  app.post("/api/skus/batch", permission("plan"), async (req, res) => {
    const rows = z.array(z.unknown()).min(1).max(1000).parse(req.body);
    const ids = await transaction(async (db) => {
      const ids = [];
      for (const row of rows) ids.push(await saveSku(db, req.actor!, row));
      return ids;
    });
    res.status(201).json({ ids });
  });
  app.put("/api/skus/:id", permission("plan"), async (req, res) => {
    const body = z
      .object({
        expectedVersion: z.number().int().positive(),
        sku: z.unknown(),
      })
      .strict()
      .parse(req.body);
    res.json({
      id: await transaction((db) =>
        saveSku(
          db,
          req.actor!,
          body.sku,
          z.uuid().parse(req.params.id),
          body.expectedVersion,
        ),
      ),
    });
  });
  app.delete("/api/skus/:id", permission("plan"), async (req, res) => {
    const { expectedVersion } = z
      .object({ expectedVersion: z.number().int().positive() })
      .strict()
      .parse(req.body);
    await transaction(async (db) => {
      const id = z.uuid().parse(req.params.id),
        r = await db.query("SELECT * FROM variants WHERE id=$1 FOR UPDATE", [
          id,
        ]);
      if (!r.rowCount) throw new AppError(404, "Không tìm thấy SKU");
      if (r.rows[0].version !== expectedVersion)
        throw new AppError(409, "SKU đã thay đổi");
      if (
        (
          await db.query(
            "SELECT 1 FROM production_order_items WHERE variant_id=$1",
            [id],
          )
        ).rowCount
      )
        throw new AppError(409, "SKU đã dùng trong lệnh không thể xóa");
      await audit(db, req.actor!.id, "sku.delete", id, r.rows[0]);
      await db.query("DELETE FROM inventory_snapshots WHERE variant_id=$1", [
        id,
      ]);
      await db.query("DELETE FROM variants WHERE id=$1", [id]);
    });
    res.json({ ok: true });
  });
  app.post("/api/skus/bulk-stage", permission("plan"), async (req, res) => {
    const { sku, health } = z
      .object({ sku: z.string().min(1), health: z.enum(stages) })
      .strict()
      .parse(req.body);
    await transaction(async (db) => {
      const rows = (await variants(db)).filter((r) => r.sku === sku);
      for (const r of rows) {
        const { id, version, ...body } = r;
        await saveSku(db, req.actor!, { ...body, health }, id, version);
      }
    });
    res.json({ ok: true });
  });
  app.put("/api/policy", permission("plan"), async (req, res) => {
    const input = z
      .object({
        expectedVersion: z.number().int().positive(),
        policy: policySchema,
      })
      .strict()
      .parse(req.body);
    await transaction(async (db) => {
      const old = (
        await db.query("SELECT * FROM planning_policies WHERE id=1 FOR UPDATE")
      ).rows[0];
      if (old.version !== input.expectedVersion)
        throw new AppError(409, "Chính sách đã thay đổi. Hãy tải lại.");
      await db.query(
        "UPDATE planning_policies SET body=$1,version=version+1 WHERE id=1",
        [JSON.stringify(input.policy)],
      );
      await audit(db, req.actor!.id, "policy.update", "1", {
        before: old.body,
        after: input.policy,
      });
    });
    res.json({ ok: true });
  });
  app.get("/api/orders", async (_req, res) => res.json(await listOrders()));
  app.get("/api/orders/:id", async (req, res) =>
    res.json(await loadOrder(pool, z.uuid().parse(req.params.id))),
  );
  app.post("/api/orders", permission("order"), async (req, res) =>
    res
      .status(201)
      .json(await transaction((db) => createOrder(db, req.actor!, req.body))),
  );
  app.post("/api/orders/compose", permission("order"), async (req, res) =>
    res
      .status(201)
      .json(await transaction((db) => composeOrder(db, req.actor!, req.body))),
  );
  app.put("/api/orders/:id/compose", permission("order"), async (req, res) =>
    res.json(
      await transaction((db) =>
        composeOrder(db, req.actor!, req.body, z.uuid().parse(req.params.id)),
      ),
    ),
  );
  app.put("/api/orders/:id", permission("order"), async (req, res) =>
    res.json(
      await transaction((db) =>
        editOrder(db, req.actor!, z.uuid().parse(req.params.id), req.body),
      ),
    ),
  );
  app.post(
    "/api/orders/:id/receipts",
    permission("receive"),
    async (req, res) =>
      res.json(
        await transaction((db) =>
          receive(
            db,
            req.actor!,
            z.uuid().parse(req.params.id),
            req.get("Idempotency-Key") || "",
            req.body,
          ),
        ),
      ),
  );
  for (const action of ["delete", "restore", "cancel", "reopen"])
    app.post(
      "/api/orders/:id/" + action,
      permission(
        action === "delete" || action === "restore" ? "archive" : "order",
      ),
      async (req, res) =>
        res.json(
          await transaction((db) =>
            orderAction(
              db,
              req.actor!,
              z.uuid().parse(req.params.id),
              action,
              req.body,
            ),
          ),
        ),
    );
  app.get("/api/orders/:id/history", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await loadOrder(pool, id);
    const receipts = (
      await pool.query(
        "SELECT r.id,r.actor_id,u.name as actor,r.date,r.note,r.created_at,COALESCE(jsonb_agg(jsonb_build_object('qty',i.qty,'identity',i.identity_snapshot)) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) as lines FROM production_receipts r JOIN users u ON u.id=r.actor_id LEFT JOIN production_receipt_items i ON i.receipt_id=r.id WHERE r.order_id=$1 GROUP BY r.id,u.name ORDER BY r.created_at",
        [id],
      )
    ).rows;
    const revisions = (
      await pool.query(
        "SELECT r.*,u.name as actor FROM production_order_revisions r JOIN users u ON u.id=r.actor_id WHERE order_id=$1 ORDER BY at DESC",
        [id],
      )
    ).rows;
    const activity = (
      await pool.query(
        "SELECT a.action,a.at,a.details,u.name as actor FROM activity_logs a JOIN users u ON u.id=a.actor_id WHERE a.entity_id=$1 OR a.details->>'orderId'=$1 ORDER BY at DESC",
        [id],
      )
    ).rows;
    res.json({ receipts, revisions, activity });
  });
  app.get("/api/sales", async (req, res) => {
    const { from, to } = z
      .object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
      .parse(req.query);
    res.json(await salesReport(pool, from, to));
  });
  app.post(
    "/api/imports/sales/inspect",
    permission("plan"),
    async (req, res) => {
      const input = salesFileSchema.parse(req.body);
      const bytes = Buffer.from(input.base64, "base64");
      if (bytes.length > 10e6)
        throw new AppError(413, "Tối đa 10 MB mỗi file.");
      res.json(await inspectSales(input.filename, bytes));
    },
  );
  app.post("/api/imports/sales/preview", permission("plan"), async (req, res) =>
    res.json(await transaction((db) => previewSales(db, req.actor!, req.body))),
  );
  app.post(
    "/api/imports/sales/:id/confirm",
    permission("plan"),
    async (req, res) =>
      res.json(
        await transaction((db) =>
          confirmSales(db, req.actor!, z.uuid().parse(req.params.id)),
        ),
      ),
  );
  app.post("/api/sales/sync", permission("plan"), async (req, res) => {
    const input = z
      .object({
        mode: z.enum(["2", "7"]),
        keys: z
          .array(
            z
              .object({
                sku: z.string().min(1),
                color: z.string().min(1),
                size: z.enum(sizes),
              })
              .strict(),
          )
          .min(1)
          .max(10000)
          .optional(),
      })
      .strict()
      .parse(req.body);
    res.json(
      await transaction((db) =>
        syncSales(db, req.actor!, input.mode, input.keys),
      ),
    );
  });
  app.post("/api/imports/v9/preview", permission("admin"), async (req, res) =>
    res.json(await transaction((db) => previewV9(db, req.actor!, req.body))),
  );
  app.post(
    "/api/imports/v9/:id/confirm",
    permission("admin"),
    async (req, res) =>
      res.json(
        await transaction((db) =>
          confirmV9(db, req.actor!, z.uuid().parse(req.params.id)),
        ),
      ),
  );
  app.post(
    "/api/imports/planner/preview",
    permission("plan"),
    async (req, res) => {
      const { filename, base64 } = z
        .object({ filename: z.string().max(200), base64: z.string().max(15e6) })
        .strict()
        .parse(req.body);
      const rows = await readFileRows(filename, Buffer.from(base64, "base64"));
      const data = rows.map((r) => ({
        sku: r.ma_sp,
        color: r.mau,
        size: r.size || "S",
        day1: Number(r.ban_ngay_1 || 0),
        day2: Number(r.ban_ngay_2 || 0),
        stock: r.ton_hien_tai === "" ? undefined : Number(r.ton_hien_tai),
        stockKnown: r.ton_hien_tai !== "" && r.ton_hien_tai !== undefined,
        inbound: Number(r.hang_dang_ve || 0),
        health: r.trang_thai_san_pham || "Mở bán",
        abnormal: ["1", "true", "có"].includes(r.ngay_bat_thuong || ""),
        manualRate: Number(r.tb_chuan_thu_cong || 0),
        pilotQty: Number(r.sl_test || 0),
      }));
      res.json(
        await transaction((db) =>
          previewV9(db, req.actor!, {
            filename,
            data: { rows: data, orders: [] },
          }),
        ),
      );
    },
  );
  app.post(
    "/api/imports/planner/:id/confirm",
    permission("plan"),
    async (req, res) => {
      const id = z.uuid().parse(req.params.id);
      const p = (
        await pool.query("SELECT body FROM import_previews WHERE id=$1", [id])
      ).rows[0];
      if (
        !p ||
        p.body.input.data.history?.length ||
        p.body.input.data.deletedHistory?.length ||
        p.body.input.data.config
      )
        throw new AppError(403, "Không phải bản nhập kế hoạch");
      res.json(await transaction((db) => confirmV9(db, req.actor!, id)));
    },
  );
  app.get("/api/suppliers", async (_req, res) =>
    res.json((await pool.query("SELECT * FROM suppliers ORDER BY name")).rows),
  );
  app.get("/api/users", permission("admin"), async (req, res) =>
    res.json(await listUsers(pool, req.actor!.id)),
  );
  app.get("/api/users/activity", permission("admin"), async (req, res) =>
    res.json(await userAccessHistory(pool, req.actor!.id)),
  );
  app.post("/api/users", permission("admin"), async (req, res) =>
    res
      .status(201)
      .json(await transaction((db) => createUser(db, req.actor!.id, req.body))),
  );
  app.put("/api/users/:id", permission("admin"), async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.json(
      await transaction((db) => updateUser(db, req.actor!.id, id, req.body)),
    );
  });
  app.get("/api/logs", permission("admin"), async (_req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT a.id,a.at,a.action,a.entity_id,u.name as actor FROM activity_logs a JOIN users u ON u.id=a.actor_id ORDER BY at DESC LIMIT 200",
        )
      ).rows,
    ),
  );
  app.post(
    "/api/planning/inbound/preview",
    permission("plan"),
    async (req, res) =>
      res.json(
        await transaction((db) => previewInbound(db, req.actor!, req.body)),
      ),
  );
  app.post(
    "/api/planning/inbound/:id/confirm",
    permission("plan"),
    async (req, res) => {
      z.object({}).strict().parse(req.body);
      res.json(
        await transaction((db) =>
          confirmInbound(db, req.actor!, z.uuid().parse(req.params.id)),
        ),
      );
    },
  );
  app.get(
    "/api/lark/inventory/source",
    permission("admin"),
    async (_req, res) => res.json(await inventorySource(pool)),
  );
  app.post(
    "/api/lark/inventory/source",
    permission("admin"),
    async (req, res) =>
      res.json(
        await transaction((db) =>
          saveInventorySource(db, req.actor!, req.body),
        ),
      ),
  );
  const larkReadLimit = rateLimit({
    windowMs: 60000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message: "Đọc Lark tối đa 5 lần/phút; vui lòng đợi rồi thử lại",
    },
  });
  app.post(
    "/api/lark/inventory/fields",
    permission("admin"),
    larkReadLimit,
    async (req, res) => {
      const { url } = z
        .object({ url: z.string().max(1000) })
        .strict()
        .parse(req.body);
      res.json(await inventoryFields(url));
    },
  );
  app.post(
    "/api/lark/inventory/preview",
    permission("plan"),
    larkReadLimit,
    async (req, res) => {
      const { ids } = z
        .object({ ids: z.array(z.uuid()).min(1).max(2000).optional() })
        .strict()
        .parse(req.body);
      if (ids && new Set(ids).size !== ids.length)
        throw new AppError(400, "SKU bị chọn trùng");
      if (req.actor!.role !== "Administrator" && !ids)
        throw new AppError(
          403,
          "Chọn SKU cần cập nhật trong bảng dự kiến sản xuất",
        );
      const current = await inventorySource(pool);
      if (!current) throw new AppError(400, "Lưu cấu hình nguồn tồn kho trước");
      const { version, updatedAt, ...source } = current;
      const result = await readInventory(source);
      res.json(
        await transaction((db) =>
          previewInventory(db, req.actor!, source, version, result, ids),
        ),
      );
    },
  );
  app.post(
    "/api/lark/inventory/:id/confirm",
    permission("plan"),
    async (req, res) => {
      const id = z.uuid().parse(req.params.id);
      z.object({}).strict().parse(req.body);
      res.json(await transaction((db) => confirmInventory(db, req.actor!, id)));
    },
  );
  app.get("/api/lark/base/preview", permission("admin"), async (_req, res) => {
    if (!process.env.LARK_BASE_APP_TOKEN || !process.env.LARK_BASE_TABLE_ID)
      throw new AppError(503, "Chưa cấu hình Lark Base");
    const result = await retryRead(() =>
      larkClient().bitable.appTableRecord.list({
        path: {
          app_token: process.env.LARK_BASE_APP_TOKEN!,
          table_id: process.env.LARK_BASE_TABLE_ID!,
        },
        params: { page_size: 100 },
      }),
    );
    if (result.code !== 0)
      throw new AppError(
        502,
        "Lark Base chưa cấp đủ quyền hoặc cấu hình chưa đúng",
      );
    res.json({ readOnly: true, ...result.data });
  });
  app.get("/api/export/:kind", async (req, res) => {
    const kind = z
        .enum([
          "skus",
          "orders",
          "archived",
          "sales",
          "combos",
          "reconciliation",
          "production-report",
        ])
        .parse(req.params.kind),
      format = z.enum(["csv", "xlsx"]).default("csv").parse(req.query.format);
    let rows: (string | number | null)[][] = [];
    if (kind === "skus") {
      rows = [
        [
          "ma_sp",
          "mau",
          "size",
          "ban_ngay_1",
          "ban_ngay_2",
          "ton_hien_tai",
          "hang_dang_ve",
          "trang_thai_san_pham",
          "ngay_bat_thuong",
          "tb_chuan_thu_cong",
          "sl_test",
        ],
        ...(await variants()).map((s) => [
          s.sku,
          s.color,
          s.size,
          s.day1,
          s.day2,
          s.stock,
          s.inbound,
          s.health,
          s.abnormal ? "1" : "0",
          s.manualRate,
          s.pilotQty,
        ]),
      ];
    } else if (kind === "production-report") {
      rows = await transaction(async (db) => {
        await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        return productionReportRows(
          productionReport(await listOrders(db), req.query),
        );
      });
    } else if (kind === "orders" || kind === "archived") {
      const id = req.query.id ? z.uuid().parse(req.query.id) : null;
      const search = z
        .string()
        .max(500)
        .default("")
        .parse(req.query.search)
        .toLowerCase();
      const filter = z
        .enum(["", "pending", "done", "cancelled"])
        .default("")
        .parse(req.query.filter);
      const all = (await listOrders()).filter(
        (o) =>
          (!id || o.id === id) &&
          (!search ||
            [
              o.code,
              o.supplier,
              o.requestedBy,
              o.deletedReason,
              ...o.items.map((i) => i.sku + " " + i.color),
            ]
              .join(" ")
              .toLowerCase()
              .includes(search)) &&
          (!filter ||
            (filter === "pending" && totals(o).pending > 0) ||
            (filter === "done" && !o.cancelled && !totals(o).pending) ||
            (filter === "cancelled" && o.cancelled)) &&
          (kind === "archived" ? !!o.deletedAt : !o.deletedAt),
      );
      rows = [
        [
          "Mã lệnh",
          "Ngày lệnh",
          "Xưởng",
          "Hẹn giao",
          "Mã SP",
          "Màu",
          "Size",
          "SL đặt",
          "Đã nhận",
          "Còn chờ",
          "Ưu tiên",
          "Người đặt",
          "Trạng thái",
          "Ghi chú",
        ],
        ...all.flatMap((o) =>
          o.items.map((i) => [
            o.code,
            o.time,
            o.supplier,
            o.delivery,
            i.sku,
            i.color,
            i.size,
            i.qty,
            i.received,
            o.cancelled ? 0 : i.qty - i.received,
            i.priority,
            o.requestedBy,
            totals(o).status,
            o.notes,
          ]),
        ),
      ];
      if (id) {
        rows = [
          [
            "Mã lệnh",
            "Ngày lệnh",
            "Xưởng",
            "Hẹn giao",
            "Mã SP",
            "Màu",
            ...sizes,
            "Tổng",
            "Ưu tiên",
            "Người đặt",
            "Trạng thái",
            "Ghi chú",
          ],
        ];
        for (const order of all) {
          const groups = new Map<string, typeof order.items>();
          for (const item of order.items) {
            const key = JSON.stringify([item.sku, item.color]);
            groups.set(key, [...(groups.get(key) || []), item]);
          }
          for (const items of groups.values()) {
            const priority = items.some((i) => i.priority === "CẤP BÁCH")
              ? "CẤP BÁCH"
              : items.some((i) => i.priority === "ƯU TIÊN")
                ? "ƯU TIÊN"
                : "THƯỜNG";
            rows.push([
              order.code,
              order.time,
              order.supplier,
              order.delivery,
              items[0].sku,
              items[0].color,
              ...sizes.map((size) =>
                items
                  .filter((i) => i.size === size)
                  .reduce((n, i) => n + i.qty, 0),
              ),
              items.reduce((n, i) => n + i.qty, 0),
              priority,
              order.requestedBy,
              totals(order).status,
              order.notes,
            ]);
          }
        }
      }
    } else {
      const filters = z
        .object({
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
          sku: z.string().max(90).optional(),
          search: z.string().max(500).default(""),
          mode: z.enum(["2", "7"]).default("2"),
          layout: z.enum(["details", "matrix"]).default("details"),
          bucket: z.enum(["combo", "unknown", "excluded"]).default("combo"),
        })
        .parse(req.query);
      if (filters.from && filters.to && filters.from > filters.to)
        throw new AppError(
          400,
          "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
        );
      const report = await salesReport(pool, filters.from, filters.to);
      const matches = (r: { sku: string; color: string; size: string }) =>
        (!filters.sku || r.sku === filters.sku) &&
        (!filters.search ||
          [r.sku, r.color, r.size]
            .join(" ")
            .toLowerCase()
            .includes(filters.search.toLowerCase()));
      if (kind === "reconciliation") {
        rows = [
          [
            "Ngày",
            "Mã SP",
            "Màu / phân loại",
            "Size",
            "Số lượng",
            "Nhóm đối soát",
            "Lý do",
          ],
          ...report.rows
            .filter((r) => r.kind === filters.bucket && matches(r))
            .map((r) => [
              r.date,
              r.sku,
              r.variation,
              r.size,
              r.qty,
              r.kind,
              r.reason,
            ]),
        ];
      } else if (kind === "combos") {
        rows = [
          ["Ngày", "Mã SP", "Phân loại combo", "Lượt combo", "Ghi chú"],
          ...report.rows
            .filter(
              (r) =>
                r.kind === "combo" && (!filters.sku || r.sku === filters.sku),
            )
            .map((r) => [
              r.date,
              r.sku,
              r.variation,
              r.qty,
              "Chưa phân bổ màu/size; cần đối soát",
            ]),
        ];
      } else if (filters.layout === "matrix") {
        const products = salesMatrix(
          report.variants.filter((r) => r.qty > 0 && matches(r)),
        );
        rows = [
          [
            "Mã SP",
            "Màu",
            ...sizes,
            "Tổng màu",
            "Tỷ trọng trong mã (%)",
            "TB/ngày 2 ngày",
            "TB/ngày 7 ngày",
          ],
        ];
        for (const p of products) {
          for (const c of p.colors)
            rows.push([
              p.sku,
              c.color,
              ...sizes.map((s) => c.sizeTotals[s]),
              c.qty,
              (c.qty / p.qty) * 100,
              c.variants.reduce((n, r) => n + (r.r2 || 0), 0),
              c.variants.reduce((n, r) => n + (r.r7 || 0), 0),
            ]);
          rows.push([
            p.sku,
            "TỔNG MÃ",
            ...sizes.map((s) => p.sizeTotals[s]),
            p.qty,
            100,
            p.r2,
            p.r7,
          ]);
        }
      } else {
        const skus = await variants();
        const policy = policySchema.parse(
          (await pool.query("SELECT body FROM planning_policies WHERE id=1"))
            .rows[0].body,
        );
        rows = [
          [
            "Mã SP",
            "Màu",
            "Size",
            "Số lượng kỳ xem",
            "Bán 2 ngày",
            "TB/ngày 2 ngày",
            "TB/ngày 7 ngày",
            "Tín hiệu bán",
            "Tồn đã khai báo",
            "Đang về",
            "SL đề xuất",
            "Vòng đời",
            "SL test",
            "Cơ sở tính",
          ],
          ...report.variants
            .filter((r) => r.qty > 0 && matches(r))
            .map((r) => {
              const old = skus.find(
                (s) =>
                  s.sku === r.sku &&
                  s.color.toLowerCase() === r.color.toLowerCase() &&
                  s.size === r.size,
              );
              const body = old
                ? (({ id, version, ...rest }) => rest)(old)
                : { sku: r.sku, color: r.color, size: r.size };
              const candidate = skuSchema.parse({
                ...body,
                day1: r.day1,
                day2: r.day2,
                abnormal: filters.mode === "7",
                manualRate: r.r7,
              });
              const f = forecast(candidate, policy);
              return [
                r.sku,
                r.color,
                r.size,
                r.qty,
                r.q2,
                r.r2,
                r.r7,
                r.signal,
                old?.stock ?? "CHƯA NHẬP TỒN",
                old?.inbound || 0,
                f.need,
                candidate.health,
                candidate.pilotQty,
                f.basis,
              ];
            }),
        ];
      }
    }
    const safe = (x: unknown) => {
      const s = String(x ?? "");
      return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
    };
    res.attachment(`comsflow-${kind}.${format}`);
    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook(),
        ws = wb.addWorksheet("COMS-FLOW");
      rows.forEach((r) =>
        ws.addRow(r.map((v) => (typeof v === "number" ? v : safe(v)))),
      );
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns.forEach((c) => (c.width = 22));
      res.type(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      await wb.xlsx.write(res);
      res.end();
    } else
      res
        .type("text/csv; charset=utf-8")
        .send(
          "\ufeff" +
            rows
              .map((r) =>
                r
                  .map((v) => '"' + safe(v).replaceAll('"', '""') + '"')
                  .join(","),
              )
              .join("\r\n"),
        );
  });
  app.use("/api", (_req, _res, next) =>
    next(new AppError(404, "API không tồn tại")),
  );
  if (production) {
    const dist = fileURLToPath(new URL("../dist/", import.meta.url));
    app.use(express.static(dist, { index: false }));
    app.get("/{*path}", (_req, res) => res.sendFile(dist + "index.html"));
  } else {
    app.get("/", (_req, res) => res.redirect(303, publicOrigin()));
  }
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const id = randomUUID();
    if (err instanceof z.ZodError)
      return res.status(400).json({
        message: "Dữ liệu không hợp lệ",
        errors: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    if (err instanceof AppError)
      return res.status(err.status).json({ message: err.message });
    if (err.code === "42P01")
      return res.status(503).json({
        message:
          "PostgreSQL chưa có đủ bảng dữ liệu. Cập nhật deployment mới để chạy migrations trước khi khởi động.",
      });
    if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P03"].includes(err.code))
      return res.status(503).json({
        message:
          "Backend chưa kết nối được PostgreSQL. Kiểm tra Postgres đang Online và DATABASE_URL tham chiếu đúng service.",
      });
    if (err.code === "23505")
      return res.status(409).json({
        message: "Dữ liệu hoặc mã đã tồn tại. Hãy tải lại và đối soát.",
      });
    if (err.code === "23503")
      return res.status(409).json({
        message: "Tham chiếu không hợp lệ hoặc dữ liệu đang được sử dụng",
      });
    console.error("Request failed", {
      id,
      type: err.constructor?.name,
      code: err.code,
    });
    return res.status(500).json({
      message: "Không thể hoàn tất thao tác; không có thay đổi nào được lưu.",
      requestId: id,
    });
  };
  app.use(errorHandler);
  return app;
}
