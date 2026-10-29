import { useEffect, useState } from "react";
import {
  Plus,
  Download,
  Upload,
  Search,
  Trash2,
  Pencil,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import {
  forecast,
  defaultPolicy,
  stages,
  sizes,
  type Variant,
  type Policy,
} from "../shared/domain";
import { SupplyActions } from "./SupplyActions";
import type { Snapshot } from "./App";
import { send, fileBase64 } from "./api";
import { Empty, Modal, Field, Notice, fmt, type Run } from "./ui";
import { ProductPhoto } from "./ProductPhoto";
import { productFor } from "../shared/product-profiles";
export function Planning({
  data,
  selected,
  setSelected,
  run,
  busy,
  writable,
  createOrder,
}: {
  data: Snapshot;
  selected: string[];
  setSelected: (v: string[]) => void;
  run: Run;
  busy: boolean;
  writable: boolean;
  createOrder: (rows?: Variant[]) => void;
}) {
  const [query, setQuery] = useState(""),
    [onlyNeed, setOnlyNeed] = useState(false),
    [stage, setStage] = useState(""),
    [adding, setAdding] = useState(false),
    [editing, setEditing] = useState<Variant | null>(null),
    [policy, setPolicy] = useState<Policy | null>(null),
    [bulk, setBulk] = useState(""),
    [bulkStage, setBulkStage] = useState<(typeof stages)[number]>("Mở bán"),
    [preview, setPreview] = useState<any>(null);
  const rows = data.skus.filter(
    (s) =>
      (!query ||
        (s.sku + " " + s.name + " " + s.color + " " + s.size)
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!stage || s.health === stage) &&
      (!onlyNeed || forecast(s, data.policy).need > 0),
  );
  async function update(s: Variant, patch: Partial<Variant>) {
    const { id, version, ...body } = s;
    return run(() =>
      send(
        "/api/skus/" + id,
        { expectedVersion: version, sku: { ...body, ...patch } },
        "PUT",
      ),
    );
  }
  const selectionTotal = data.skus
    .filter((s) => selected.includes(s.id))
    .reduce((n, s) => n + forecast(s, data.policy).need, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">01 / LẬP KẾ HOẠCH</div>
          <h1>Dự kiến sản xuất</h1>
          <p>
            Từng mã · từng màu · từng size. Gối hàng dựa trên quyết định của
            bạn.
          </p>
        </div>
        <div className="actions">
          <button onClick={() => setPolicy({ ...data.policy })}>
            <SlidersHorizontal size={16} />
            Chính sách tồn
          </button>
          {writable && (
            <button className="primary" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Thêm SKU / nhiều size
            </button>
          )}
        </div>
      </div>
      <div className="policy-strip">
        <span className="badge orange">
          CHUẨN {data.policy.targetDays} NGÀY
        </span>
        <span>
          {data.policy.includeLead
            ? `Cộng ${data.policy.leadDays} ngày chờ`
            : "Không cộng thời gian chờ"}{" "}
          · An toàn {data.policy.safeDays} ngày · Bội số {data.policy.roundTo}
        </span>
        <strong>Chỉ tự tính khi TĂNG TRƯỞNG</strong>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Tìm SKU"
              placeholder="Tìm mã sản phẩm, màu, size…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Lọc vòng đời"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">Tất cả vòng đời</option>
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="check-label">
            <input
              type="checkbox"
              checked={onlyNeed}
              onChange={(e) => setOnlyNeed(e.target.checked)}
            />
            Chỉ SKU cần đặt
          </label>
          <span className="spacer" />
          <a className="button" href="/api/export/skus?format=xlsx">
            <Download size={15} />
            Excel
          </a>
          <a className="button" href="/api/export/skus">
            <Download size={15} />
            CSV
          </a>
          <a className="button" href="/mau-nhap-ke-hoach.csv" download>
            File mẫu CSV
          </a>
          {writable && (
            <label className="button">
              <Upload size={15} />
              Nhập file
              <input
                hidden
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    void run(
                      async () =>
                        setPreview(
                          await send("/api/imports/planner/preview", {
                            filename: file.name,
                            base64: await fileBase64(file),
                          }),
                        ),
                      "Đã tạo bản xem trước",
                    );
                }}
              />
            </label>
          )}
        </div>
        {writable && (
          <div className="bulkbar">
            <strong>Đổi vòng đời theo mã</strong>
            <select
              aria-label="Mã đổi hàng loạt"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            >
              <option value="">Chọn mã</option>
              {[...new Set(data.skus.map((s) => s.sku))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Vòng đời hàng loạt"
              value={bulkStage}
              onChange={(e) => setBulkStage(e.target.value as typeof bulkStage)}
            >
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              disabled={!bulk || busy}
              onClick={() => {
                if (
                  confirm(`Đổi toàn bộ màu/size của ${bulk} sang ${bulkStage}?`)
                )
                  void run(() =>
                    send("/api/skus/bulk-stage", {
                      sku: bulk,
                      health: bulkStage,
                    }),
                  );
              }}
            >
              Áp dụng
            </button>
            <small>Không tự đổi vòng đời theo tín hiệu bán.</small>
          </div>
        )}
        <SupplyActions
          ids={(selected.length
            ? rows.filter((s) => selected.includes(s.id))
            : rows
          ).map((s) => s.id)}
          run={run}
          busy={busy}
          writable={writable}
        />
        {writable && (
          <div className="bulkbar">
            <button
              className="primary"
              disabled={
                busy ||
                !(
                  selected.length
                    ? rows.filter((s) => selected.includes(s.id))
                    : rows
                ).some((s) => forecast(s, data.policy).need > 0)
              }
              onClick={() =>
                createOrder(
                  (selected.length
                    ? rows.filter((s) => selected.includes(s.id))
                    : rows
                  ).filter((s) => forecast(s, data.policy).need > 0),
                )
              }
            >
              Lên lệnh nhanh
            </button>
            <small>
              Mở lệnh với số đề xuất của SKU đã chọn; nếu chưa chọn, lấy các SKU
              đang xem có nhu cầu. Cập nhật tồn và đối soát hàng đang về trước
              khi lên lệnh. Chưa lưu hoặc gửi xưởng.
            </small>
          </div>
        )}
        {rows.length ? (
          <div className="table-scroll planning-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      aria-label="Chọn các SKU đang xem"
                      type="checkbox"
                      checked={rows.every((s) => selected.includes(s.id))}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [
                                ...new Set([
                                  ...selected,
                                  ...rows.map((s) => s.id),
                                ]),
                              ]
                            : selected.filter(
                                (id) => !rows.some((s) => s.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  {[
                    "Ảnh",
                    "Mã SP",
                    "Loại mặc định",
                    "Màu / phối màu",
                    "Size",
                    "Bán ngày 1",
                    "Bán ngày 2",
                    "Bất thường / TB tay",
                    "TB/ngày",
                    "Tồn thực tế",
                    "Hàng đang về",
                    "Tồn mục tiêu",
                    "Cần đặt / Công thức",
                    "Ngày đủ hàng",
                    "Vòng đời",
                    "SL test",
                    "Cảnh báo",
                    "",
                  ].map((s, i) => (
                    <th key={i}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const f = forecast(s, data.policy);
                  return (
                    <tr key={s.id + "-" + s.version}>
                      <td>
                        {writable && (
                          <button
                            aria-label={"Sửa thông tin SKU " + s.id}
                            disabled={busy}
                            onClick={() => setEditing(s)}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        <input
                          aria-label={
                            "Chọn " + s.sku + " " + s.color + " " + s.size
                          }
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, s.id]
                                : selected.filter((id) => id !== s.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <ProductPhoto
                          products={data.products || []}
                          sku={s.sku}
                          color={s.color}
                        />
                      </td>
                      <td className="product-code">
                        {s.sku}
                        <small>{s.name}</small>
                      </td>
                      <td>
                        {productFor(data.products || [], s.sku)?.goodsType ||
                          "Chưa thiết lập"}
                      </td>
                      <td className="color-cell">{s.color}</td>
                      <td>
                        <span className="size-badge">{s.size}</span>
                      </td>
                      {(["day1", "day2"] as const).map((field) => (
                        <td key={field}>
                          <NumberInput
                            label={field + " " + s.sku + " " + s.size}
                            value={s[field]}
                            disabled={!writable || busy}
                            save={(v) => update(s, { [field]: v ?? 0 })}
                          />
                        </td>
                      ))}
                      <td>
                        <label className="check-label">
                          <input
                            aria-label={"Ngày bất thường " + s.id}
                            type="checkbox"
                            checked={s.abnormal}
                            disabled={!writable || busy}
                            onChange={(e) =>
                              void update(s, { abnormal: e.target.checked })
                            }
                          />
                          Dùng TB tay
                        </label>
                        {s.abnormal && (
                          <NumberInput
                            label={"TB chuẩn " + s.id}
                            value={s.manualRate}
                            disabled={!writable || busy}
                            save={(v) => update(s, { manualRate: v ?? 0 })}
                          />
                        )}
                      </td>
                      <td>{fmt(f.sale)}</td>
                      <td>
                        <NumberInput
                          label={"Tồn " + s.id}
                          value={s.stock}
                          disabled={!writable || busy}
                          nullable
                          integer
                          save={(stock) =>
                            update(s, {
                              stock,
                              inventorySource: "Nhập thủ công",
                              inventoryAt: new Date().toISOString(),
                            })
                          }
                        />
                        <small title={s.inventorySource}>
                          {s.stock === null
                            ? "CHƯA NHẬP TỒN"
                            : s.inventorySource}
                          <br />
                          {s.inventoryAt
                            ? new Date(s.inventoryAt).toLocaleDateString(
                                "vi-VN",
                              )
                            : ""}
                        </small>
                      </td>
                      <td>
                        <NumberInput
                          label={"Đang về " + s.id}
                          value={s.inbound}
                          integer
                          disabled={!writable || busy}
                          save={(v) => update(s, { inbound: v ?? 0 })}
                        />
                      </td>
                      <td>{f.target || "—"}</td>
                      <td className="formula">
                        <strong>{fmt(f.need)}</strong>
                        <small>{f.basis}</small>
                      </td>
                      <td>{f.cover === null ? "—" : fmt(f.cover)}</td>
                      <td>
                        <select
                          aria-label={"Vòng đời " + s.id}
                          disabled={!writable || busy}
                          value={s.health}
                          onChange={(e) =>
                            void update(s, {
                              health: e.target.value as Variant["health"],
                            })
                          }
                        >
                          {stages.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {s.health === "Mở bán" ? (
                          <NumberInput
                            label={"SL test " + s.id}
                            value={s.pilotQty}
                            integer
                            maximum={100000}
                            disabled={!writable || busy}
                            save={(v) => update(s, { pilotQty: v ?? 0 })}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (f.flag === "critical"
                              ? "red"
                              : f.flag === "warning"
                                ? "orange"
                                : "")
                          }
                        >
                          {(
                            {
                              critical: "CẤP BÁCH",
                              warning: "CẦN GỐI",
                              unknown: "THIẾU DỮ LIỆU",
                              new: "TEST THỦ CÔNG",
                              clear: "XẢ KHO",
                              paused: "DỪNG GỐI",
                              ok: "ĐỦ HÀNG",
                            } as any
                          )[f.flag] || f.flag}
                        </span>
                      </td>
                      <td>
                        {writable && (
                          <button
                            disabled={busy || f.need <= 0}
                            onClick={() => createOrder([s])}
                            aria-label={`Lên lệnh nhanh ${s.sku} ${s.color} ${s.size}`}
                          >
                            Lên lệnh nhanh
                          </button>
                        )}
                        {writable && (
                          <button
                            disabled={busy}
                            aria-label={"Xóa SKU " + s.id}
                            onClick={() => {
                              if (confirm("Xóa SKU chưa dùng trong lệnh?"))
                                void run(() =>
                                  send(
                                    "/api/skus/" + s.id,
                                    { expectedVersion: s.version },
                                    "DELETE",
                                  ),
                                );
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            Nhập SKU thủ công, file CSV/Excel hoặc chuyển số bán từ mục Phân
            tích bán hàng.
          </Empty>
        )}
        <div className="table-footer">
          <span>
            {rows.length} / {data.skus.length} SKU · Đã chọn {selected.length}
          </span>
          <strong>Đã chọn gối: {fmt(selectionTotal)} sp</strong>
          {writable && (
            <button
              className="primary"
              disabled={!selectionTotal || busy}
              onClick={() => createOrder()}
            >
              Đưa vào lệnh <ArrowRight size={16} />
            </button>
          )}
        </div>
      </section>
      <Notice>
        “Hàng đang về” chỉ trừ một lần trong dự báo. Giao nhận xưởng không tự
        tăng tồn; bấm Đối soát hàng đang về sau mỗi lần nhận để cập nhật phần
        còn chờ, và đối soát kho trước khi cập nhật tồn thực tế.
      </Notice>
      {adding && (
        <AddSku run={run} busy={busy} onClose={() => setAdding(false)} />
      )}
      {editing && (
        <EditSku
          sku={editing}
          busy={busy}
          run={run}
          onClose={() => setEditing(null)}
        />
      )}
      {policy && (
        <Modal title="Chính sách tồn kho" onClose={() => setPolicy(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                send(
                  "/api/policy",
                  { expectedVersion: data.policyVersion, policy },
                  "PUT",
                ),
              ).then((ok) => {
                if (ok) setPolicy(null);
              });
            }}
          >
            <div className="form-grid">
              {(
                [
                  ["targetDays", "Ngày tồn mục tiêu", 1, 45],
                  ["leadDays", "Ngày chờ xưởng", 0, 30],
                  ["safeDays", "Ngày tồn an toàn", 0, 20],
                  ["roundTo", "Bội số đặt hàng", 1, 1000],
                ] as const
              ).map(([key, label, min, max]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    required
                    min={min}
                    max={max}
                    value={policy[key]}
                    onChange={(e) =>
                      setPolicy({ ...policy, [key]: Number(e.target.value) })
                    }
                    disabled={!writable}
                  />
                </Field>
              ))}
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={policy.includeLead}
                disabled={!writable}
                onChange={(e) =>
                  setPolicy({ ...policy, includeLead: e.target.checked })
                }
              />
              Chủ động cộng thời gian chờ
            </label>
            <Notice>
              Chính sách mặc định 5 ngày, chờ 3, an toàn 0, bội số 1, không cộng
              chờ. SL test Mở bán không trừ tồn và không làm tròn bội.
            </Notice>
            {writable && (
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPolicy({ ...defaultPolicy })}
                >
                  Khôi phục mặc định V9
                </button>
                <button className="primary" disabled={busy}>
                  Lưu chính sách
                </button>
              </div>
            )}
          </form>
        </Modal>
      )}
      {preview && (
        <Modal title="Xem trước nhập kế hoạch" onClose={() => setPreview(null)}>
          <p>{JSON.stringify(preview.summary)}</p>
          {preview.warnings.map((s: string) => (
            <Notice key={s}>{s}</Notice>
          ))}
          {preview.errors.map((s: string) => (
            <p className="text-error" key={s}>
              {s}
            </p>
          ))}
          <button
            className="primary"
            disabled={busy || preview.errors.length > 0}
            onClick={() =>
              void run(
                () =>
                  send("/api/imports/planner/" + preview.id + "/confirm", {}),
                "Đã nhập kế hoạch",
              ).then((ok) => {
                if (ok) setPreview(null);
              })
            }
          >
            Xác nhận ghi dữ liệu
          </button>
        </Modal>
      )}
    </>
  );
}
function EditSku({
  sku,
  busy,
  run,
  onClose,
}: {
  sku: Variant;
  busy: boolean;
  run: Run;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ ...sku });
  return (
    <Modal title="Chỉnh sửa thông tin SKU" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const { id, version, ...body } = form;
          void run(() =>
            send(
              "/api/skus/" + id,
              { expectedVersion: version, sku: body },
              "PUT",
            ),
          ).then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <div className="form-grid">
          {(
            [
              ["sku", "Mã sản phẩm"],
              ["name", "Tên sản phẩm"],
              ["color", "Màu / phối màu"],
              ["inventorySource", "Nguồn dữ liệu tồn kho"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                required={key !== "name"}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Size">
            <select
              value={form.size}
              onChange={(e) =>
                setForm({ ...form, size: e.target.value as Variant["size"] })
              }
            >
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Notice>
          SKU đã được dùng trong lệnh không được đổi mã, màu hoặc size để giữ
          nguyên lịch sử. Hãy tạo SKU mới nếu cần định danh khác.
        </Notice>
        <button className="primary" disabled={busy}>
          Lưu thông tin SKU
        </button>
      </form>
    </Modal>
  );
}
export function NumberInput({
  value,
  save,
  label,
  disabled,
  nullable = false,
  integer = false,
  maximum = 1e9,
}: {
  value: number | null;
  save: (v: number | null) => Promise<boolean>;
  label: string;
  disabled: boolean;
  nullable?: boolean;
  integer?: boolean;
  maximum?: number;
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(String(value ?? ""));
    setError("");
  }, [value]);
  return (
    <>
      <input
        className="number-input"
        aria-label={label}
        type="number"
        min="0"
        step={integer ? "1" : "any"}
        max={maximum}
        disabled={disabled}
        value={draft}
        placeholder={nullable ? "Nhập tồn" : "0"}
        onChange={(e) => {
          setDraft(e.target.value);
          setError("");
        }}
        onBlur={async () => {
          const v = draft === "" && nullable ? null : Number(draft);
          if (
            v !== null &&
            (!Number.isFinite(v) ||
              v < 0 ||
              v > maximum ||
              (integer && !Number.isInteger(v)))
          ) {
            setError(
              `Nhập ${integer ? "số nguyên" : "số"} từ 0 đến ${maximum}. Chưa lưu thay đổi.`,
            );
            setDraft(String(value ?? ""));
            return;
          }
          if (v !== value && !(await save(v))) setDraft(String(value ?? ""));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {error && (
        <small className="text-error" role="alert">
          {error}
        </small>
      )}
    </>
  );
}
function AddSku({
  run,
  busy,
  onClose,
}: {
  run: Run;
  busy: boolean;
  onClose: () => void;
}) {
  const [sku, setSku] = useState(""),
    [name, setName] = useState(""),
    [colors, setColors] = useState(""),
    [chosen, setChosen] = useState<string[]>(["S", "M", "L"]);
  return (
    <Modal title="Thêm mã, màu và nhiều size" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => {
            const rows = [
              ...new Set(
                colors
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              ),
            ].flatMap((color) =>
              chosen.map((size) => ({ sku, name, color, size })),
            );
            return send("/api/skus/batch", rows);
          }, "Đã thêm SKU").then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <div className="form-grid">
          <Field label="Mã sản phẩm">
            <input
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="MIU66"
            />
          </Field>
          <Field label="Tên sản phẩm (nếu có)">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label="Màu / phối màu — mỗi màu một dòng">
          <textarea
            required
            value={colors}
            onChange={(e) => setColors(e.target.value)}
            placeholder="Trắng (phối tay đen)"
          />
        </Field>
        <div className="size-selector">
          {sizes.map((size) => (
            <label key={size}>
              <input
                type="checkbox"
                checked={chosen.includes(size)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, size]
                      : chosen.filter((s) => s !== size),
                  )
                }
              />
              {size}
            </label>
          ))}
        </div>
        <Notice>
          SKU mới mặc định Mở bán, CHƯA NHẬP TỒN. Hãy nhập tồn và chủ động chọn
          vòng đời trước khi dự báo.
        </Notice>
        <button className="primary" disabled={busy || !chosen.length}>
          Tạo{" "}
          {colors.split("\n").filter((s) => s.trim()).length * chosen.length}{" "}
          SKU
        </button>
      </form>
    </Modal>
  );
}
