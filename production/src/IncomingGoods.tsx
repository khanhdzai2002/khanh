import { useEffect, useRef, useState } from "react";
import { api, send, fileBase64 } from "./api";
import { can, sizes, totals, type Role } from "../shared/domain";
import {
  incomingFormSchema,
  incomingOrders,
  matchColor,
  normalizeLabel,
  type IncomingForm,
  type IncomingRow,
  type ColorAlias,
} from "../shared/incoming-goods";
import { Field, Notice, fmt, vnDate, type Run } from "./ui";
import type { Snapshot } from "./App";
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
      rows: [],
    });
  const [history, setHistory] = useState<any[]>([]),
    [aliases, setAliases] = useState<ColorAlias[]>([]),
    [status, setStatus] = useState<any>(null);
  const [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [checked, setChecked] = useState(false),
    [dirty, setDirty] = useState(false),
    [angle, setAngle] = useState(0),
    [showSource, setShowSource] = useState(true);
  const inFlight = useRef(false);
  const writable = can(role, "receive");
  const reload = async () => {
    const [h, a, s] = await Promise.all([
      api("/api/incoming"),
      api("/api/incoming/aliases"),
      api("/api/incoming/status"),
    ]);
    setHistory(h);
    setAliases(a);
    setStatus(s);
    return a as ColorAlias[];
  };
  useEffect(() => {
    if (writable) void reload().catch((e) => setError(e.message));
  }, [writable]);
  useEffect(() => {
    setChecked(false);
  }, [data.orders]);
  function suggest(rows: IncomingRow[], rules = aliases) {
    return rows.map((r) => {
      const color = matchColor(r.sku, r.color, data.skus, rules).color;
      const variant = data.skus.find(
        (v) =>
          normalizeLabel(v.sku) === normalizeLabel(r.sku) &&
          v.color === color &&
          v.size === r.size,
      );
      const variantId = r.variantId || variant?.id || null;
      const candidates = incomingOrders(data.orders, variantId);
      const pending = candidates.filter((o) =>
        o.items.some((i) => i.variantId === variantId && i.qty > i.received),
      );
      const choices = pending.length ? pending : candidates;
      return {
        ...r,
        variantId,
        orderId: r.orderId || (choices.length === 1 ? choices[0].id : null),
      };
    });
  }
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
      inFlight.current = false;
      setBusy(false);
    }
  };
  const load = async (id: string, rules = aliases) => {
    const d = await api(`/api/incoming/${id}`);
    setDraft(d);
    setForm({
      ...d.form,
      rows: d.state === "draft" ? suggest(d.form.rows, rules) : d.form.rows,
    });
    setChecked(false);
    setDirty(false);
    setConsent(false);
    setAngle(0);
  };
  const edit = (next: IncomingForm) => {
    setForm(next);
    setDirty(true);
    setChecked(false);
  };
  const patch = (id: string, change: Partial<IncomingRow>) =>
    edit({
      ...form,
      rows: form.rows.map((r) => (r.id === id ? { ...r, ...change } : r)),
    });
  const create = (withImages: boolean) =>
    act(async () => {
      if (
        dirty &&
        !window.confirm("Bỏ các thay đổi chưa lưu để tạo phiếu mới?")
      )
        return;
      if (
        withImages &&
        (!files.length ||
          files.length > 4 ||
          files.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024)
      )
        throw Error("Chọn từ 1 đến 4 ảnh, tổng dung lượng tối đa 8 MB.");
      const images = withImages
        ? await Promise.all(
            files.map(async (f) => ({
              name: f.name,
              data: await fileBase64(f),
            })),
          )
        : [];
      const d = await send("/api/incoming", { images });
      await load(d.id);
      await reload();
      setFiles([]);
      setMessage(
        "Đã tạo phiếu nháp. Chưa ghi nhận hàng, chưa gửi ảnh ra dịch vụ ngoài.",
      );
    });
  const save = () =>
    act(async () => {
      const valid = incomingFormSchema.safeParse(form);
      if (!valid.success)
        throw Error(
          "Điền mã, màu, ngày và ít nhất một dòng; số lượng phải là số nguyên 0–1.000.000 hoặc để trống chờ kiểm tra.",
        );
      const r = await send(
        `/api/incoming/${draft.id}`,
        { expectedVersion: draft.version, form: valid.data },
        "PUT",
      );
      setDraft({ ...draft, version: r.version });
      setDirty(false);
      await reload();
      setMessage("Đã lưu nháp. Chưa tạo biên nhận.");
    });
  const read = () =>
    act(async () => {
      if (!consent)
        throw Error("Cần đồng ý gửi ảnh đến OpenAI trước khi đọc ảnh.");
      const r = await send(`/api/incoming/${draft.id}/read`, {
        expectedVersion: draft.version,
        consent: true,
      });
      setDraft({ ...draft, version: r.version, ocr: r.ocr });
      setForm({ ...r.form, rows: suggest(r.form.rows) });
      setDirty(true);
      setChecked(false);
      await reload();
      setMessage(
        "Đã đọc ảnh. Kiểm tra từng ô, chọn màu và lệnh trước khi xác nhận.",
      );
    });
  const confirm = () =>
    act(async () => {
      const valid = incomingFormSchema.safeParse(form);
      if (!valid.success)
        throw Error(
          "Kiểm tra mã, màu, ngày và số lượng hợp lệ trước khi xác nhận.",
        );
      if (!checked)
        throw Error("Đánh dấu đã kiểm tra ảnh, số lượng và phân bổ lệnh.");
      if (form.rows.some((r) => r.qty === null))
        throw Error(
          "Còn ô số lượng trống; nhập 0 nếu đã kiểm tra thực tế không có hàng.",
        );
      const positive = form.rows.filter((r) => r.qty! > 0);
      if (!positive.length || positive.some((r) => !r.variantId || !r.orderId))
        throw Error("Chọn đúng màu danh mục và lệnh cho tất cả dòng có hàng.");
      const ids = [...new Set(positive.map((r) => r.orderId!))].sort();
      const orders = ids.map((id) => {
        const o = data.orders.find((o) => o.id === id);
        if (!o) throw Error("Lệnh không còn trong danh sách; tải lại dữ liệu.");
        return { id, version: o.version };
      });
      const body = {
        expectedVersion: draft.version,
        form: valid.data,
        checked: true,
        orders,
      };
      const ok = await run(async () => {
        const result = await send(`/api/incoming/${draft.id}/confirm`, body);
        setDraft({ ...draft, state: "confirmed", result });
        setDirty(false);
        setChecked(false);
      }, "Đã ghi nhận phiếu hàng về; tồn kho không thay đổi");
      if (ok) {
        await reload();
        setMessage("Đã ghi nhận hàng. Phiếu và biên nhận được lưu tập trung.");
      }
    });
  const viewOrder = (id: string) =>
    void act(async () => {
      if (dirty && draft?.state === "draft") {
        const valid = incomingFormSchema.safeParse(form);
        if (!valid.success)
          throw Error(
            "Lưu nháp hoặc sửa các trường chưa hợp lệ trước khi mở lệnh.",
          );
        const result = await send(
          `/api/incoming/${draft.id}`,
          { expectedVersion: draft.version, form: valid.data },
          "PUT",
        );
        setDraft({ ...draft, version: result.version });
        setDirty(false);
      }
      onOrder(id);
    });
  if (!writable)
    return (
      <>
        <h1>Nhập liệu hàng về</h1>
        <Notice>
          Cần vai trò Warehouse Operator hoặc Administrator để đọc phiếu và ghi
          nhận hàng. Không tự cấp quyền cho tài khoản hiện tại.
        </Notice>
      </>
    );
  const locked = busy || draft?.state === "confirmed";
  const quantity = form.rows.reduce((n, r) => n + (r.qty || 0), 0),
    unknown = form.rows.filter((r) => r.qty === null).length;
  const unresolved = form.rows.filter(
    (r) => r.qty! > 0 && (!r.variantId || !r.orderId),
  ).length;
  return (
    <div className="incoming-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TIẾP NHẬN THÀNH PHẨM</div>
          <h1>Nhập liệu hàng về</h1>
          <p>
            Ảnh phiếu kiểm → kiểm tra & ánh xạ → phân bổ lệnh → ghi nhận đợt
            giao.
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
      <section className="card incoming-panel">
        <h2>1. Tạo phiếu nhập</h2>
        <Field label="Ảnh phiếu kiểm kho">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </Field>
        <p>
          Tối đa 4 ảnh / 8 MB. Chụp rõ, đủ bốn góc. JPG, PNG, WebP; ảnh không
          được dùng làm số liệu thật trước khi xác nhận.
        </p>
        <div className="actions">
          <button
            disabled={busy || !files.length}
            className="primary"
            onClick={() => void create(true)}
          >
            Tạo phiếu từ ảnh{files.length ? ` (${files.length})` : ""}
          </button>
          <button disabled={busy} onClick={() => void create(false)}>
            Nhập bảng thủ công
          </button>
        </div>
        {status && !status.configured && (
          <Notice>
            Chưa cấu hình dịch vụ đọc ảnh. Có thể lưu ảnh và nhập bảng thủ công
            ngay. Administrator cần bổ sung INCOMING_OCR_API_KEY trong backend
            để bật đọc ảnh.
          </Notice>
        )}
      </section>
      {draft && (
        <>
          <section className="card incoming-panel">
            <h2>2. Kiểm tra và ánh xạ dữ liệu</h2>
            <p>
              Mã phiếu: {draft.id} ·{" "}
              {draft.state === "confirmed" ? "Đã ghi nhận — chỉ xem" : "Nháp"}
              {dirty ? " · Có thay đổi chưa lưu" : ""}
            </p>
            {!!draft.images?.length && (
              <button disabled={busy} onClick={() => setShowSource((v) => !v)}>
                {showSource
                  ? "Ẩn ảnh để mở rộng bảng"
                  : "Hiện ảnh để đối chiếu"}
              </button>
            )}
            <div
              className={`incoming-workspace ${!showSource || !draft.images?.length ? "incoming-wide" : ""}`}
            >
              <div className="incoming-images">
                {draft.images?.length > 0 ? (
                  <>
                    <button
                      onClick={() => setAngle((a) => (a + 90) % 360)}
                      disabled={busy}
                    >
                      Xoay ảnh 90°
                    </button>
                    {draft.images.map((i: any) => (
                      <figure key={i.id}>
                        <div className="incoming-image-frame">
                          <img
                            style={{ transform: `rotate(${angle}deg)` }}
                            src={`/api/incoming/${draft.id}/images/${i.id}`}
                            alt={i.name}
                          />
                        </div>
                        <figcaption>
                          {i.name} ·{" "}
                          <a
                            href={`/api/incoming/${draft.id}/images/${i.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Mở ảnh gốc
                          </a>
                        </figcaption>
                      </figure>
                    ))}
                  </>
                ) : (
                  <Notice>
                    Phiếu nhập bảng thủ công, chưa có ảnh đính kèm.
                  </Notice>
                )}
                {draft.state === "draft" && draft.images?.length > 0 && (
                  <div className="incoming-ocr">
                    <label>
                      <input
                        type="checkbox"
                        checked={consent}
                        disabled={busy}
                        onChange={(e) => setConsent(e.target.checked)}
                      />{" "}
                      Tôi đồng ý gửi ảnh phiếu này đến OpenAI để nhận dạng (có
                      tính phí API).
                    </label>
                    <button
                      disabled={
                        busy ||
                        !consent ||
                        !status?.configured ||
                        form.rows.length > 0
                      }
                      onClick={() => void read()}
                    >
                      Đọc ảnh & tạo bảng
                    </button>
                    <p>
                      Không đọc lại đè lên bảng đã có. Kết quả viết tay luôn cần
                      người kiểm tra.
                    </p>
                  </div>
                )}
                {draft.ocr?.warnings?.map((w: string, i: number) => (
                  <Notice key={i}>{w}</Notice>
                ))}
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
                    <b>{fmt(quantity)}</b> sản phẩm đang nhập
                  </span>
                  <span>
                    <b>{unknown}</b> ô chưa kiểm tra
                  </span>
                  <span>
                    <b>{unresolved}</b> dòng chưa khớp
                  </span>
                </div>
                {draft.ocr && !draft.ocr.date && (
                  <Notice>
                    Ảnh chưa nhận diện được ngày nhận. Ngày trên biểu mẫu đang
                    dùng ngày tạo phiếu; vui lòng sửa theo chứng từ thực tế.
                  </Notice>
                )}
                {draft.ocr && (
                  <p>
                    Tổng các ô đọc được ban đầu:{" "}
                    {fmt(
                      draft.ocr.rows.reduce(
                        (n: number, r: any) =>
                          n + sizes.reduce((s, k) => s + (r[k] || 0), 0),
                        0,
                      ),
                    )}
                    . Tổng hiện tại ở trên phản ánh số đã sửa/phân bổ.
                  </p>
                )}
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
                    onClick={() => {
                      edit({ ...form, rows: suggest(form.rows) });
                    }}
                  >
                    Gợi ý ánh xạ lại
                  </button>
                  <button
                    disabled={locked || !unknown}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Chỉ tiếp tục nếu đã kiểm tra ảnh và xác định mọi ô trống thực tế là 0. Điền 0 cho tất cả ô số lượng còn trống?",
                        )
                      )
                        edit({
                          ...form,
                          rows: form.rows.map((r) => ({
                            ...r,
                            qty: r.qty ?? 0,
                          })),
                        });
                    }}
                  >
                    Điền 0 ô trống đã kiểm tra
                  </button>
                </div>
                <p>
                  Bảng có thể cuộn ngang để chọn lệnh và thao tác. Ô chưa đọc rõ
                  để trống; chỉ điền 0 sau khi kiểm tra. Một SKU thuộc nhiều
                  lệnh: dùng “Tách dòng” và chia số lượng, không nhân đôi sản
                  lượng.
                </p>
                <div className="table-scroll">
                  <table className="incoming-table">
                    <thead>
                      <tr>
                        {[
                          "Bao",
                          "Mã trên phiếu",
                          "Màu viết trên phiếu",
                          "Size",
                          "Số nhận",
                          "Màu danh mục",
                          "Lệnh nhận",
                          "Quy ước",
                          "Thao tác",
                        ].map((t) => (
                          <th key={t}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {form.rows.map((r, index) => {
                        const productVariants = data.skus.filter(
                          (v) =>
                            normalizeLabel(v.sku) === normalizeLabel(r.sku) &&
                            v.size === r.size,
                        );
                        const chosen = data.skus.find(
                          (v) => v.id === r.variantId,
                        );
                        const candidates = incomingOrders(
                          data.orders,
                          r.variantId,
                        );
                        const suggestion = matchColor(
                          r.sku,
                          r.color,
                          data.skus,
                          aliases,
                        );
                        return (
                          <tr
                            key={r.id}
                            className={
                              r.qty === null ||
                              ((r.qty || 0) > 0 && (!r.variantId || !r.orderId))
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
                              <input
                                aria-label={`Mã dòng ${index + 1}`}
                                list="incoming-codes"
                                value={r.sku}
                                disabled={locked}
                                onChange={(e) =>
                                  patch(r.id, {
                                    sku: e.target.value,
                                    variantId: null,
                                    orderId: null,
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Màu phiếu dòng ${index + 1}`}
                                value={r.color}
                                disabled={locked}
                                onChange={(e) =>
                                  patch(r.id, {
                                    color: e.target.value,
                                    variantId: null,
                                    orderId: null,
                                  })
                                }
                              />
                              <small>{suggestion.source}</small>
                            </td>
                            <td>
                              <select
                                aria-label={`Size dòng ${index + 1}`}
                                value={r.size}
                                disabled={locked}
                                onChange={(e) =>
                                  patch(r.id, {
                                    size: e.target.value as IncomingRow["size"],
                                    variantId: null,
                                    orderId: null,
                                  })
                                }
                              >
                                {sizes.map((s) => (
                                  <option key={s}>{s}</option>
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
                                placeholder="Kiểm tra"
                                value={r.qty ?? ""}
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
                                aria-label={`Màu danh mục dòng ${index + 1}`}
                                value={r.variantId || ""}
                                disabled={locked}
                                onChange={(e) => {
                                  const variantId = e.target.value || null;
                                  const options = incomingOrders(
                                    data.orders,
                                    variantId,
                                  );
                                  patch(r.id, {
                                    variantId,
                                    orderId:
                                      options.length === 1
                                        ? options[0].id
                                        : null,
                                  });
                                }}
                              >
                                <option value="">
                                  Chọn màu / chưa tìm thấy
                                </option>
                                {productVariants.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.color}
                                  </option>
                                ))}
                              </select>
                              {chosen && (
                                <small>
                                  Đã chọn: {chosen.sku} · {chosen.color} ·{" "}
                                  {chosen.size}
                                </small>
                              )}
                            </td>
                            <td>
                              <select
                                aria-label={`Lệnh dòng ${index + 1}`}
                                value={r.orderId || ""}
                                disabled={locked}
                                onChange={(e) =>
                                  patch(r.id, {
                                    orderId: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">Chọn lệnh nhận</option>
                                {candidates.map((o) => {
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
                                <button
                                  className="link"
                                  onClick={() => viewOrder(r.orderId!)}
                                >
                                  Xem lệnh
                                </button>
                              )}
                            </td>
                            <td>
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label={`Ghi nhớ dòng ${index + 1}`}
                                  checked={r.remember}
                                  disabled={locked || !r.variantId}
                                  onChange={(e) =>
                                    patch(r.id, { remember: e.target.checked })
                                  }
                                />{" "}
                                Ghi nhớ theo mã
                              </label>
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
                                        qty: 0,
                                        orderId: null,
                                      },
                                    ],
                                  })
                                }
                              >
                                Tách dòng
                              </button>
                              <button
                                disabled={locked}
                                onClick={() =>
                                  edit({
                                    ...form,
                                    rows: form.rows.filter(
                                      (x) => x.id !== r.id,
                                    ),
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
                <datalist id="incoming-codes">
                  {[...new Set(data.skus.map((v) => v.sku))].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {!form.rows.length && (
                  <Notice>
                    Đọc ảnh để tạo bảng, hoặc bấm Thêm dòng hàng để nhập thủ
                    công.
                  </Notice>
                )}
                {draft.state === "draft" && (
                  <div className="incoming-confirm">
                    <Notice>
                      Cho nhận vượt số đặt. Không tự cộng tồn kho. Xác nhận sẽ
                      tạo biên nhận cho tất cả lệnh đã chọn trong một giao dịch;
                      lỗi một lệnh sẽ không ghi một phần.
                    </Notice>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={(e) => setChecked(e.target.checked)}
                      />{" "}
                      Tôi đã đối chiếu ảnh, mã, màu, size, ngày, số lượng và
                      phân bổ lệnh; đã sửa các ô không rõ.
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
                          !form.rows.length ||
                          !!unknown ||
                          !!unresolved
                        }
                        onClick={() => void confirm()}
                      >
                        Xác nhận ghi nhận hàng
                      </button>
                    </div>
                  </div>
                )}
                {draft.result && (
                  <div className="notice">
                    <div>
                      <strong>
                        Đã nhận {fmt(draft.result.received)} sản phẩm
                      </strong>
                      {draft.result.receipts.map((r: any) => (
                        <p key={r.receiptId}>
                          <button onClick={() => viewOrder(r.orderId)}>
                            {r.code} · {fmt(r.received)} sản phẩm · Xem lệnh
                          </button>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
      <section className="card incoming-panel">
        <h2>Phiếu của tôi — 100 phiếu gần nhất</h2>
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await reload();
            })
          }
        >
          Tải lại danh sách phiếu
        </button>
        <p>
          Lưu nháp trước khi rời trang. Ảnh trùng phiếu đã xác nhận bị chặn theo
          mã băm; ảnh chụp lại khác vẫn cần đối soát.
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
