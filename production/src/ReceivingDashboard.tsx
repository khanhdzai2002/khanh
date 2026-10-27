import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { sizes } from "../shared/domain";
import { fmt, Field, Notice, Empty } from "./ui";
const vnDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(ms),
  );
const palette = [
  "#ee741f",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#e11d48",
  "#0891b2",
  "#ca8a04",
  "#475569",
  "#a1a1aa",
];
export function ReceivingDashboard({
  revision,
  onOrder,
}: {
  revision: unknown;
  onOrder: (id: string) => void;
}) {
  const [filters, setFilters] = useState({
    from: vnDay(Date.now() - 29 * 86400000),
    to: vnDay(Date.now()),
    sku: "",
    color: "",
    size: "",
    supplier: "",
    classification: "all",
    search: "",
    includeDrafts: "false",
    includePaused: "false",
    limit: "100",
  });
  const [applied, setApplied] = useState(filters),
    [report, setReport] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const query = (f: typeof filters) =>
    new URLSearchParams(
      Object.entries(f).filter(([, v]) => v !== ""),
    ).toString();
  const load = async (f: typeof filters) => {
    const id = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const r = await api("/api/incoming/report?" + query(f));
      if (id === seq.current) {
        setReport(r);
        setApplied(f);
      }
    } catch (e) {
      if (id === seq.current) setError((e as Error).message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load(applied);
    return () => {
      seq.current++;
    };
  }, [revision]);
  const field = (key: keyof typeof filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const mix = report
    ? report.products.length > 8
      ? [
          ...report.products.slice(0, 8),
          {
            sku: "Các mã khác",
            qty: report.products
              .slice(8)
              .reduce((n: number, p: any) => n + p.qty, 0),
            share: report.products
              .slice(8)
              .reduce((n: number, p: any) => n + p.share, 0),
          },
        ]
      : report.products
    : [];
  let angle = 0;
  const stops = mix
    .map((p: any, i: number) => {
      const start = angle;
      angle += p.share;
      return `${palette[i]} ${start}% ${angle}%`;
    })
    .join(",");
  return (
    <section className="incoming-panel receiving-dashboard">
      <h2>Báo cáo nhanh hàng về</h2>
      <p>
        Số liệu thực từ các biên nhận đã xác nhận, gồm cả nhận trực tiếp trong
        lệnh. Phiếu nháp chưa được tính.
      </p>
      <div className="receiving-filters">
        <Field label="Từ ngày nhận">
          <input
            type="date"
            value={filters.from}
            onChange={(e) => field("from", e.target.value)}
          />
        </Field>
        <Field label="Đến ngày nhận">
          <input
            type="date"
            value={filters.to}
            onChange={(e) => field("to", e.target.value)}
          />
        </Field>
        <Field label="Mã báo cáo hàng về">
          <select
            value={filters.sku}
            onChange={(e) => field("sku", e.target.value)}
          >
            <option value="">Tất cả mã</option>
            {report?.options.skus.map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Màu báo cáo">
          <input
            value={filters.color}
            placeholder="Tên màu đầy đủ"
            onChange={(e) => field("color", e.target.value)}
          />
        </Field>
        <Field label="Size báo cáo">
          <select
            value={filters.size}
            onChange={(e) => field("size", e.target.value)}
          >
            <option value="">Tất cả size</option>
            {sizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Xưởng báo cáo">
          <select
            value={filters.supplier}
            onChange={(e) => field("supplier", e.target.value)}
          >
            <option value="">Tất cả xưởng</option>
            {report?.options.suppliers.map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Phân loại hàng về">
          <select
            value={filters.classification}
            onChange={(e) => field("classification", e.target.value)}
          >
            <option value="all">Tất cả hàng nhận</option>
            <option value="matched">Đã đối chiếu lệnh</option>
            <option value="unmatched">Chưa đối chiếu lệnh</option>
          </select>
        </Field>
        <Field label="Tìm báo cáo hàng về">
          <input
            value={filters.search}
            placeholder="Mã, màu, lệnh, xưởng, lý do…"
            onChange={(e) => field("search", e.target.value)}
          />
        </Field>
      </div>
      <div className="actions">
        <label>
          <input
            type="checkbox"
            checked={filters.includeDrafts === "true"}
            onChange={(e) => field("includeDrafts", String(e.target.checked))}
          />{" "}
          Tính nợ lệnh Nháp
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.includePaused === "true"}
            onChange={(e) => field("includePaused", String(e.target.checked))}
          />{" "}
          Tính nợ lệnh Tạm dừng
        </label>
        <button disabled={loading} onClick={() => void load(filters)}>
          Áp dụng báo cáo
        </button>
        {report && (
          <a
            className="button"
            href={"/api/incoming/report/export?" + query(applied)}
          >
            Xuất CSV hàng về
          </a>
        )}
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {loading && <p role="status">Đang tải báo cáo hàng về…</p>}
      {report && (
        <>
          <p>
            Chỉ số theo bộ lọc đã áp dụng · {applied.from || "Từ đầu"} →{" "}
            {applied.to || "Hiện tại"}
          </p>
          <div className="receiving-kpis">
            {[
              ["Tổng thực nhận", report.totals.received],
              ["Đã đối chiếu lệnh", report.totals.matched],
              ["Chưa đối chiếu lệnh", report.totals.unmatched],
              [
                "Tỷ lệ chưa đối chiếu",
                fmt(report.totals.unmatchedPercent) + "%",
              ],
              ["Mã có hàng nhận", report.totals.products],
              ["Còn thiếu hiện tại", report.totals.pending],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>
                  {typeof value === "number" ? fmt(value) : value}
                </strong>
              </div>
            ))}
          </div>
          <p>
            {report.totals.matchedReceipts} biên nhận theo lệnh ·{" "}
            {report.totals.unmatchedSlips} phiếu có hàng chưa đối chiếu ·{" "}
            {report.totals.pendingOrders} lệnh còn thiếu ·{" "}
            {report.totals.overdueOrders} lệnh quá hạn.
          </p>
          <div className="receiving-charts">
            <div>
              <h3>Tỷ trọng sản lượng nhận theo mã</h3>
              {report.totals.received ? (
                <>
                  <div
                    className="receiving-donut"
                    role="img"
                    aria-label={`Tổng ${report.totals.received} sản phẩm nhận theo mã`}
                    style={{ background: `conic-gradient(${stops})` }}
                  >
                    <div>
                      <b>{fmt(report.totals.received)}</b>
                      <span>sản phẩm</span>
                    </div>
                  </div>
                  <div className="receiving-legend">
                    {mix.map((p: any, i: number) => (
                      <button
                        key={p.sku}
                        disabled={p.sku === "Các mã khác"}
                        onClick={() => {
                          const f = { ...filters, sku: p.sku };
                          setFilters(f);
                          void load(f);
                        }}
                      >
                        <i style={{ background: palette[i] }} />
                        {p.sku} · {fmt(p.qty)} · {fmt(p.share)}%
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <Empty>Chưa có hàng nhận phù hợp bộ lọc.</Empty>
              )}
            </div>
            <div>
              <h3>Sản lượng nhận theo ngày</h3>
              {report.daily.map((d: any) => (
                <div className="receiving-day" key={d.date}>
                  <span>{d.date}</span>
                  <div
                    style={{
                      width: `${(d.total / Math.max(...report.daily.map((x: any) => x.total), 1)) * 100}%`,
                    }}
                  >
                    <i style={{ width: `${(d.matched / d.total) * 100}%` }} />
                    <em
                      style={{ width: `${(d.unmatched / d.total) * 100}%` }}
                    />
                  </div>
                  <b>{fmt(d.total)}</b>
                </div>
              ))}
              <p>
                <span className="badge">Xanh: đã đối chiếu</span>{" "}
                <span className="badge orange">Cam: chưa đối chiếu</span>
              </p>
            </div>
          </div>
          <h3>Mã → màu → số lượng từng size đã nhận</h3>
          {report.products.map((p: any) => (
            <details key={p.sku} className="receiving-product">
              <summary>
                {p.sku} · {fmt(p.qty)} sản phẩm · {fmt(p.share)}% · chưa đối
                chiếu {fmt(p.unmatched)}
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Màu</th>
                      {sizes.map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                      <th>Tổng</th>
                      <th>Đã đối chiếu</th>
                      <th>Chưa đối chiếu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.colors.map((c: any) => (
                      <tr key={c.color}>
                        <td>{c.color}</td>
                        {sizes.map((s) => (
                          <td key={s}>{fmt(c.sizes[s])}</td>
                        ))}
                        <td>{fmt(c.qty)}</td>
                        <td>{fmt(c.matched)}</td>
                        <td>{fmt(c.unmatched)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <h3>Chi tiết các đợt nhận ({report.entryCount} dòng)</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Ngày nhận",
                    "Phân loại",
                    "Mã",
                    "Màu",
                    "Size",
                    "Số nhận",
                    "Xưởng",
                    "Lệnh / phiếu",
                    "Bao",
                    "Người ghi",
                    "Lý do / ghi chú",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.entries.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (r.classification === "unmatched" ? "orange" : "")
                        }
                      >
                        {r.classification === "matched"
                          ? "Đã đối chiếu lệnh"
                          : "Chưa đối chiếu lệnh"}
                      </span>
                    </td>
                    <td>{r.sku}</td>
                    <td>{r.color}</td>
                    <td>{r.size}</td>
                    <td>{fmt(r.qty)}</td>
                    <td>{r.supplier}</td>
                    <td>
                      {r.orderId ? (
                        <button onClick={() => onOrder(r.orderId)}>
                          {r.code}
                          {r.archived ? " (đã xóa)" : ""}
                        </button>
                      ) : (
                        "Phiếu " + r.draftId.slice(0, 8)
                      )}
                    </td>
                    <td>{r.bag || "—"}</td>
                    <td>{r.actor}</td>
                    <td className="receiving-note">
                      {r.reason || r.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>
            Còn thiếu theo từng lệnh — mã / màu / size ({report.debtCount} dòng)
          </h3>
          <Notice>
            Số còn thiếu là hiện tại, theo mã/màu/size/xưởng và tìm kiếm; không
            giới hạn bởi kỳ ngày nhận hoặc phân loại hàng nhận ở trên. Hàng chưa
            đối chiếu không tự trừ nợ lệnh.
          </Notice>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Lệnh",
                    "Xưởng",
                    "Mã",
                    "Màu",
                    "Size",
                    "Đặt",
                    "Đã nhận",
                    "Còn thiếu",
                    "Hẹn giao",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.debt.map((r: any) => (
                  <tr key={r.orderId + r.sku + r.color + r.size}>
                    <td>
                      <button onClick={() => onOrder(r.orderId)}>
                        {r.code}
                      </button>
                    </td>
                    <td>{r.supplier}</td>
                    <td>{r.sku}</td>
                    <td>{r.color}</td>
                    <td>{r.size}</td>
                    <td>{fmt(r.placed)}</td>
                    <td>{fmt(r.received)}</td>
                    <td>{fmt(r.pending)}</td>
                    <td className={r.overdue ? "orange-text" : ""}>
                      {r.delivery || "Chưa hẹn"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(report.entryCount > report.entries.length ||
            report.debtCount > report.debt.length) && (
            <p>
              Đang hiển thị tối đa {applied.limit} dòng mỗi bảng.{" "}
              <button
                disabled={Number(applied.limit) >= 1000 || loading}
                onClick={() => {
                  const f = {
                    ...applied,
                    limit: String(Math.min(1000, Number(applied.limit) + 100)),
                  };
                  setFilters(f);
                  void load(f);
                }}
              >
                Xem thêm 100 dòng
              </button>{" "}
              CSV chứa toàn bộ dòng hàng nhận theo bộ lọc.
            </p>
          )}
        </>
      )}
    </section>
  );
}
