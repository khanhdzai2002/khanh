import { useEffect, useRef, useState } from "react";
import { api, send, fileBase64 } from "./api";
import { can, sizes, totals, isActiveSize, type Role } from "../shared/domain";
import {
  incomingFormSchema,
  incomingOrders,
  normalizeLabel,
  type IncomingForm,
  type IncomingRow,
} from "../shared/incoming-goods";
import { Field, Notice, fmt, vnDate, type Run } from "./ui";
import type { Snapshot } from "./App";
type Preview = {
  id?: string;
  allocations: any[];
  unallocated: any[];
  orders: { id: string; version: number }[];
  entered: number;
  allocated: number;
  remaining: number;
  excess: number;
  balances?: any[];
  pendingBefore?: number;
  pendingAfter?: number;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
const emptyRow = (): IncomingRow => ({
  id: crypto.randomUUID(),
  sku: "",
  color: "",
  bag: "",
  size: "S",
  qty: null,
  variantId: null,
  orderId: null,
  remember: false,
  allocationMode: "auto",
  excessOrderId: null,
});
export function IncomingGoods({
  data,
  role,
  run,
  onOrder,
}: {
  data: Snapshot;
  role: Role;
  run: Run;
  onOrder: (id: string) => void;
}) {
  const [draft, setDraft] = useState<any>(null),
    [form, setForm] = useState<IncomingForm>({
      date: today(),
      note: "",
      supplier: "",
      rows: [],
    });
  const [history, setHistory] = useState<any[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [checked, setChecked] = useState(false);
  const [photoRatio, setPhotoRatio] = useState(1);
  const [angle, setAngle] = useState(0),
    [zoom, setZoom] = useState(100),
    [imageIndex, setImageIndex] = useState(0),
    [showSource, setShowSource] = useState(true);
  const inFlight = useRef(false),
    writable = can(role, "receive");
  const activeOrders = data.orders.filter((o) => !o.deletedAt && !o.cancelled);
  const variants = [
    ...new Map(
      activeOrders.flatMap((o) =>
        o.items
          .filter((i) => isActiveSize(i.size))
          .map(
            (i) =>
              [
                i.variantId,
                { id: i.variantId, sku: i.sku, color: i.color, size: i.size },
              ] as const,
          ),
      ),
    ).values(),
  ];
  const codes = [...new Set(variants.map((v) => v.sku))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  const suppliers = [...new Set(activeOrders.map((o) => o.supplier))].sort(
    (a, b) => a.localeCompare(b, "vi"),
  );
  const reload = async () => setHistory(await api("/api/incoming"));
  useEffect(() => {
    if (writable) void reload().catch((e) => setError(e.message));
  }, [writable]);
  useEffect(() => {
    setPreview(null);
    setChecked(false);
  }, [data.orders]);
  const act = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  const edit = (f: IncomingForm) => {
    setForm(f);
    setDirty(true);
    setChecked(false);
    setPreview(null);
  };
  const patch = (id: string, change: Partial<IncomingRow>) =>
    edit({
      ...form,
      rows: form.rows.map((r) =>
        r.id === id ? { ...r, ...change, remember: false } : r,
      ),
    });
  const load = async (id: string) => {
    const d = await api(`/api/incoming/${id}`);
    setDraft(d);
    setForm(
      d.state === "draft"
        ? {
            ...d.form,
            rows: d.form.rows.map((r: IncomingRow) => ({
              ...r,
              remember: false,
            })),
          }
        : d.form,
    );
    setPreview(d.state === "confirmed" ? d.result?.allocation || null : null);
    setDirty(false);
    setChecked(false);
    setAngle(0);
    setZoom(100);
    setImageIndex(0);
  };
  const create = (withImages: boolean) =>
    act(async () => {
      if (dirty && !window.confirm("Bỏ thay đổi chưa lưu để tạo phiếu khác?"))
        return;
      if (
        withImages &&
        (!files.length ||
          files.length > 4 ||
          files.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024)
      )
        throw Error("Chọn 1–4 ảnh, tổng dung lượng tối đa 8 MB");
      const images = withImages
        ? await Promise.all(
            files.map(async (f) => ({
              name: f.name,
              data: await fileBase64(f),
            })),
          )
        : [];
      const r = await send("/api/incoming", { images });
      await load(r.id);
      await reload();
      setFiles([]);
      setMessage(
        "Đã tạo phiếu. Xem ảnh và chọn mã–màu–size để nhập số lượng thực về.",
      );
    });
  const validForm = () => {
    const f = incomingFormSchema.safeParse(form);
    if (!f.success)
      throw Error(
        "Điền ngày, mã, màu và số lượng nguyên từ 0 đến 1.000.000; mỗi phiếu cần ít nhất một dòng.",
      );
    return f.data;
  };
  const save = () =>
    act(async () => {
      const r = await send(
        `/api/incoming/${draft.id}`,
        { expectedVersion: draft.version, form: validForm() },
        "PUT",
      );
      setDraft({ ...draft, version: r.version });
      setDirty(false);
      setPreview(null);
      setChecked(false);
      await reload();
      setMessage(
        "Đã lưu nháp. Chưa ghi nhận hàng; bấm Tự động cộng dồn lại khi cần xác nhận.",
      );
    });
  const allocate = () =>
    act(async () => {
      const f = validForm();
      if (f.rows.some((r) => (r.qty || 0) > 0 && !r.variantId))
        throw Error(
          "Chọn đúng mã–màu–size từ danh sách lệnh sản xuất cho các dòng có hàng",
        );
      const plan = await send(`/api/incoming/${draft.id}/allocate`, {
        expectedVersion: draft.version,
        form: f,
      });
      setPreview(plan);
      setChecked(false);
      setMessage(
        plan.remaining
          ? `Còn ${fmt(plan.remaining)} sản phẩm chưa phân bổ. Xem lý do bên dưới.`
          : "Đã tính phân bổ dự kiến. Kiểm tra bảng rồi xác nhận để ghi nhận hàng.",
      );
    });
  const confirm = () =>
    act(async () => {
      const f = validForm();
      if (!checked)
        throw Error("Cần xác nhận đã kiểm tra số lượng và phân bổ lệnh");
      const positive = f.rows.filter((r) => (r.qty || 0) > 0);
      const auto = positive.some((r) => r.allocationMode === "auto");
      if (
        f.rows.some((r) => r.qty === null) ||
        !positive.length ||
        positive.some((r) => !r.variantId)
      )
        throw Error("Kiểm tra số lượng và chọn đúng mã–màu–size");
      if (auto && (!preview?.id || preview.remaining))
        throw Error(
          "Bấm Tự động cộng dồn và xử lý hết hàng chưa phân bổ trước khi xác nhận",
        );
      const ids = [...new Set(positive.map((r) => r.orderId))].sort();
      const orders = auto
        ? preview!.orders
        : ids.map((id) => {
            const o = data.orders.find((o) => o.id === id);
            if (!o) throw Error("Chọn lệnh nhận cho tất cả dòng có hàng");
            return { id: o.id, version: o.version };
          });
      const body = {
        expectedVersion: draft.version,
        form: f,
        checked: true,
        orders,
        ...(auto ? { allocationPreviewId: preview!.id } : {}),
      };
      const ok = await run(async () => {
        const result = await send(`/api/incoming/${draft.id}/confirm`, body);
        setDraft({ ...draft, state: "confirmed", result });
        setPreview(result.allocation || null);
        setDirty(false);
        setChecked(false);
      }, "Đã ghi nhận hàng vào các lệnh; tồn kho không thay đổi");
      if (ok) {
        await reload();
        setMessage(
          "Đã ghi nhận thành công. Mở lệnh để xem số đã nhận, còn thiếu và tiến độ.",
        );
      }
    });
  const viewOrder = (id: string) =>
    void act(async () => {
      if (dirty && draft?.state === "draft") {
        const r = await send(
          `/api/incoming/${draft.id}`,
          { expectedVersion: draft.version, form: validForm() },
          "PUT",
        );
        setDraft({ ...draft, version: r.version });
        setDirty(false);
      }
      onOrder(id);
    });
  if (!writable)
    return (
      <>
        <h1>Nhập liệu hàng về</h1>
        <Notice>
          Cần vai trò Administrator hoặc Warehouse Operator để nhập và ghi nhận
          hàng.
        </Notice>
      </>
    );
  const locked = busy || draft?.state === "confirmed";
  const positive = form.rows.filter((r) => (r.qty || 0) > 0),
    auto = positive.some((r) => r.allocationMode === "auto");
  const unknown = form.rows.filter((r) => r.qty === null).length,
    unmatched = positive.filter(
      (r) => !r.variantId || (r.allocationMode !== "auto" && !r.orderId),
    ).length;
  const total = form.rows.reduce((n, r) => n + (r.qty || 0), 0);
  const photo = draft?.images?.[imageIndex];
  const displayedPreview =
    draft?.state === "confirmed" ? draft.result?.allocation : preview;
  return (
    <div className="incoming-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TIẾP NHẬN THÀNH PHẨM</div>
          <h1>Nhập liệu hàng về</h1>
          <p>
            Xem phiếu kiểm, nhập số lượng thực về và phân bổ vào các lệnh sản
            xuất.
          </p>
        </div>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <section className="incoming-panel">
        <h2>1. Ảnh phiếu kiểm</h2>
        <Field label="Ảnh phiếu kiểm kho">
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </Field>
        <p>
          Tối đa 4 ảnh / 8 MB. Ảnh được giữ để đối chiếu cùng bảng nhập tay.
        </p>
        <div className="actions">
          <button
            className="primary"
            disabled={busy || !files.length}
            onClick={() => void create(true)}
          >
            Tạo phiếu từ ảnh{files.length ? ` (${files.length})` : ""}
          </button>
          <button disabled={busy} onClick={() => void create(false)}>
            Nhập bảng không kèm ảnh
          </button>
        </div>
      </section>
      {draft && (
        <section className="incoming-panel">
          <h2>2. Nhập hàng và chọn cách cộng vào lệnh</h2>
          <p>
            Phiếu {draft.id.slice(0, 8)} ·{" "}
            {draft.state === "confirmed" ? "Đã ghi nhận — chỉ xem" : "Nháp"}
            {dirty ? " · Chưa lưu thay đổi" : ""}
          </p>
          {!!draft.images?.length && (
            <button disabled={busy} onClick={() => setShowSource((v) => !v)}>
              {showSource ? "Ẩn ảnh để mở rộng bảng" : "Hiện ảnh để đối chiếu"}
            </button>
          )}
          <div
            className={`incoming-workspace ${!showSource || !draft.images?.length ? "incoming-wide" : ""}`}
          >
            <div className="incoming-images">
              {photo && (
                <>
                  <Field label="Chọn ảnh phiếu">
                    <select
                      value={imageIndex}
                      onChange={(e) => {
                        setImageIndex(Number(e.target.value));
                        setAngle(0);
                        setZoom(100);
                      }}
                    >
                      {draft.images.map((i: any, n: number) => (
                        <option key={i.id} value={n}>
                          {n + 1}. {i.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="actions">
                    <button onClick={() => setAngle((a) => (a + 90) % 360)}>
                      Xoay ảnh 90°
                    </button>
                    <button
                      disabled={zoom <= 50}
                      onClick={() => setZoom((z) => Math.max(50, z - 25))}
                    >
                      Thu nhỏ
                    </button>
                    <button
                      disabled={zoom >= 300}
                      onClick={() => setZoom((z) => Math.min(300, z + 25))}
                    >
                      Phóng to
                    </button>
                    <span>{zoom}%</span>
                  </div>
                  <div className="incoming-photo-scroll">
                    <div
                      className="incoming-photo-canvas"
                      style={{
                        width: `${zoom}%`,
                        aspectRatio: angle % 180 ? 1 / photoRatio : photoRatio,
                      }}
                    >
                      <img
                        key={photo.id}
                        src={`/api/incoming/${draft.id}/images/${photo.id}`}
                        alt={photo.name}
                        onLoad={(e) =>
                          setPhotoRatio(
                            e.currentTarget.naturalWidth /
                              e.currentTarget.naturalHeight || 1,
                          )
                        }
                        style={{
                          width: `${angle % 180 ? photoRatio * 100 : 100}%`,
                          transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                      />
                    </div>
                  </div>
                  <p>
                    <a
                      href={`/api/incoming/${draft.id}/images/${photo.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở ảnh gốc ở cửa sổ riêng
                    </a>
                  </p>
                </>
              )}
            </div>
            <div className="incoming-editor">
              <div className="form-grid">
                <Field label="Ngày nhận hàng">
                  <input
                    type="date"
                    value={form.date}
                    disabled={locked}
                    onChange={(e) => edit({ ...form, date: e.target.value })}
                  />
                </Field>
                <Field label="Nhà xưởng trả hàng">
                  <select
                    value={form.supplier || ""}
                    disabled={locked}
                    onChange={(e) =>
                      edit({
                        ...form,
                        supplier: e.target.value,
                        rows: form.rows.map((r) => ({
                          ...r,
                          orderId: null,
                          excessOrderId: null,
                        })),
                      })
                    }
                  >
                    <option value="">
                      Chưa chọn — tự khớp khi chỉ có một xưởng
                    </option>
                    {suppliers.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ghi chú phiếu">
                  <textarea
                    value={form.note}
                    disabled={locked}
                    onChange={(e) => edit({ ...form, note: e.target.value })}
                  />
                </Field>
              </div>
              <div className="incoming-metrics">
                <span>
                  <b>{fmt(total)}</b> sản phẩm thực về
                </span>
                <span>
                  <b>{unknown}</b> ô chưa nhập
                </span>
                <span>
                  <b>{unmatched}</b> dòng chưa chọn đủ
                </span>
              </div>
              <div className="actions">
                <button
                  disabled={locked}
                  onClick={() =>
                    edit({ ...form, rows: [...form.rows, emptyRow()] })
                  }
                >
                  Thêm dòng hàng
                </button>
                <button
                  disabled={locked || !form.rows.length}
                  onClick={() =>
                    edit({
                      ...form,
                      rows: form.rows.map((r) => ({
                        ...r,
                        allocationMode: "auto",
                        orderId: null,
                      })),
                    })
                  }
                >
                  Chọn tự động cộng dồn tất cả
                </button>
              </div>
              <p>
                Mã và màu lấy từ các lệnh sản xuất đang lưu. Đổi mã sẽ cập nhật
                danh sách màu tương ứng. Bảng có thể cuộn ngang.
              </p>
              <div className="table-scroll">
                <table className="incoming-table">
                  <thead>
                    <tr>
                      {[
                        "Bao",
                        "Mã trên phiếu",
                        "Màu trên phiếu",
                        "Size",
                        "Số nhận",
                        "Lệnh nhận",
                        "Lệnh nhận phần dư (nếu có)",
                        "Thao tác",
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.rows.map((r, index) => {
                      const colors = [
                        ...new Set(
                          variants
                            .filter((v) => v.sku === r.sku)
                            .map((v) => v.color),
                        ),
                      ].sort((a, b) => a.localeCompare(b, "vi"));
                      const candidateSizes = variants
                        .filter((v) => v.sku === r.sku && v.color === r.color)
                        .map((v) => v.size);
                      const options = incomingOrders(
                        data.orders,
                        r.variantId,
                      ).filter(
                        (o) => !form.supplier || o.supplier === form.supplier,
                      );
                      const pick = (
                        sku: string,
                        color: string,
                        size: IncomingRow["size"],
                      ) => {
                        const v = variants.find(
                          (v) =>
                            v.sku === sku &&
                            v.color === color &&
                            v.size === size,
                        );
                        patch(r.id, {
                          sku,
                          color,
                          size,
                          variantId: v?.id || null,
                          orderId: null,
                          excessOrderId: null,
                        });
                      };
                      return (
                        <tr
                          key={r.id}
                          className={
                            r.qty === null ||
                            ((r.qty || 0) > 0 &&
                              (!r.variantId ||
                                (r.allocationMode !== "auto" && !r.orderId)))
                              ? "incoming-unresolved"
                              : ""
                          }
                        >
                          <td>
                            <input
                              aria-label={`Bao dòng ${index + 1}`}
                              value={r.bag}
                              disabled={locked}
                              onChange={(e) =>
                                patch(r.id, { bag: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Mã dòng ${index + 1}`}
                              value={r.sku}
                              disabled={locked}
                              onChange={(e) => pick(e.target.value, "", r.size)}
                            >
                              <option value="">Chọn mã sản phẩm</option>
                              {r.sku && !codes.includes(r.sku) && (
                                <option value={r.sku}>
                                  {r.sku} — chọn lại từ danh mục
                                </option>
                              )}
                              {codes.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label={`Màu dòng ${index + 1}`}
                              value={r.color}
                              disabled={locked || !r.sku}
                              onChange={(e) => {
                                const color = e.target.value;
                                const valid = variants.filter(
                                  (v) => v.sku === r.sku && v.color === color,
                                );
                                const size = valid.some(
                                  (v) => v.size === r.size,
                                )
                                  ? r.size
                                  : sizes.find((s) =>
                                      valid.some((v) => v.size === s),
                                    ) || r.size;
                                pick(r.sku, color, size);
                              }}
                            >
                              <option value="">Chọn màu của mã</option>
                              {r.color && !colors.includes(r.color) && (
                                <option value={r.color}>
                                  {r.color} — chọn lại màu chuẩn
                                </option>
                              )}
                              {colors.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label={`Size dòng ${index + 1}`}
                              value={r.size}
                              disabled={locked}
                              onChange={(e) =>
                                pick(
                                  r.sku,
                                  r.color,
                                  e.target.value as IncomingRow["size"],
                                )
                              }
                            >
                              {sizes.map((s) => (
                                <option
                                  key={s}
                                  disabled={
                                    !!r.color && !candidateSizes.includes(s)
                                  }
                                >
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`Số nhận dòng ${index + 1}`}
                              type="number"
                              min="0"
                              max="1000000"
                              step="1"
                              value={r.qty ?? ""}
                              placeholder="Nhập SL"
                              disabled={locked}
                              onChange={(e) =>
                                patch(r.id, {
                                  qty:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Lệnh dòng ${index + 1}`}
                              value={
                                r.allocationMode === "auto"
                                  ? "auto"
                                  : r.orderId || ""
                              }
                              disabled={locked}
                              onChange={(e) =>
                                patch(r.id, {
                                  allocationMode:
                                    e.target.value === "auto"
                                      ? "auto"
                                      : "manual",
                                  orderId:
                                    e.target.value === "auto"
                                      ? null
                                      : e.target.value || null,
                                  excessOrderId: null,
                                })
                              }
                            >
                              <option value="">Chọn lệnh thủ công</option>
                              <option value="auto">Tự động cộng dồn</option>
                              {options.map((o) => {
                                const i = o.items.find(
                                  (i) => i.variantId === r.variantId,
                                )!;
                                return (
                                  <option key={o.id} value={o.id}>
                                    {o.code} · {o.supplier} · còn{" "}
                                    {Math.max(0, i.qty - i.received)} ·{" "}
                                    {totals(o).status}
                                  </option>
                                );
                              })}
                            </select>
                            {r.orderId && (
                              <button onClick={() => viewOrder(r.orderId!)}>
                                Xem lệnh
                              </button>
                            )}
                          </td>
                          <td>
                            {r.allocationMode === "auto" ? (
                              <select
                                aria-label={`Lệnh nhận dư dòng ${index + 1}`}
                                value={r.excessOrderId || ""}
                                disabled={locked}
                                onChange={(e) =>
                                  patch(r.id, {
                                    excessOrderId: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">Không tự gán hàng dư</option>
                                {options
                                  .filter(
                                    (o) =>
                                      (form.includeDrafts ||
                                        o.status !== "Nháp") &&
                                      (form.includePaused ||
                                        o.status !== "Tạm dừng"),
                                  )
                                  .map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.code} · {o.supplier}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <button
                              disabled={locked}
                              onClick={() =>
                                edit({
                                  ...form,
                                  rows: [
                                    ...form.rows,
                                    {
                                      ...r,
                                      id: crypto.randomUUID(),
                                      qty: null,
                                      orderId: null,
                                      allocationMode: "auto",
                                      excessOrderId: null,
                                      remember: false,
                                    },
                                  ],
                                })
                              }
                            >
                              Thêm size / dòng tương tự
                            </button>
                            <button
                              disabled={locked}
                              onClick={() =>
                                edit({
                                  ...form,
                                  rows: form.rows.filter((x) => x.id !== r.id),
                                })
                              }
                            >
                              Bỏ dòng
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!form.rows.length && (
                <Notice>
                  Bấm Thêm dòng hàng, chọn mã–màu–size rồi nhập số lượng từ
                  phiếu kiểm.
                </Notice>
              )}
              {draft.state === "draft" && (
                <div className="incoming-confirm">
                  <div className="actions">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!form.includeDrafts}
                        disabled={busy}
                        onChange={(e) =>
                          edit({ ...form, includeDrafts: e.target.checked })
                        }
                      />{" "}
                      Cho phép cộng vào lệnh Nháp
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!form.includePaused}
                        disabled={busy}
                        onChange={(e) =>
                          edit({ ...form, includePaused: e.target.checked })
                        }
                      />{" "}
                      Cho phép cộng vào lệnh Tạm dừng
                    </label>
                  </div>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !positive.length ||
                      !!unknown ||
                      positive.some((r) => !r.variantId)
                    }
                    onClick={() => void allocate()}
                  >
                    Tự động cộng dồn — xem phân bổ
                  </button>
                  <Notice>
                    Ưu tiên ngày lập lệnh cũ trước; chỉ cộng đúng mã–màu–size,
                    trừ số đã nhận. Lệnh xóa/hủy không được nhận; Nháp/Tạm dừng
                    chỉ tham gia tự động khi bật ở trên. Phân bổ là xem trước,
                    chưa ghi nhận hàng.
                  </Notice>
                </div>
              )}
              {displayedPreview && (
                <section className="incoming-allocation">
                  <h3>
                    {draft.state === "confirmed"
                      ? "Phân bổ đã ghi nhận"
                      : "Phân bổ dự kiến — chưa ghi nhận"}
                  </h3>
                  <div className="incoming-metrics">
                    <span>
                      <b>{fmt(displayedPreview.allocated)}</b> đã phân bổ
                    </span>
                    <span>
                      <b>{fmt(displayedPreview.remaining)}</b> chưa phân bổ
                    </span>
                    <span>
                      <b>{fmt(displayedPreview.excess)}</b> giao dư đã chọn lệnh
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Lệnh",
                            "Mã",
                            "Màu",
                            "Size",
                            "Còn thiếu trước",
                            "Nhận phiếu này",
                            "Còn thiếu sau",
                            "Giao dư",
                          ].map((t) => (
                            <th key={t}>{t}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayedPreview.allocations.map(
                          (a: any, i: number) => (
                            <tr key={i}>
                              <td>
                                <button
                                  disabled={busy}
                                  onClick={() => viewOrder(a.orderId)}
                                >
                                  {a.code}
                                </button>
                              </td>
                              <td>{a.sku}</td>
                              <td>{a.color}</td>
                              <td>{a.size}</td>
                              <td>{fmt(a.pendingBefore)}</td>
                              <td>{fmt(a.qty)}</td>
                              <td>{fmt(a.pendingAfter)}</td>
                              <td>{fmt(a.excess)}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  {!!displayedPreview.balances?.length && (
                    <>
                      <h4>Còn thiếu theo mã–màu–size sau phiếu này</h4>
                      <p>
                        Tính cả lệnh phù hợp chưa cần phân bổ, theo xưởng và tùy
                        chọn Nháp/Tạm dừng đang chọn.
                      </p>
                      <div className="table-scroll">
                        <table className="incoming-balances">
                          <thead>
                            <tr>
                              <th>Mã</th>
                              <th>Màu</th>
                              <th>Size</th>
                              <th>Tổng thiếu trước</th>
                              <th>Nhận phiếu này</th>
                              <th>Tổng còn thiếu sau</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayedPreview.balances.map((b: any) => (
                              <tr key={b.variantId}>
                                <td>{b.sku}</td>
                                <td>{b.color}</td>
                                <td>{b.size}</td>
                                <td>{fmt(b.pendingBefore)}</td>
                                <td>{fmt(b.receivedNow)}</td>
                                <td>{fmt(b.pendingAfter)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {displayedPreview.unallocated.map((r: any, i: number) => (
                    <Notice key={i}>
                      {r.sku} · {r.color} · {r.size}: còn {fmt(r.qty)} sản phẩm
                      — {r.reason}
                    </Notice>
                  ))}
                </section>
              )}
              {draft.state === "draft" && (
                <div className="incoming-confirm">
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={
                        busy || (auto && (!preview || !!preview.remaining))
                      }
                      onChange={(e) => setChecked(e.target.checked)}
                    />{" "}
                    Tôi đã kiểm tra ảnh, số lượng và phân bổ vào từng lệnh.
                  </label>
                  <div className="actions">
                    <button
                      disabled={busy || !form.rows.length}
                      onClick={() => void save()}
                    >
                      Lưu nháp
                    </button>
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !checked ||
                        !positive.length ||
                        !!unknown ||
                        !!unmatched ||
                        (auto && (!preview?.id || !!preview.remaining))
                      }
                      onClick={() => void confirm()}
                    >
                      Xác nhận ghi nhận hàng
                    </button>
                  </div>
                  <p>
                    Ghi nhận toàn bộ trong một giao dịch. Tồn kho không tự thay
                    đổi. Lưu nháp hoặc sửa bảng sẽ yêu cầu tính lại phân bổ.
                  </p>
                </div>
              )}
              {draft.result && (
                <Notice>
                  <span>
                    Đã nhận {fmt(draft.result.received)} sản phẩm.
                    {draft.result.receipts.map((r: any) => (
                      <p key={r.receiptId}>
                        <button
                          disabled={busy}
                          onClick={() => viewOrder(r.orderId)}
                        >
                          {r.code} · {fmt(r.received)} sản phẩm · Xem lệnh
                        </button>
                      </p>
                    ))}
                  </span>
                </Notice>
              )}
            </div>
          </div>
        </section>
      )}
      <section className="incoming-panel">
        <h2>Phiếu của tôi — 100 phiếu gần nhất</h2>
        <button disabled={busy} onClick={() => void act(reload)}>
          Tải lại danh sách phiếu
        </button>
        <p>
          Lưu nháp trước khi rời trang. Ảnh đã xác nhận không nhập lại thành
          phiếu mới.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Phiếu</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Sản lượng</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.id.slice(0, 8)}</td>
                  <td>{vnDate(h.created_at)}</td>
                  <td>{h.state === "confirmed" ? "Đã ghi nhận" : "Nháp"}</td>
                  <td>{h.result ? fmt(h.result.received) : "Chưa ghi"}</td>
                  <td>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          if (
                            dirty &&
                            !window.confirm(
                              "Bỏ thay đổi chưa lưu để mở phiếu khác?",
                            )
                          )
                            return;
                          await load(h.id);
                        })
                      }
                    >
                      Mở phiếu
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {busy && (
        <div className="working" role="status">
          Đang xử lý phiếu…
        </div>
      )}
    </div>
  );
}
