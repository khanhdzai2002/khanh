import { useMemo, useState } from "react";
import {
  pendingProduction,
  type PendingFilters,
} from "../shared/pending-production";
import { sizes, statuses, type ProductionOrder } from "../shared/domain";
import { Field, Notice, Empty, Modal, fmt } from "./ui";
const palette = [
  "#EE741F",
  "#2563EB",
  "#0D9488",
  "#8B5CF6",
  "#DB2777",
  "#B45309",
  "#475569",
  "#65A30D",
  "#9CA3AF",
];
export function PendingProduction({
  orders,
  onOpen,
}: {
  orders: ProductionOrder[];
  onOpen: (id: string) => void;
}) {
  const [filters, setFilters] = useState<Partial<PendingFilters>>({}),
    [expanded, setExpanded] = useState<string[]>([]),
    [limit, setLimit] = useState(100);
  const invalid = !!filters.from && !!filters.to && filters.from > filters.to;
  const result = useMemo(
    () =>
      pendingProduction(
        orders,
        invalid ? { ...filters, from: undefined, to: undefined } : filters,
      ),
    [orders, filters, invalid],
  );
  const active = orders.filter((o) => !o.deletedAt && !o.cancelled);
  const set = (key: keyof PendingFilters, value: string) => {
    setFilters((f) => ({
      ...f,
      [key]: value || undefined,
      ...(key === "sku" && f.sku !== value ? { color: undefined } : {}),
    }));
    setLimit(100);
  };
  const url = (format: string) =>
    "/api/export/pending-production?" +
    new URLSearchParams({
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      format,
    });
  const circumference = 2 * Math.PI * 84;
  let offset = 0;
  return (
    <section
      className="pending-production"
      aria-label="Danh sách chờ sản xuất theo mã màu size"
    >
      <div className="panel padded">
        <h2>Chờ sản xuất theo mã · màu · size</h2>
        <p>
          Tra cứu nhanh mỗi màu đang còn chờ bao nhiêu sản phẩm ở từng size và ở
          những lệnh nào.
        </p>
        <div className="form-grid columns-3">
          <Field label="Tìm mã, màu, size hoặc mã lệnh">
            <input
              placeholder="Ví dụ: miu66, xam tieu…"
              value={filters.query || ""}
              onChange={(e) => set("query", e.target.value)}
            />
          </Field>
          <Field label="Mã sản phẩm chờ sản xuất">
            <select
              value={filters.sku || ""}
              onChange={(e) => set("sku", e.target.value)}
            >
              <option value="">Tất cả mã</option>
              {[
                ...new Set(
                  active.flatMap((o) =>
                    o.items.map((i) => i.sku.toUpperCase()),
                  ),
                ),
              ]
                .sort()
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </Field>
          <Field label="Màu chờ sản xuất">
            <select
              value={filters.color || ""}
              onChange={(e) => set("color", e.target.value)}
            >
              <option value="">Tất cả màu</option>
              {[
                ...new Set(
                  active.flatMap((o) =>
                    o.items
                      .filter(
                        (i) =>
                          !filters.sku || i.sku.toUpperCase() === filters.sku,
                      )
                      .map((i) => i.color),
                  ),
                ),
              ]
                .sort()
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </Field>
          <Field label="Size chờ sản xuất">
            <select
              value={filters.size || ""}
              onChange={(e) => set("size", e.target.value)}
            >
              <option value="">Tất cả size</option>
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Xưởng chờ sản xuất">
            <select
              value={filters.supplier || ""}
              onChange={(e) => set("supplier", e.target.value)}
            >
              <option value="">Tất cả xưởng</option>
              {[...new Set(active.map((o) => o.supplier))].sort().map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái nội bộ chờ sản xuất">
            <select
              value={filters.status || ""}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">Tất cả trạng thái hợp lệ</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Chờ sản xuất từ ngày lập lệnh">
            <input
              type="date"
              value={filters.from || ""}
              onChange={(e) => set("from", e.target.value)}
            />
          </Field>
          <Field label="Chờ sản xuất đến ngày lập lệnh">
            <input
              type="date"
              value={filters.to || ""}
              onChange={(e) => set("to", e.target.value)}
            />
          </Field>
        </div>
        <div className="actions">
          <label>
            <input
              type="checkbox"
              checked={filters.includeDrafts === "true"}
              onChange={(e) => set("includeDrafts", String(e.target.checked))}
            />{" "}
            Tính nháp trong danh sách chờ
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.includePaused === "true"}
              onChange={(e) => set("includePaused", String(e.target.checked))}
            />{" "}
            Tính tạm dừng trong danh sách chờ
          </label>
          <button
            onClick={() => {
              setFilters({});
              setLimit(100);
            }}
          >
            Xóa bộ lọc chờ sản xuất
          </button>
          {!invalid && (
            <>
              <a className="button" href={url("csv")}>
                Xuất chờ sản xuất CSV
              </a>
              <a className="button" href={url("xlsx")}>
                Xuất chờ sản xuất Excel
              </a>
            </>
          )}
        </div>
        <Notice>
          Còn chờ = đã đặt − đã nhận, bao gồm cả hàng đang sản xuất/chưa nhận.
          Không đồng nghĩa toàn bộ chưa bắt đầu sản xuất. Mặc định bỏ nháp, tạm
          dừng, đã xóa và hủy phần còn lại. Bộ lọc này dùng riêng cho dashboard
          và bảng bên dưới.
        </Notice>
      </div>
      {invalid ? (
        <Notice>Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</Notice>
      ) : (
        <>
          <div className="panel padded pending-dashboard">
            <div>
              <h3>Tỷ trọng số lượng còn chờ theo mã</h3>
              <p>
                {result.products.length} mã · {result.orderCount} lệnh ·{" "}
                {result.rows.length} nhóm màu · {result.overdueOrders} lệnh quá
                hạn
              </p>
              {result.total > 0 ? (
                <div className="pending-donut">
                  <svg
                    viewBox="0 0 240 240"
                    role="img"
                    aria-label="Biểu đồ tròn tỷ trọng số lượng còn chờ theo mã sản phẩm"
                  >
                    <title>
                      Tổng {fmt(result.total)} sản phẩm còn chờ theo bộ lọc
                    </title>
                    <circle
                      cx="120"
                      cy="120"
                      r="84"
                      fill="none"
                      stroke="#f3f4f6"
                      strokeWidth="32"
                    />
                    {result.slices.map((p, i) => {
                      const start = offset;
                      offset += p.share;
                      return (
                        <circle
                          key={p.sku}
                          cx="120"
                          cy="120"
                          r="84"
                          fill="none"
                          stroke={palette[i]}
                          strokeWidth="32"
                          strokeDasharray={`${(p.share / 100) * circumference} ${circumference}`}
                          strokeDashoffset={(-start / 100) * circumference}
                          transform="rotate(-90 120 120)"
                        >
                          <title>
                            {p.sku}: {fmt(p.pending)} sản phẩm ({fmt(p.share)}%)
                          </title>
                        </circle>
                      );
                    })}
                    <text
                      x="120"
                      y="117"
                      textAnchor="middle"
                      className="pending-donut-total"
                    >
                      {fmt(result.total)}
                    </text>
                    <text
                      x="120"
                      y="140"
                      textAnchor="middle"
                      className="pending-donut-label"
                    >
                      sản phẩm còn chờ
                    </text>
                  </svg>
                </div>
              ) : (
                <Empty>
                  Không có số lượng còn chờ phù hợp. Không tạo tỷ trọng giả khi
                  tổng bằng 0.
                </Empty>
              )}
            </div>
            <div className="pending-legend">
              {result.slices.map((p, i) => (
                <div key={p.sku}>
                  <span
                    className="pending-swatch"
                    style={{ background: palette[i] }}
                  />
                  {p.other ? (
                    <span>{p.sku}</span>
                  ) : (
                    <button
                      onClick={() => set("sku", p.sku)}
                      aria-label={`Lọc chờ sản xuất mã ${p.sku}`}
                    >
                      {p.sku}
                    </button>
                  )}
                  <strong>{fmt(p.pending)} sp</strong>
                  <span>{fmt(p.share)}%</span>
                </div>
              ))}
              {result.products.length > 8 && (
                <small>
                  Hiển thị 8 mã lớn nhất; nhóm Khác giữ đủ số lượng còn lại.
                  Dùng bộ lọc mã để xem từng mã khác.
                </small>
              )}
              <small>
                Tỷ trọng tính theo số sản phẩm còn chờ, không phải số lệnh. Biểu
                đồ và bảng dùng cùng bộ lọc.
              </small>
            </div>
          </div>
          <section className="panel">
            <div className="panel-title">
              <h3>Chi tiết còn chờ theo màu và size</h3>
              <span>
                {result.rows.length} nhóm · {fmt(result.total)} sản phẩm
              </span>
            </div>
            {result.rows.length ? (
              <div className="table-scroll">
                <table aria-label="Số lượng chờ theo mã màu size">
                  <thead>
                    <tr>
                      <th>Mã sản phẩm</th>
                      <th>Màu</th>
                      {sizes.map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                      <th>Tổng còn chờ</th>
                      <th>Số lệnh</th>
                      <th>Hẹn sớm nhất</th>
                      <th>Tra cứu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, limit).map((r) => (
                      <tr key={r.key}>
                        <td className="product-code">{r.sku}</td>
                        <td className="color-cell">{r.color}</td>
                        {sizes.map((s) => (
                          <td
                            key={s}
                            className={r.quantities[s] ? "orange-text" : ""}
                          >
                            {fmt(r.quantities[s])}
                          </td>
                        ))}
                        <td>
                          <b>{fmt(r.pending)}</b>
                        </td>
                        <td>{r.sources.length}</td>
                        <td>
                          {r.due || "Chưa hẹn"}
                          {r.overdue && (
                            <span className="badge red">Quá hạn</span>
                          )}
                        </td>
                        <td>
                          <button
                            aria-haspopup="dialog"
                            onClick={() => setExpanded([r.key])}
                          >
                            Xem lệnh {r.sku} {r.color}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>Tổng toàn bộ bộ lọc</th>
                      {sizes.map((s) => (
                        <th key={s}>{fmt(result.sizeTotals[s])}</th>
                      ))}
                      <th>{fmt(result.total)}</th>
                      <th colSpan={3}>{result.orderCount} lệnh duy nhất</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <Empty>
                Không có mã–màu–size còn chờ phù hợp. Kiểm tra bộ lọc hoặc bật
                tính nháp nếu cần.
              </Empty>
            )}
            {result.rows.length > limit && (
              <button onClick={() => setLimit((n) => n + 100)}>
                Xem thêm 100 nhóm ({limit}/{result.rows.length})
              </button>
            )}
          </section>
          {result.rows
            .filter((r) => expanded.includes(r.key))
            .map((r) => (
              <Modal
                key={r.key}
                wide
                title={`Lệnh còn chờ: ${r.sku} · ${r.color}`}
                onClose={() => setExpanded([])}
              >
                <div className="table-scroll">
                  <table aria-label={`Nguồn lệnh ${r.sku} ${r.color}`}>
                    <thead>
                      <tr>
                        <th>Mã lệnh</th>
                        <th>Xưởng</th>
                        <th>Trạng thái nội bộ</th>
                        {sizes.map((s) => (
                          <th key={s}>{s}</th>
                        ))}
                        <th>Còn chờ</th>
                        <th>Hẹn giao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.sources.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <button
                              onClick={() => {
                                setExpanded([]);
                                onOpen(o.id);
                              }}
                            >
                              {o.code}
                            </button>
                          </td>
                          <td>{o.supplier}</td>
                          <td>{o.status}</td>
                          {sizes.map((s) => (
                            <td key={s}>{fmt(o.quantities[s])}</td>
                          ))}
                          <td>{fmt(o.pending)}</td>
                          <td>{o.delivery || "Chưa hẹn"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Modal>
            ))}
        </>
      )}
    </section>
  );
}
