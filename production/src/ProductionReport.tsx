import { useMemo, useState } from "react";
import {
  productionReport,
  type ProductionReportFilters,
} from "../shared/production-report";
import { sizes, type ProductionOrder } from "../shared/domain";
import { Empty, Notice, Field, fmt } from "./ui";
export function ProductionReport({
  orders,
  onOpen,
}: {
  orders: ProductionOrder[];
  onOpen: (id: string) => void;
}) {
  const [filters, setFilters] = useState<Partial<ProductionReportFilters>>({}),
    [expanded, setExpanded] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const invalid = !!filters.from && !!filters.to && filters.from > filters.to;
  const report = useMemo(
    () =>
      productionReport(
        orders,
        invalid ? { ...filters, from: undefined, to: undefined } : filters,
      ),
    [orders, filters, invalid],
  );
  const set = (key: keyof ProductionReportFilters, value: string) => {
    setFilters((v) => ({ ...v, [key]: value || undefined }));
    setLimit(20);
  };
  const active = orders.filter((o) => !o.deletedAt && !o.cancelled);
  const exportUrl = (format: string) =>
    "/api/export/production-report?" +
    new URLSearchParams({
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      format,
    });
  const basis = report.filters.basis,
    basisLabel = basis === "pending" ? "Còn chờ" : "Đã đặt";
  return (
    <section className="production-report">
      <div className="panel padded">
        <h2>Báo cáo tỷ trọng sản phẩm gối</h2>
        <p>
          Xem mã nào đang gối, phân bổ màu–size và phần còn chờ ở từng xưởng.
        </p>
        <div className="form-grid columns-3">
          <Field label="Lệnh sản xuất báo cáo">
            <select
              value={filters.orderId || ""}
              onChange={(e) => set("orderId", e.target.value)}
            >
              <option value="">Tất cả lệnh</option>
              {active.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.supplier}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Từ ngày lập lệnh">
            <input
              type="date"
              value={filters.from || ""}
              onChange={(e) => set("from", e.target.value)}
            />
          </Field>
          <Field label="Đến ngày lập lệnh">
            <input
              type="date"
              value={filters.to || ""}
              onChange={(e) => set("to", e.target.value)}
            />
          </Field>
          <Field label="Nhà xưởng báo cáo">
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
          <Field label="Mã sản phẩm báo cáo">
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
          <Field label="Phạm vi sản phẩm">
            <select
              value={filters.scope || "pending"}
              onChange={(e) => set("scope", e.target.value)}
            >
              <option value="pending">
                Đang gối — các mã còn chờ trong lệnh
              </option>
              <option value="all">Toàn bộ — gồm dòng đã giao đủ</option>
            </select>
          </Field>
          <Field label="Tỷ trọng theo số lượng">
            <select
              value={filters.basis || "pending"}
              onChange={(e) => set("basis", e.target.value)}
            >
              <option value="pending">Số lượng còn chờ</option>
              <option value="placed">Số lượng đã đặt</option>
            </select>
          </Field>
        </div>
        <div className="actions">
          <label>
            <input
              type="checkbox"
              checked={filters.includeDrafts === "true"}
              onChange={(e) => set("includeDrafts", String(e.target.checked))}
            />{" "}
            Tính cả nháp
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.includePaused === "true"}
              onChange={(e) => set("includePaused", String(e.target.checked))}
            />{" "}
            Tính cả tạm dừng
          </label>
          <button
            onClick={() => {
              setFilters({});
              setLimit(20);
            }}
          >
            Đặt lại bộ lọc
          </button>
          {!invalid && (
            <>
              <a className="button" href={exportUrl("csv")}>
                Xuất báo cáo CSV
              </a>
              <a className="button" href={exportUrl("xlsx")}>
                Xuất báo cáo Excel
              </a>
            </>
          )}
        </div>
        <Notice>
          Mặc định chỉ tính các mã còn chờ trong lệnh trong lệnh đã gửi xưởng/đã
          xác nhận/đang sản xuất. Lệnh đã xóa hoặc hủy phần còn lại luôn bị
          loại. Tỷ trọng = {basisLabel.toLowerCase()} của mã ÷ tổng{" "}
          {basisLabel.toLowerCase()} trong bộ lọc. Đây là số lượng sản phẩm,
          không phải số lệnh hay giá trị tiền.
        </Notice>
      </div>
      {invalid ? (
        <Notice>Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</Notice>
      ) : (
        <>
          <div className="mini-kpis production-report-kpis">
            {[
              ["Mã đang xem", report.totals.products],
              ["Lệnh liên quan", report.totals.orders],
              ["Đã đặt", report.totals.placed],
              ["Đã nhận", report.totals.received],
              ["Còn chờ", report.totals.pending],
              ["Lệnh quá hạn", report.totals.overdueOrders],
            ].map(([label, n]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{fmt(Number(n))}</strong>
              </div>
            ))}
          </div>
          {!report.products.length ? (
            <section className="panel">
              <Empty>
                Không có sản phẩm phù hợp bộ lọc. Kiểm tra khoảng ngày hoặc bật
                tính nháp nếu lệnh đang ở trạng thái Nháp.
              </Empty>
            </section>
          ) : (
            <>
              <section className="panel padded">
                <h2>Top mã theo {basisLabel.toLowerCase()}</h2>
                <div
                  className="production-ranks"
                  aria-label={`Tỷ trọng top mã theo ${basisLabel.toLowerCase()}`}
                >
                  {report.products.slice(0, 10).map((p) => (
                    <button
                      key={p.sku}
                      onClick={() => set("sku", p.sku)}
                      aria-label={`Lọc mã ${p.sku}`}
                    >
                      <strong>{p.sku}</strong>
                      <span className="production-rank-track">
                        <i style={{ width: Math.max(0, p.share) + "%" }} />
                      </span>
                      <span>
                        {fmt(p[basis])} · {fmt(p.share)}%
                      </span>
                    </button>
                  ))}
                </div>
                <small>
                  Top 10; tỷ lệ luôn tính trên toàn bộ mã phù hợp bộ lọc, không
                  chỉ top 10.
                </small>
              </section>
              <div className="actions">
                <button
                  onClick={() =>
                    setExpanded(
                      report.products.slice(0, limit).map((p) => p.sku),
                    )
                  }
                >
                  Mở chi tiết các mã đang hiển thị
                </button>
                <button onClick={() => setExpanded([])}>Thu gọn tất cả</button>
              </div>
              {report.products.slice(0, limit).map((p) => (
                <section className="panel production-product" key={p.sku}>
                  <button
                    className="production-product-heading"
                    aria-expanded={expanded.includes(p.sku)}
                    onClick={() =>
                      setExpanded((v) =>
                        v.includes(p.sku)
                          ? v.filter((s) => s !== p.sku)
                          : [...v, p.sku],
                      )
                    }
                  >
                    <span>
                      <strong>{p.sku}</strong>
                      <small>
                        {p.orderCount} lệnh · {p.supplierCount} xưởng ·{" "}
                        {p.colors.length} màu
                        {p.overdueOrders
                          ? ` · ${p.overdueOrders} lệnh quá hạn`
                          : ""}
                      </small>
                    </span>
                    <span>
                      <b>
                        {fmt(p[basis])} sp · {fmt(p.share)}%
                      </b>
                      <small>
                        Tỷ trọng theo {basisLabel.toLowerCase()} ·{" "}
                        {expanded.includes(p.sku)
                          ? "Thu gọn"
                          : "Xem màu, size và lệnh"}
                      </small>
                    </span>
                  </button>
                  <div className="production-product-totals">
                    <span>
                      Đã đặt <b>{fmt(p.placed)}</b>
                    </span>
                    <span>
                      Đã nhận <b>{fmt(p.received)}</b>
                    </span>
                    <span>
                      Còn chờ <b>{fmt(p.pending)}</b>
                    </span>
                    <span>
                      Hoàn thành{" "}
                      <b>
                        {fmt(p.placed ? (p.received / p.placed) * 100 : 0)}%
                      </b>
                    </span>
                  </div>
                  {expanded.includes(p.sku) && (
                    <div className="padded">
                      <h3>Màu × size — {basisLabel.toLowerCase()}</h3>
                      <div className="table-scroll">
                        <table aria-label={`Màu và size ${p.sku}`}>
                          <thead>
                            <tr>
                              <th>Màu</th>
                              {sizes.map((s) => (
                                <th key={s}>{s}</th>
                              ))}
                              <th>Tổng</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.colors.map((c) => (
                              <tr key={c.color}>
                                <td className="color-cell">{c.color}</td>
                                {sizes.map((s) => (
                                  <td
                                    key={s}
                                    className={
                                      c.quantities[s] ? "orange-text" : ""
                                    }
                                  >
                                    {fmt(c.quantities[s])}
                                  </td>
                                ))}
                                <td>
                                  <b>{fmt(c.total)}</b>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th>Tổng {p.sku}</th>
                              {sizes.map((s) => (
                                <th key={s}>
                                  {fmt(
                                    p.colors.reduce(
                                      (n, c) => n + c.quantities[s],
                                      0,
                                    ),
                                  )}
                                </th>
                              ))}
                              <th>{fmt(p[basis])}</th>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <h3>Các lệnh đang có {p.sku}</h3>
                      <div className="table-scroll">
                        <table aria-label={`Lệnh của ${p.sku}`}>
                          <thead>
                            <tr>
                              {[
                                "Mã lệnh",
                                "Xưởng",
                                "Hẹn giao",
                                "Đã đặt mã này",
                                "Đã nhận",
                                "Còn chờ",
                                "Tỷ trọng mã trong lệnh",
                                "Tình trạng",
                              ].map((s) => (
                                <th key={s}>{s}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {p.sources.map((o) => (
                              <tr key={o.id}>
                                <td>
                                  <button onClick={() => onOpen(o.id)}>
                                    {o.code}
                                  </button>
                                </td>
                                <td>{o.supplier}</td>
                                <td>{o.delivery || "Chưa hẹn"}</td>
                                <td>{fmt(o.placed)}</td>
                                <td>{fmt(o.received)}</td>
                                <td>{fmt(o.pending)}</td>
                                <td>{fmt(o.shareInOrder)}%</td>
                                <td>
                                  {o.overdue ? (
                                    <span className="badge red">Quá hạn</span>
                                  ) : o.pending ? (
                                    o.status
                                  ) : (
                                    "Đã giao đủ"
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <small>
                        Tỷ trọng trong lệnh dùng tổng số đã đặt của toàn lệnh
                        làm mẫu số, kể cả khi đang lọc một mã. Các tỷ trọng
                        không được cộng giữa những lệnh khác nhau.
                      </small>
                    </div>
                  )}
                </section>
              ))}
              {report.products.length > limit && (
                <button onClick={() => setLimit((n) => n + 20)}>
                  Xem thêm 20 mã ({limit}/{report.products.length})
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
