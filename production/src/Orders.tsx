import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Search,
  Download,
  Printer,
  Pencil,
  Trash2,
  PackagePlus,
  RotateCcw,
  Eye,
} from "lucide-react";
import { api, send } from "./api";
import { InspectionAttachments } from "./InspectionAttachments";
import {
  sizes,
  isActiveSize,
  priorities,
  goodsTypes,
  type GoodsType,
  statuses,
  forecast,
  skuSchema,
  orderSchema,
  totals,
  can,
  type ProductionOrder,
  type Variant,
  type OrderInput,
  type Role,
} from "../shared/domain";
import {
  Empty,
  Notice,
  Modal,
  Field,
  fmt,
  localTime,
  vnDate,
  type Run,
} from "./ui";
import { PendingProduction } from "./PendingProduction";
import { ProductionReport } from "./ProductionReport";
import { BulkOrderStatus } from "./BulkOrderStatus";
import { PriorityBadge, highestPriority, priorityClass } from "./Priority";
import type { Snapshot } from "./App";
import { productFor, type ProductProfile } from "../shared/product-profiles";
import { ProductPhoto } from "./ProductPhoto";
export function Orders({
  data,
  page,
  actor,
  run,
  busy,
  seed,
  clearSeed,
  openOrderId,
  clearOpenOrder,
}: {
  data: Snapshot;
  page: string;
  actor: { id: string; name: string; role: Role };
  run: Run;
  busy: boolean;
  seed: Variant[];
  clearSeed: () => void;
  openOrderId?: string | null;
  clearOpenOrder?: () => void;
}) {
  const [reportTab, setReportTab] = useState(false);
  const [checked, setChecked] = useState<string[]>([]),
    [bulkOrders, setBulkOrders] = useState<ProductionOrder[] | null>(null);
  const batchEnabled = page === "orders" && can(actor.role, "order");
  const eligible = (o: ProductionOrder) =>
    !o.deletedAt && !o.cancelled && totals(o).pending > 0;
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [editing, setEditing] = useState<ProductionOrder | "new" | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    order: ProductionOrder;
    name: string;
    label: string;
    returnToDetail: boolean;
  } | null>(null);
  useEffect(() => {
    if (openOrderId) {
      setSelected(openOrderId);
      clearOpenOrder?.();
    }
  }, [openOrderId]);
  const archived = page === "archived";
  useEffect(() => {
    if (seed.length && page === "orders") setEditing("new");
  }, [seed, page]);
  const all = data.orders.filter(
      (o) =>
        !!o.deletedAt === archived &&
        (page !== "orders" || o.items.some((i) => isActiveSize(i.size))),
    ),
    rows = all.filter(
      (o) =>
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
            .includes(search.toLowerCase())) &&
        (!filter ||
          (filter === "pending" && totals(o).pending > 0) ||
          (filter === "done" && !o.cancelled && !totals(o).pending) ||
          (filter === "cancelled" && o.cancelled)),
    );
  const selectedOrder = data.orders.find((o) => o.id === selected);
  const action = async (o: ProductionOrder, name: string, label: string) => {
    setPendingAction({
      order: o,
      name,
      label,
      returnToDetail: selected === o.id,
    });
    setSelected(null);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {archived ? "BẢO TOÀN DỮ LIỆU" : "02–03 / ĐIỀU PHỐI SẢN XUẤT"}
          </div>
          <h1>
            {archived
              ? "Lệnh sản xuất đã xóa"
              : page === "history"
                ? "Lịch sử & giao nhận"
                : "Gối lệnh sản xuất"}
          </h1>
          <p>
            {archived
              ? "Dữ liệu, biên nhận và nhật ký được giữ nguyên; có thể khôi phục."
              : "Từ nhu cầu sản xuất đến lần giao cuối cùng — theo dõi trên cùng một lệnh."}
          </p>
        </div>
        {!archived && can(actor.role, "order") && (
          <button className="primary" onClick={() => setEditing("new")}>
            <Plus size={17} />
            Tạo lệnh sản xuất
          </button>
        )}
      </div>
      <div
        className="mini-kpis"
        style={{ display: page === "orders" && reportTab ? "none" : undefined }}
      >
        {[
          ["Lệnh", all.length],
          ["Đã đặt", all.reduce((n, o) => n + totals(o).placed, 0)],
          ["Đã nhận", all.reduce((n, o) => n + totals(o).received, 0)],
          [
            "Còn chờ",
            all.reduce(
              (n, o) =>
                n +
                (archived
                  ? (o.pendingAtDeletion ?? totals(o).pending)
                  : totals(o).pending),
              0,
            ),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{fmt(Number(value))}</strong>
          </div>
        ))}
      </div>
      {page === "orders" &&
        all.some((o) => o.items.some((i) => !isActiveSize(i.size))) && (
          <Notice>
            Danh sách có chứng từ lịch sử chứa size đã ngừng. Tổng của lệnh giữ
            đúng chứng từ gốc; các báo cáo sản xuất chỉ tính S, M, L, XL. Xem
            chi tiết lệnh để đối soát phần lịch sử.
          </Notice>
        )}
      {page === "orders" && (
        <div className="tabs">
          <button
            className={!reportTab ? "active" : ""}
            onClick={() => setReportTab(false)}
          >
            Danh sách lệnh
          </button>
          <button
            className={reportTab ? "active" : ""}
            onClick={() => setReportTab(true)}
          >
            Báo cáo tỷ trọng sản phẩm
          </button>
        </div>
      )}
      {page === "orders" && reportTab && (
        <ProductionReport orders={data.orders} onOpen={setSelected} />
      )}
      <section
        className="panel"
        hidden={page === "orders" && reportTab}
        style={{ display: page === "orders" && reportTab ? "none" : undefined }}
      >
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              placeholder="Tìm mã lệnh, mã SP, màu, xưởng…"
              aria-label="Tìm lệnh"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Trạng thái giao hàng"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Chưa giao đủ</option>
            <option value="done">Đã giao đủ / vượt</option>
            <option value="cancelled">Đã hủy phần còn lại</option>
          </select>
          <span className="spacer" />
          <a
            className="button"
            href={
              "/api/export/" +
              (archived ? "archived" : "orders") +
              "?" +
              new URLSearchParams({ search, filter })
            }
          >
            <Download size={16} />
            CSV
          </a>
          <a
            className="button"
            href={
              "/api/export/" +
              (archived ? "archived" : "orders") +
              "?" +
              new URLSearchParams({ search, filter, format: "xlsx" })
            }
          >
            Excel
          </a>
        </div>
        {batchEnabled && (
          <div className="bulkbar">
            <strong>
              Đã chọn{" "}
              {
                checked.filter((id) =>
                  rows.some((o) => o.id === id && eligible(o)),
                ).length
              }{" "}
              lệnh đang xem
            </strong>
            <button
              disabled={
                busy ||
                rows.filter((o) => checked.includes(o.id) && eligible(o))
                  .length > 200 ||
                !checked.some((id) =>
                  rows.some((o) => o.id === id && eligible(o)),
                )
              }
              onClick={() =>
                setBulkOrders(
                  rows.filter((o) => checked.includes(o.id) && eligible(o)),
                )
              }
            >
              Đổi trạng thái hàng loạt
            </button>
            <button
              disabled={busy || !checked.length}
              onClick={() => setChecked([])}
            >
              Bỏ chọn lệnh
            </button>
            <small>
              Tối đa 200 lệnh/lần; chỉ áp dụng lệnh đã chọn trong kết quả đang
              xem. Lệnh hủy/giao đủ không được chọn.
            </small>
          </div>
        )}
        <div className="priority-legend">
          <span>Mức ưu tiên:</span>
          {priorities.map((p) => (
            <PriorityBadge key={p} value={p} />
          ))}
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {batchEnabled && (
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Chọn các lệnh hợp lệ đang xem"
                        disabled={busy || !rows.some(eligible)}
                        checked={
                          rows.some(eligible) &&
                          rows
                            .filter(eligible)
                            .every((o) => checked.includes(o.id))
                        }
                        onChange={(e) =>
                          setChecked(
                            e.target.checked
                              ? [
                                  ...new Set([
                                    ...checked,
                                    ...rows.filter(eligible).map((o) => o.id),
                                  ]),
                                ]
                              : checked.filter(
                                  (id) => !rows.some((o) => o.id === id),
                                ),
                          )
                        }
                      />
                    </th>
                  )}
                  {[
                    "Mã lệnh",
                    "Ưu tiên",
                    "Ngày lập",
                    "Nhà xưởng",
                    "Hẹn giao",
                    "Đã đặt",
                    "Đã nhận",
                    "Còn chờ",
                    "Tiến độ",
                    "Trạng thái giao hàng",
                    "Trạng thái nội bộ",
                    archived ? "Lý do xóa" : "Người đặt",
                    "Thao tác",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const t = totals(o);
                  return (
                    <tr key={o.id}>
                      {batchEnabled && (
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Chọn lệnh ${o.code}`}
                            checked={checked.includes(o.id) && eligible(o)}
                            disabled={busy || !eligible(o)}
                            onChange={(e) =>
                              setChecked(
                                e.target.checked
                                  ? [...new Set([...checked, o.id])]
                                  : checked.filter((id) => id !== o.id),
                              )
                            }
                          />
                        </td>
                      )}
                      <td className="product-code">{o.code}</td>
                      <td title="Mức ưu tiên cao nhất trong các dòng của lệnh">
                        <PriorityBadge value={highestPriority(o.items)} />
                      </td>
                      <td>{vnDate(o.time)}</td>
                      <td>{o.supplier}</td>
                      <td>{o.delivery || "Chưa hẹn"}</td>
                      <td>{fmt(t.placed)}</td>
                      <td>{fmt(t.received)}</td>
                      <td className="orange-text">
                        {fmt(
                          archived
                            ? (o.pendingAtDeletion ?? t.pending)
                            : t.pending,
                        )}
                      </td>
                      <td>
                        <div className="progress">
                          <i
                            style={{ width: Math.min(100, t.percent) + "%" }}
                          />
                        </div>
                        <small>{fmt(t.percent)}%</small>
                      </td>
                      <td>
                        <span
                          className={"badge " + (t.pending ? "orange" : "")}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>{o.status}</td>

                      <td className="color-cell">
                        {archived ? (
                          <>
                            {o.deletedReason}
                            <small>{vnDate(o.deletedAt || "")}</small>
                          </>
                        ) : (
                          o.requestedBy
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            title="Xem chi tiết / nhận hàng"
                            onClick={() => setSelected(o.id)}
                          >
                            <Eye size={15} />
                            Chi tiết
                          </button>
                          {!archived && can(actor.role, "order") && (
                            <button
                              title="Chỉnh sửa lệnh"
                              onClick={() => setEditing(o)}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {!archived && can(actor.role, "archive") && (
                            <button
                              title="Xóa mềm"
                              disabled={busy}
                              onClick={() =>
                                void action(
                                  o,
                                  "delete",
                                  "Chuyển lệnh vào lịch sử đã xóa",
                                )
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                          {archived && can(actor.role, "archive") && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action(o, "restore", "Khôi phục lệnh")
                              }
                            >
                              <RotateCcw size={15} />
                              Khôi phục
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {archived
              ? "Chưa có lệnh đã xóa phù hợp."
              : can(actor.role, "order")
                ? "Chưa có lệnh phù hợp. Tạo lệnh từ kế hoạch hoặc thêm SKU thủ công."
                : "Chưa có lệnh phù hợp. Vai trò hiện tại không được tạo lệnh; cần Production Planner hoặc Administrator."}
          </Empty>
        )}
      </section>
      {page === "orders" && !reportTab && (
        <PendingProduction orders={data.orders} onOpen={setSelected} />
      )}
      <Notice>
        Trạng thái “Đã gửi xưởng” là thông tin nội bộ. Ứng dụng chưa gửi email
        hoặc tin nhắn tới xưởng. Xóa mềm khác với hủy phần còn chờ.
      </Notice>
      {bulkOrders && (
        <BulkOrderStatus
          orders={bulkOrders}
          busy={busy}
          run={run}
          onClose={() => setBulkOrders(null)}
          onSaved={() => {
            setBulkOrders(null);
            setChecked([]);
          }}
        />
      )}
      {editing && (
        <OrderEditor
          key={editing === "new" ? "new" : editing.id}
          order={editing === "new" ? null : editing}
          seed={seed}
          data={data}
          actor={actor}
          busy={busy}
          run={run}
          onClose={() => {
            setEditing(null);
            clearSeed();
          }}
        />
      )}
      {pendingAction && (
        <OrderActionDialog
          key={pendingAction.order.id + pendingAction.name}
          request={pendingAction}
          run={run}
          busy={busy}
          onClose={() => {
            if (pendingAction.returnToDetail)
              setSelected(pendingAction.order.id);
            setPendingAction(null);
          }}
          onSaved={() => {
            if (
              pendingAction.returnToDetail &&
              !["delete", "restore"].includes(pendingAction.name)
            )
              setSelected(pendingAction.order.id);
            setPendingAction(null);
          }}
        />
      )}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          products={data.products || []}
          actor={actor}
          run={run}
          busy={busy}
          onClose={() => setSelected(null)}
          edit={() => {
            setSelected(null);
            setEditing(selectedOrder);
          }}
          action={action}
        />
      )}
    </>
  );
}
function OrderActionDialog({
  request,
  run,
  busy,
  onClose,
  onSaved,
}: {
  request: { order: ProductionOrder; name: string; label: string };
  run: Run;
  busy: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title={request.label} onClose={onClose}>
      <p>
        <b>{request.order.code}</b> · {request.order.supplier}
      </p>
      <Notice>
        {request.name === "delete"
          ? "Xóa mềm giữ toàn bộ dòng hàng, biên nhận và nhật ký. Có thể khôi phục trong Lệnh đã xóa."
          : request.name === "cancel"
            ? "Chỉ hủy phần chưa nhận; số đã nhận và biên bản giao nhận được giữ nguyên."
            : "Thao tác có kiểm tra phiên bản lệnh và ghi nhật ký người thực hiện."}
      </Notice>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              send(`/api/orders/${request.order.id}/${request.name}`, {
                expectedVersion: request.order.version,
                reason,
              }),
            "Đã cập nhật lệnh và lưu nhật ký",
          ).then((ok) => {
            if (ok) onSaved();
          });
        }}
      >
        <Field label="Lý do thao tác (bắt buộc)">
          <textarea
            required
            minLength={3}
            maxLength={450}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Quay lại
          </button>
          <button className="primary" disabled={busy}>
            Xác nhận thao tác
          </button>
        </div>
      </form>
    </Modal>
  );
}
function OrderEditor({
  order,
  seed,
  data,
  actor,
  busy,
  run,
  onClose,
}: {
  order: ProductionOrder | null;
  seed: Variant[];
  data: Snapshot;
  actor: { name: string };
  busy: boolean;
  run: Run;
  onClose: () => void;
}) {
  const defaultType = (sku: string) =>
    productFor(data.products || [], sku)?.goodsType || null;
  const [form, setForm] = useState<OrderInput>({
    code: order?.code,
    time: order?.time || new Date().toISOString(),
    supplier: order?.supplier || "",
    delivery: order?.delivery || null,
    requestedBy: order?.requestedBy || actor.name,
    notes: order?.notes || "",
    status: (order?.status || "Nháp") as OrderInput["status"],
    items: order
      ? order.items.map((i) => ({
          id: i.id,
          variantId: i.variantId,
          qty: i.qty,
          priority: i.priority as any,
          goodsType: i.goodsType ?? null,
        }))
      : seed.map((s) => ({
          variantId: s.id,
          qty: forecast(s, data.policy).need,
          goodsType: defaultType(s.sku),
          priority:
            forecast(s, data.policy).flag === "critical"
              ? "CẤP BÁCH"
              : "THƯỜNG",
        })),
  });
  const [draftSkus, setDraftSkus] = useState<Variant[]>([]);
  const [manual, setManual] = useState(!data.skus.length);
  const [newCode, setNewCode] = useState("");
  const [newColors, setNewColors] = useState("");
  const [validation, setValidation] = useState("");
  const catalogue = [...data.skus, ...draftSkus];
  const [reason, setReason] = useState(""),
    [reopen, setReopen] = useState(false),
    [code, setCode] = useState(""),
    [colors, setColors] = useState<string[]>([]),
    [quantities, setQuantities] = useState<Record<string, number>>({
      S: 1,
      M: 1,
      L: 1,
    }),
    [priority, setPriority] = useState<(typeof priorities)[number]>("THƯỜNG");
  const variants = new Map(catalogue.map((s) => [s.id, s]));
  const groups = new Map<
    string,
    { sku: string; color: string; items: OrderInput["items"] }
  >();
  for (const item of form.items) {
    const v = variants.get(item.variantId);
    if (!v) continue;
    const key = JSON.stringify([v.sku, v.color]);
    const g = groups.get(key) || { sku: v.sku, color: v.color, items: [] };
    g.items.push(item);
    groups.set(key, g);
  }
  const patch = (key: keyof OrderInput, value: unknown) =>
    setForm({ ...form, [key]: value });
  const locked = (item: OrderInput["items"][number]) =>
    Math.min(
      order?.items.find((i) => i.id === item.id)?.received || 0,
      order?.items.find((i) => i.id === item.id)?.qty || 0,
    );
  const add = () => {
    setValidation("");
    const sku = manual ? newCode.trim().toUpperCase() : code;
    const chosenColors = manual
      ? [
          ...new Set(
            newColors
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ]
      : colors;
    if (!sku || !chosenColors.length) {
      setValidation(
        "Chọn mã và ít nhất một màu, hoặc nhập mã/màu trong mục thêm thủ công.",
      );
      return;
    }
    if (
      sizes.some(
        (s) =>
          !Number.isInteger(quantities[s] || 0) ||
          (quantities[s] || 0) < 0 ||
          (quantities[s] || 0) > 1000000,
      ) ||
      !sizes.some((s) => (quantities[s] || 0) > 0)
    ) {
      setValidation(
        "Nhập ít nhất một size có số lượng nguyên từ 1 đến 1.000.000; các size khác để 0.",
      );
      return;
    }
    const list = form.items.map((i) => ({ ...i }));
    const created: Variant[] = [];
    for (const color of chosenColors)
      for (const size of sizes) {
        const qty = quantities[size] || 0;
        if (!qty) continue;
        let variant = [...catalogue, ...created].find(
          (s) =>
            s.sku.toUpperCase() === sku.toUpperCase() &&
            s.color.toLowerCase() === color.toLowerCase() &&
            s.size === size,
        );
        if (!variant) {
          const parsed = skuSchema.safeParse({ sku, color, size });
          if (!parsed.success) {
            setValidation(
              "Mã tối đa 90 ký tự, màu tối đa 200 ký tự; không được để trống.",
            );
            return;
          }
          variant = { ...parsed.data, id: crypto.randomUUID(), version: 1 };
          created.push(variant);
        }
        const old = list.find((i) => i.variantId === variant.id);
        if (old) {
          if (old.qty + qty > 1000000) {
            setValidation(
              "Tổng số lượng của một SKU không được vượt 1.000.000.",
            );
            return;
          }
          old.qty += qty;
          if (priority === "CẤP BÁCH" || old.priority === "THƯỜNG")
            old.priority = priority;
        } else
          list.push({
            variantId: variant.id,
            qty,
            priority,
            goodsType: defaultType(sku),
          });
      }
    setDraftSkus([...draftSkus, ...created]);
    setForm({ ...form, items: list });
    setValidation("");
  };
  function sizeCell(
    group: { sku: string; color: string; items: OrderInput["items"] },
    size: string,
  ) {
    const variant = catalogue.find(
        (v) =>
          v.sku === group.sku && v.color === group.color && v.size === size,
      ),
      item = group.items.find((i) => i.variantId === variant?.id);
    return (
      <input
        type="number"
        aria-label={`${group.sku} ${group.color} ${size}`}
        min={item ? locked(item) : 0}
        max="1000000"
        step="1"
        value={item?.qty || 0}
        disabled={busy || (!!order?.cancelled && !reopen)}
        onChange={(e) => {
          const qty = Number(e.target.value);
          let chosen = variant;
          if (!chosen && qty > 0) {
            chosen = {
              ...skuSchema.parse({ sku: group.sku, color: group.color, size }),
              id: crypto.randomUUID(),
              version: 1,
            };
            setDraftSkus([...draftSkus, chosen]);
          }
          if (!chosen) return;
          const variantId = chosen.id;
          const list = form.items.map((i) => ({ ...i }));
          const old = list.find((i) => i.variantId === variantId);
          if (old) {
            old.qty = qty;
          } else if (qty > 0)
            list.push({
              variantId,
              qty,
              priority: "THƯỜNG",
              goodsType: group.items.length
                ? (group.items[0].goodsType ?? null)
                : defaultType(group.sku),
            });
          patch("items", list);
        }}
      />
    );
  }
  return (
    <Modal
      title={order ? "Chỉnh sửa " + order.code : "Lập lệnh sản xuất"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setValidation("");
          const submitted = {
            ...form,
            items: form.items.filter((i) => i.qty !== 0 || locked(i) > 0),
          };
          if (!submitted.items.length) {
            setValidation(
              "Lệnh chưa có sản phẩm. Thêm mã/màu và số lượng theo size ở phần bên dưới trước khi lưu.",
            );
            return;
          }
          const parsed = orderSchema.safeParse(submitted);
          if (!parsed.success) {
            setValidation(
              "Kiểm tra mã lệnh, nhà xưởng, người đặt và số lượng nguyên từ 1 đến 1.000.000 trên từng SKU.",
            );
            return;
          }
          if (order && reason.trim().length < 3) {
            setValidation("Nhập lý do chỉnh sửa ít nhất 3 ký tự.");
            return;
          }
          if (form.items.some((i) => i.qty < locked(i))) {
            setValidation(
              "Số lượng đặt không được nhỏ hơn số đã nhận. Biên nhận cũ được giữ nguyên.",
            );
            return;
          }
          const newSkus = draftSkus
            .filter((s) => parsed.data.items.some((i) => i.variantId === s.id))
            .map(({ id, sku, color, size }) => ({ id, sku, color, size }));
          void run(
            () =>
              send(
                order
                  ? `/api/orders/${order.id}/compose`
                  : "/api/orders/compose",
                {
                  order: parsed.data,
                  newSkus,
                  ...(order
                    ? { expectedVersion: order.version, reason, reopen }
                    : {}),
                },
                order ? "PUT" : "POST",
              ),
            order ? "Đã lưu chỉnh sửa và nhật ký" : "Đã lưu lệnh sản xuất",
          ).then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <div className="form-grid columns-3">
          <Field label="Mã lệnh (để trống để sinh tự động)">
            <input
              value={form.code || ""}
              onChange={(e) =>
                patch("code", e.target.value.trim() || undefined)
              }
              placeholder="LSX-YYYYMMDD-01"
            />
          </Field>
          <Field label="Ngày giờ lập lệnh (Việt Nam)">
            <input
              type="datetime-local"
              required
              value={localTime(form.time)}
              onChange={(e) => {
                if (e.target.value)
                  patch(
                    "time",
                    new Date(e.target.value + ":00+07:00").toISOString(),
                  );
              }}
            />
          </Field>
          <Field label="Nhà xưởng">
            <input
              required
              list="suppliers"
              value={form.supplier}
              onChange={(e) => patch("supplier", e.target.value)}
            />
            <datalist id="suppliers">
              {[...new Set(data.orders.map((o) => o.supplier))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </datalist>
          </Field>
          <Field label="Ngày yêu cầu giao">
            <input
              type="date"
              value={form.delivery || ""}
              onChange={(e) => patch("delivery", e.target.value || null)}
            />
          </Field>
          <Field label="Người đặt lệnh">
            <input
              required
              value={form.requestedBy}
              onChange={(e) => patch("requestedBy", e.target.value)}
            />
          </Field>
          <Field label="Trạng thái nội bộ">
            <select
              value={form.status}
              onChange={(e) => patch("status", e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        {order?.cancelled && (
          <Notice>
            <label className="check-label">
              <input
                type="checkbox"
                checked={reopen}
                onChange={(e) => setReopen(e.target.checked)}
              />
              Khôi phục phần chưa nhận trước khi sửa số lượng
            </label>
          </Notice>
        )}
        {order?.items.some((i) => !isActiveSize(i.size)) && (
          <Notice>
            Lệnh có dòng size cũ đã ngừng kinh doanh. Các dòng đó giữ nguyên
            ngoài bảng nhập mới; xem số liệu gốc tại chi tiết/lịch sử lệnh.
          </Notice>
        )}
        <div className="table-scroll order-matrix">
          <table>
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Mã SP</th>
                <th>Loại hàng</th>
                <th>Màu</th>
                {sizes.map((s) => (
                  <th key={s}>{s}</th>
                ))}
                <th>Tổng</th>
                <th>Ưu tiên</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!groups.size && (
                <tr>
                  <td colSpan={sizes.length + 7} className="muted">
                    Lệnh chưa có sản phẩm. Thêm từ danh mục hoặc nhập mã/màu mới
                    bên dưới.
                  </td>
                </tr>
              )}
              {[...groups.entries()].map(([key, g]) => (
                <tr key={key}>
                  <td>
                    <ProductPhoto
                      products={data.products || []}
                      sku={g.sku}
                      color={g.color}
                    />
                  </td>
                  <td className="product-code">{g.sku}</td>
                  <td>
                    <select
                      aria-label={"Loại hàng " + g.sku + " " + g.color}
                      disabled={busy || (!!order?.cancelled && !reopen)}
                      value={
                        g.items.every(
                          (i) =>
                            (i.goodsType ?? null) ===
                            (g.items[0]?.goodsType ?? null),
                        )
                          ? g.items[0]?.goodsType || ""
                          : "__mixed__"
                      }
                      onChange={(e) =>
                        patch(
                          "items",
                          form.items.map((i) =>
                            g.items.includes(i)
                              ? {
                                  ...i,
                                  goodsType: (e.target.value ||
                                    null) as GoodsType | null,
                                }
                              : i,
                          ),
                        )
                      }
                    >
                      <option value="">Chưa chọn</option>
                      <option value="__mixed__" disabled>
                        Khác nhau theo size
                      </option>
                      {goodsTypes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="color-cell">{g.color}</td>
                  {sizes.map((size) => (
                    <td key={size}>{sizeCell(g, size)}</td>
                  ))}
                  <td>
                    <b>{fmt(g.items.reduce((n, i) => n + i.qty, 0))}</b>
                  </td>
                  <td>
                    <select
                      className={`priority-select ${priorityClass(highestPriority(g.items))}`}
                      aria-label={"Ưu tiên " + g.sku + " " + g.color}
                      disabled={busy || (!!order?.cancelled && !reopen)}
                      value={
                        g.items.some((i) => i.priority === "CẤP BÁCH")
                          ? "CẤP BÁCH"
                          : g.items.some((i) => i.priority === "ƯU TIÊN")
                            ? "ƯU TIÊN"
                            : "THƯỜNG"
                      }
                      onChange={(e) =>
                        patch(
                          "items",
                          form.items.map((i) =>
                            g.items.includes(i)
                              ? { ...i, priority: e.target.value }
                              : i,
                          ),
                        )
                      }
                    >
                      {priorities.map((p) => (
                        <option className={priorityClass(p)} key={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      title="Bỏ nhóm màu"
                      disabled={
                        g.items.some((i) => locked(i) > 0) ||
                        (!!order?.cancelled && !reopen)
                      }
                      onClick={() =>
                        patch(
                          "items",
                          form.items.filter((i) => !g.items.includes(i)),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4}>TỔNG CỘNG</th>
                {sizes.map((size) => (
                  <th key={size}>
                    {fmt(
                      form.items
                        .filter((i) => variants.get(i.variantId)?.size === size)
                        .reduce((n, i) => n + i.qty, 0),
                    )}
                  </th>
                ))}
                <th>
                  {fmt(
                    form.items
                      .filter((i) =>
                        sizes.some(
                          (s) => variants.get(i.variantId)?.size === s,
                        ),
                      )
                      .reduce((n, i) => n + i.qty, 0),
                  )}
                </th>
                <th colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        {order && (
          <small>
            Dòng đã có biên nhận giữ nguyên mã–màu–size; không được giảm số đặt
            dưới số đã nhận hoặc xóa nhóm có hàng nhận.
          </small>
        )}
        <section className="add-box">
          <h3>Thêm sản phẩm vào lệnh</h3>
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              aria-pressed={!manual}
              onClick={() => {
                setManual(false);
                setValidation("");
              }}
            >
              Chọn từ danh mục
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={manual}
              onClick={() => {
                setManual(true);
                setValidation("");
              }}
            >
              Nhập mã / màu mới
            </button>
          </div>
          {!catalogue.length && (
            <Notice>
              Danh mục đang trống. Chọn “Nhập mã / màu mới” để thêm ngay trong
              lệnh; không cần đóng cửa sổ.
            </Notice>
          )}
          <fieldset disabled={busy || (!!order?.cancelled && !reopen)}>
            <div className="form-grid">
              {manual ? (
                <>
                  <Field label="Mã sản phẩm mới hoặc đã có">
                    <input
                      value={newCode}
                      maxLength={90}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="MIU66"
                    />
                  </Field>
                  <Field label="Màu / phối màu — mỗi màu một dòng">
                    <textarea
                      value={newColors}
                      maxLength={4000}
                      onChange={(e) => setNewColors(e.target.value)}
                      placeholder="Trắng phối đen"
                    />
                  </Field>
                </>
              ) : (
                <Field label="Mã sản phẩm">
                  <select
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      const firstColor = catalogue.find(
                        (s) => s.sku === e.target.value,
                      )?.color;
                      setColors(firstColor ? [firstColor] : []);
                    }}
                  >
                    <option value="">Chọn mã</option>
                    {[...new Set(catalogue.map((s) => s.sku))].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              )}
              {(manual ? newCode.trim() : code) && (
                <div className="product-picker-preview">
                  <ProductPhoto
                    products={data.products || []}
                    sku={manual ? newCode.trim() : code}
                    color={
                      manual
                        ? newColors.trim().includes("\n")
                          ? undefined
                          : newColors.trim() || undefined
                        : colors.length === 1
                          ? colors[0]
                          : undefined
                    }
                  />
                  <span>
                    {manual ? newCode.trim().toUpperCase() : code}
                    <small>
                      Loại mặc định:{" "}
                      {defaultType(manual ? newCode.trim() : code) ||
                        "Chưa thiết lập"}
                    </small>
                  </span>
                </div>
              )}
              <Field label="Ưu tiên">
                <select
                  className={`priority-select ${priorityClass(priority)}`}
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as typeof priority)
                  }
                >
                  {priorities.map((p) => (
                    <option className={priorityClass(p)} key={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {!manual && (
              <div className="size-selector">
                {[
                  ...new Set(
                    catalogue.filter((s) => s.sku === code).map((s) => s.color),
                  ),
                ].map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={colors.includes(c)}
                      onChange={(e) =>
                        setColors(
                          e.target.checked
                            ? [...colors, c]
                            : colors.filter((x) => x !== c),
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
                {code && (
                  <button
                    type="button"
                    onClick={() =>
                      setColors([
                        ...new Set(
                          catalogue
                            .filter((s) => s.sku === code)
                            .map((s) => s.color),
                        ),
                      ])
                    }
                  >
                    Chọn tất cả màu
                  </button>
                )}
              </div>
            )}
            <div className="size-inputs">
              {sizes.map((s) => (
                <Field key={s} label={s}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    max="1000000"
                    value={quantities[s] || 0}
                    onChange={(e) =>
                      setQuantities({
                        ...quantities,
                        [s]: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || (!!order?.cancelled && !reopen)}
              onClick={add}
            >
              <Plus size={15} />
              Thêm các màu đã chọn
            </button>
          </fieldset>
          <small>
            Nhập số lượng rồi bấm “Thêm các màu đã chọn” để đưa vào bảng lệnh
            phía trên. SKU mới chỉ được ghi vào danh mục khi lưu lệnh thành
            công; mặc định Mở bán và CHƯA NHẬP TỒN.
          </small>
        </section>
        <Field label="Ghi chú gửi xưởng">
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes", e.target.value)}
          />
        </Field>
        {order && (
          <Field label="Lý do chỉnh sửa (bắt buộc)">
            <input
              required
              minLength={3}
              maxLength={450}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        <Notice>
          Lưu lệnh giữ nguyên trạng thái đã chọn; không tự gửi email/tin nhắn.
          Người thực hiện được lấy từ phiên đăng nhập, khác với trường “Người
          đặt lệnh”.
        </Notice>
        {validation && (
          <div className="form-error" role="alert">
            {validation}
          </div>
        )}
        {!form.items.length && (
          <Notice>
            Chưa thể lưu: lệnh cần ít nhất một mã–màu–size có số lượng lớn hơn
            0.
          </Notice>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Đóng, không lưu
          </button>
          <button className="primary" disabled={busy}>
            {order ? "Lưu chỉnh sửa và nhật ký" : "Lưu lệnh vào lịch sử"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function OrderDetail({
  order,
  products,
  actor,
  run,
  busy,
  onClose,
  edit,
  action,
}: {
  order: ProductionOrder;
  products: ProductProfile[];
  actor: { role: Role };
  run: Run;
  busy: boolean;
  onClose: () => void;
  edit: () => void;
  action: (o: ProductionOrder, name: string, label: string) => Promise<void>;
}) {
  const [history, setHistory] = useState<any>(null),
    [historyError, setHistoryError] = useState(""),
    [date, setDate] = useState(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
        new Date(),
      ),
    ),
    [note, setNote] = useState(""),
    [qty, setQty] = useState<Record<string, number>>({}),
    [receiptError, setReceiptError] = useState(""),
    [openedReceiptImages, setOpenedReceiptImages] = useState<string[]>([]);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  const t = totals(order),
    archived = !!order.deletedAt;
  useEffect(() => {
    void api(`/api/orders/${order.id}/history`)
      .then(setHistory)
      .catch((e) => setHistoryError(e.message));
  }, [order.id, order.version]);
  const receive = async () => {
    setReceiptError("");
    if (!date || !Object.values(qty).some((q) => q > 0)) {
      setReceiptError(
        "Chọn ngày nhận và nhập số lượng nhận cho ít nhất một SKU.",
      );
      return;
    }
    if (
      Object.entries(qty).some(
        ([id, q]) =>
          !Number.isInteger(q) ||
          q < 0 ||
          q > 1000000 ||
          !order.items.some((i) => i.id === id),
      )
    ) {
      setReceiptError(
        "Số nhận phải là số nguyên từ 0 đến 1.000.000 cho từng SKU trong đợt giao. Cho phép giao vượt số đặt.",
      );
      return;
    }
    const body = {
      expectedVersion: order.version,
      date,
      note,
      lines: Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([itemId, q]) => ({ itemId, qty: q })),
    };
    const payload = JSON.stringify(body);
    if (retry.current?.payload !== payload)
      retry.current = { payload, key: crypto.randomUUID() };
    const key = retry.current!.key;
    if (
      await run(
        () =>
          send(`/api/orders/${order.id}/receipts`, body, "POST", {
            "Idempotency-Key": key,
          }),
        "Đã ghi nhận đợt giao; tồn kho không thay đổi",
      )
    ) {
      setQty({});
      setNote("");
      retry.current = null;
    }
  };
  return (
    <Modal
      title={(archived ? "Lệnh đã xóa · " : "") + order.code}
      onClose={onClose}
      wide
    >
      <div className="print-order">
        <h2>LỆNH SẢN XUẤT · {order.code}</h2>
        <div className="order-summary">
          <div>
            <h3>{order.supplier}</h3>
            <p>
              Người đặt: {order.requestedBy} · Lập: {vnDate(order.time)}
            </p>
            <p>
              Hẹn giao: {order.delivery || "Chưa hẹn"} ·{" "}
              <span className="badge orange">{t.status}</span>
            </p>
            <p>{order.notes || "Không có ghi chú"}</p>
          </div>
          <div>
            <strong>{fmt(t.percent)}%</strong>
            <p>
              {fmt(t.received)} / {fmt(t.placed)} sản phẩm
            </p>
            <div className="progress">
              <i style={{ width: Math.min(100, t.percent) + "%" }} />
            </div>
          </div>
        </div>
        <div className="actions no-print">
          <a
            className="button"
            href={`/api/export/${archived ? "archived" : "orders"}?id=${order.id}&format=xlsx`}
          >
            <Download size={15} />
            Excel
          </a>
          <a
            className="button"
            href={`/api/export/${archived ? "archived" : "orders"}?id=${order.id}`}
          >
            CSV
          </a>
          <button onClick={() => window.print()}>
            <Printer size={15} />
            In / PDF
          </button>
          {!archived && can(actor.role, "order") && (
            <button onClick={edit}>
              <Pencil size={15} />
              Chỉnh sửa
            </button>
          )}
          {!archived && can(actor.role, "order") && (
            <button
              disabled={busy || (!t.pending && !order.cancelled)}
              onClick={() =>
                void action(
                  order,
                  order.cancelled ? "reopen" : "cancel",
                  order.cancelled
                    ? "Khôi phục phần chưa nhận"
                    : "Hủy phần còn chờ",
                )
              }
            >
              {order.cancelled
                ? "Khôi phục phần chưa nhận"
                : "Hủy phần còn chờ"}
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Ảnh",
                  "Mã SP",
                  "Loại hàng",
                  "Màu",
                  "Size",
                  "Ưu tiên",
                  "SL đặt",
                  "Đã nhận",
                  "Còn chờ",
                  "Giao dư",
                  "Nhận đợt này",
                ].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <ProductPhoto
                      products={products}
                      sku={i.sku}
                      color={i.color}
                    />
                  </td>
                  <td className="product-code">{i.sku}</td>
                  <td>
                    <span
                      className={
                        "badge " + (i.goodsType === "In" ? "orange" : "")
                      }
                    >
                      {i.goodsType || "Chưa chọn"}
                    </span>
                  </td>
                  <td className="color-cell">{i.color}</td>
                  <td>{i.size}</td>
                  <td>
                    <PriorityBadge value={i.priority} />
                  </td>
                  <td>{fmt(i.qty)}</td>
                  <td>{fmt(i.received)}</td>
                  <td>
                    {fmt(order.cancelled ? 0 : Math.max(0, i.qty - i.received))}
                  </td>
                  <td>{fmt(Math.max(0, i.received - i.qty))}</td>
                  <td>
                    {!archived &&
                    !order.cancelled &&
                    can(actor.role, "receive") ? (
                      <input
                        className="number-input"
                        type="number"
                        aria-label={
                          "Nhận " + i.sku + " " + i.color + " " + i.size
                        }
                        min="0"
                        max={1000000}
                        step="1"
                        disabled={busy}
                        value={qty[i.id] || 0}
                        onChange={(e) =>
                          setQty({ ...qty, [i.id]: Number(e.target.value) })
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {receiptError && (
        <div className="form-error" role="alert">
          {receiptError}
        </div>
      )}
      {!archived && can(actor.role, "receive") && !order.cancelled && (
        <div className="receipt-form no-print">
          <Field label="Ngày nhận hàng">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Ghi chú đợt giao">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Giao đợt 1, thiếu size M…"
            />
          </Field>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void receive()}
          >
            <PackagePlus size={16} />
            Ghi nhận hàng giao
          </button>
        </div>
      )}
      <Notice>
        Đã đặt {fmt(t.placed)} · Đã nhận {fmt(t.received)} · Còn chờ{" "}
        {fmt(t.pending)} · Giao dư {fmt(t.excess)}. Cho phép nhận vượt số đặt;
        tiến độ có thể vượt 100%. Thiếu hàng được tính riêng từng SKU. Biên nhận
        cũ bất biến. Ghi nhận hàng không tự cập nhật tồn kho.
      </Notice>
      <h3>Lịch sử các đợt giao</h3>
      {historyError && <Notice>{historyError}</Notice>}
      {!history && !historyError && <p>Đang tải lịch sử…</p>}
      {history?.receipts.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ngày nhận</th>
                <th>Người ghi nhận</th>
                <th>Mã / Màu / Size</th>
                <th>SL</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {history.receipts.flatMap((r: any) =>
                r.lines.map((l: any, i: number) => (
                  <tr key={r.id + "-" + i}>
                    <td>{r.date.slice(0, 10)}</td>
                    <td>{r.actor}</td>
                    <td>
                      {l.identity.sku} · {l.identity.color} · {l.identity.size}
                    </td>
                    <td>{l.qty}</td>
                    <td>{r.note}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        history && <p className="muted">Chưa ghi nhận đợt giao nào.</p>
      )}
      {!!history?.receipts.length && (
        <section className="no-print">
          <h3>Ảnh phiếu kiểm theo đợt nhận</h3>
          {history.receipts.map((r: any) => (
            <details
              key={r.id}
              className="inspection-receipt-group"
              onToggle={(e) => {
                if (e.currentTarget.open)
                  setOpenedReceiptImages((current) =>
                    current.includes(r.id) ? current : [...current, r.id],
                  );
              }}
            >
              <summary>
                Đợt nhận {String(r.date).slice(0, 10)} · {r.actor} ·{" "}
                {r.id.slice(0, 8)}
              </summary>
              {openedReceiptImages.includes(r.id) && (
                <InspectionAttachments
                  target={{ kind: "receipt", id: r.id }}
                  defaultDate={String(r.date).slice(0, 10)}
                  disabled={busy}
                  onChanged={() => {
                    void api(`/api/orders/${order.id}/history`)
                      .then(setHistory)
                      .catch((e) => setHistoryError(e.message));
                  }}
                />
              )}
            </details>
          ))}
        </section>
      )}
      {!!history?.sources?.length && (
        <section className="no-print">
          <h3>Phiếu kiểm kho đính kèm</h3>
          {history.sources.map((i: any) => (
            <p key={i.id}>
              <a
                href={`/api/orders/${order.id}/incoming-images/${i.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {i.name} · Mở ảnh gốc
              </a>
            </p>
          ))}
        </section>
      )}
      <h3>Nhật ký chỉnh sửa</h3>
      {history?.revisions.map((r: any) => (
        <details key={r.id}>
          <summary>
            {vnDate(r.at)} · {r.actor} · {r.reason}
          </summary>
          <div className="revision-grid">
            <div>
              <h4>Trước</h4>
              <pre>{JSON.stringify(r.before, null, 2)}</pre>
            </div>
            <div>
              <h4>Sau</h4>
              <pre>{JSON.stringify(r.after, null, 2)}</pre>
            </div>
          </div>
        </details>
      ))}
      {history && !history.revisions.length && (
        <p className="muted">Chưa có chỉnh sửa.</p>
      )}
      <h3>Hoạt động của lệnh</h3>
      {history?.activity
        .filter((a: any) => a.action === "v9.order.source")
        .map((a: any, i: number) => (
          <details key={"legacy-" + i}>
            <summary>
              Nguồn V9 — lịch sử trước khi nhập (danh tính chưa xác thực Lark)
            </summary>
            <p>
              Người nhập: {a.actor} · {vnDate(a.at)}. Danh tính trong dữ liệu cũ
              không đồng nghĩa tài khoản Lark đã xác minh.
            </p>
            <pre>{JSON.stringify(a.details.legacy, null, 2)}</pre>
          </details>
        ))}
      {history?.activity.map((a: any, i: number) => (
        <p key={i} className="activity-line">
          <strong>{a.actor}</strong> · {a.action} · {vnDate(a.at)}
          {a.details?.reason ? " · " + a.details.reason : ""}
        </p>
      ))}
    </Modal>
  );
}
