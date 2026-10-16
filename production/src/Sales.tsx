import { useEffect, useState } from "react";
import {
  Upload,
  Download,
  ArrowRight,
  Search,
  FileSpreadsheet,
} from "lucide-react";
import { api, send, fileBase64 } from "./api";
import { trendSignal } from "../shared/sales";
import { Empty, Notice, Modal, Field, fmt, localTime, type Run } from "./ui";
export function Sales({
  run,
  writable,
  busy,
  navigate,
}: {
  run: Run;
  writable: boolean;
  busy: boolean;
  navigate: (p: string) => void;
}) {
  const [report, setReport] = useState<any>(null),
    [error, setError] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [code, setCode] = useState(""),
    [search, setSearch] = useState(""),
    [importing, setImporting] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [mode, setMode] = useState("2"),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setError("");
    void api(
      "/api/sales?" +
        new URLSearchParams({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
    )
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [from, to, refresh]);
  const rows = (report?.variants || []).filter(
      (r: any) =>
        (!code || r.sku === code) &&
        (!search ||
          (r.sku + " " + r.color + " " + r.size)
            .toLowerCase()
            .includes(search.toLowerCase())),
    ),
    sourceRows = (report?.rows || []).filter(
      (r: any) => (!code || r.sku === code) && r.qty > 0,
    ),
    top = new Map<string, number>(),
    colors = new Map<string, number>(),
    daily = new Map<string, number>();
  for (const r of sourceRows)
    if (r.kind === "single") {
      top.set(r.sku, (top.get(r.sku) || 0) + r.qty);
      colors.set(
        r.sku + " · " + r.color,
        (colors.get(r.sku + " · " + r.color) || 0) + r.qty,
      );
      daily.set(r.date, (daily.get(r.date) || 0) + r.qty);
    }
  const ranked = [...top].sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">04 / SALES INTELLIGENCE</div>
          <h1>Phân tích dữ liệu bán hàng</h1>
          <p>
            Sản lượng sản phẩm lẻ từ file TikTok Shop · Tách riêng combo cần đối
            soát.
          </p>
        </div>
        {writable && (
          <button className="primary" onClick={() => setImporting(true)}>
            <Upload size={17} />
            Nhập đơn hàng Excel / CSV
          </button>
        )}
      </div>
      <div className="filterbar">
        <Field label="Mã sản phẩm">
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">Tất cả mã</option>
            {[...new Set((report?.variants || []).map((r: any) => r.sku))].map(
              (s: any) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </Field>
        <Field label="Từ ngày">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Đến ngày">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button
          disabled={!report?.lastFullDay}
          onClick={() => {
            const end = report.lastFullDay;
            const d = new Date(end + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() - 6);
            setFrom(d.toISOString().slice(0, 10));
            setTo(end);
          }}
        >
          7 ngày trọn vẹn
        </button>
        <button
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          Toàn bộ kỳ
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {!report && !error && <p>Đang tải báo cáo…</p>}
      {report && (
        <>
          <div className="mini-kpis">
            {[
              [
                "SL bán lẻ",
                sourceRows
                  .filter((r: any) => r.kind === "single")
                  .reduce((n: number, r: any) => n + r.qty, 0),
              ],
              ["Mã có bán", top.size],
              ["SKU màu–size", rows.length],
              [
                "Lượt combo",
                sourceRows
                  .filter((r: any) => r.kind === "combo")
                  .reduce((n: number, r: any) => n + r.qty, 0),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{fmt(Number(value))}</strong>
              </div>
            ))}
          </div>
          <div className="source-line">
            <FileSpreadsheet size={16} />
            {report.files.length
              ? report.files.join(" · ")
              : "Chưa nhập file bán hàng"}{" "}
            · Ngày đầy đủ cuối: {report.lastFullDay || "—"}
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-title">
                <h2>Top mã sản phẩm</h2>
              </div>
              {ranked.length ? (
                <div className="ranking">
                  {ranked.slice(0, 10).map(([sku, qty], i) => (
                    <div key={sku}>
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="rank-info">
                        <button
                          className="link-button"
                          onClick={() => setCode(sku)}
                        >
                          {sku}
                        </button>
                        <div className="bar">
                          <i
                            style={{ width: (qty / ranked[0][1]) * 100 + "%" }}
                          />
                        </div>
                      </div>
                      <strong>{fmt(qty)} sp</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>
                  Nhập file để phân tích; dữ liệu mẫu V9 không tự tính vào báo
                  cáo hiện tại.
                </Empty>
              )}
            </section>
            <section className="panel">
              <div className="panel-title">
                <h2>Sản lượng theo ngày</h2>
              </div>
              <SalesChart
                values={[...daily].sort((a, b) => a[0].localeCompare(b[0]))}
              />
            </section>
          </div>
          <section className="panel">
            <div className="panel-title">
              <h2>Top màu / phối màu</h2>
            </div>
            {colors.size ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Mã · Màu</th>
                      <th>SL kỳ xem</th>
                      <th>Tỷ trọng trong mã</th>
                      <th>TB 2 ngày</th>
                      <th>TB 7 ngày</th>
                      <th>Xu hướng 2 vs 7 ngày</th>
                      <th>Tín hiệu bán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...colors]
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 30)
                      .map(([color, qty], i) => {
                        const variants = report.variants.filter(
                            (r: any) => r.sku + " · " + r.color === color,
                          ),
                          r2 = variants.reduce(
                            (n: number, r: any) => n + r.r2,
                            0,
                          ),
                          r7 = variants.reduce(
                            (n: number, r: any) => n + r.r7,
                            0,
                          ),
                          total = top.get(variants[0]?.sku) || 0;
                        return (
                          <tr key={color}>
                            <td>{i + 1}</td>
                            <td className="color-cell">{color}</td>
                            <td>{fmt(qty)}</td>
                            <td>
                              {total ? fmt((qty / total) * 100) + "%" : "—"}
                            </td>
                            <td>{fmt(r2)}</td>
                            <td>{fmt(r7)}</td>
                            <td>
                              {r7 ? fmt(((r2 - r7) / r7) * 100) + "%" : "—"}
                            </td>
                            <td>
                              <span className="badge orange">
                                {trendSignal(r2, r7)}
                              </span>
                              {r7 > 0 && r2 / r7 > 2 && (
                                <small>Kiểm tra campaign / viral</small>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Chưa có màu bán hợp lệ.</Empty>
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Chi tiết bán đến từng size</h2>
                <p>
                  TB 2/7 ngày luôn lấy cửa sổ trọn vẹn gần nhất, độc lập bộ lọc
                  kỳ xem như V9.
                </p>
              </div>
              <a className="button" href="/api/export/sales?format=xlsx">
                <Download size={16} />
                Excel
              </a>
            </div>
            <div className="toolbar">
              <div className="search">
                <Search size={16} />
                <input
                  aria-label="Lọc bán hàng"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lọc mã, màu, size…"
                />
              </div>
              <select
                aria-label="Nguồn tốc độ bán"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="2">TB 2 ngày</option>
                <option value="7">TB 7 ngày</option>
              </select>
              {writable && (
                <button
                  className="primary"
                  disabled={busy || !report.variants.length}
                  onClick={() => {
                    if (
                      confirm(
                        "Cập nhật doanh số tất cả SKU trong báo cáo sang dự kiến sản xuất? Giữ nguyên tồn, đang về, vòng đời và SL test.",
                      )
                    )
                      void run(
                        () => send("/api/sales/sync", { mode }),
                        "Đã cập nhật số bán, giữ nguyên tồn và vòng đời",
                      ).then((ok) => {
                        if (ok) navigate("planning");
                      });
                  }}
                >
                  Chuyển tất cả sang dự báo <ArrowRight size={16} />
                </button>
              )}
            </div>
            {rows.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Mã",
                        "Màu",
                        "Size",
                        "SL kỳ xem",
                        "Bán 2 ngày",
                        "TB 2 ngày",
                        "TB 7 ngày",
                        "Tín hiệu bán",
                        "Lưu ý",
                      ].map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={JSON.stringify([r.sku, r.color, r.size])}>
                        <td className="product-code">{r.sku}</td>
                        <td className="color-cell">{r.color}</td>
                        <td>{r.size}</td>
                        <td>{fmt(r.qty)}</td>
                        <td>{fmt(r.q2)}</td>
                        <td>{fmt(r.r2)}</td>
                        <td>{fmt(r.r7)}</td>
                        <td>
                          <span className="badge orange">{r.signal}</span>
                        </td>
                        <td>{r.viral ? "Kiểm tra Mega Live / viral" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Không có SKU phù hợp bộ lọc.</Empty>
            )}
            <Notice>
              {report.coverageWarning} Tín hiệu bán không tự thay đổi vòng đời
              sản phẩm.
            </Notice>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Combo và dòng cần đối soát</h2>
              <a className="button" href="/api/export/combos">
                <Download size={15} />
                CSV combo
              </a>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Mã</th>
                    <th>Phân loại</th>
                    <th>SL</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows
                    .filter((r: any) => r.kind !== "single")
                    .slice(0, 200)
                    .map((r: any) => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td>{r.sku}</td>
                        <td className="color-cell">{r.variation}</td>
                        <td>{r.qty}</td>
                        <td>
                          {r.kind === "combo"
                            ? "Lượt combo, chưa quy đổi áo"
                            : r.reason}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <small>
              Hiển thị tối đa 200 dòng đối soát. Dữ liệu đầy đủ được giữ tại
              backend.
            </small>
          </section>
        </>
      )}
      {importing && (
        <SalesImport
          onClose={() => setImporting(false)}
          busy={busy}
          run={run}
          onPreview={(p) => {
            setPreview(p);
            setImporting(false);
          }}
        />
      )}
      {preview && (
        <Modal
          title="Xem trước kỳ bán hàng"
          onClose={() => setPreview(null)}
          wide
        >
          <p>
            <b>{preview.filename}</b> · {preview.periodStart} →{" "}
            {preview.periodEnd} ·{" "}
            {preview.mode === "replace"
              ? "Thay thế kỳ báo cáo"
              : "Nhập bổ sung"}
          </p>
          <div className="mini-kpis">
            {Object.entries(preview.summary).map(([key, n]) => (
              <div key={key}>
                <small>
                  {
                    (
                      {
                        single: "Sản phẩm lẻ",
                        combo: "Lượt combo",
                        excluded: "SL bị loại",
                        unknown: "Chưa rõ SKU",
                      } as any
                    )[key]
                  }
                </small>
                <strong>{fmt(Number(n))}</strong>
              </div>
            ))}
          </div>
          {preview.warnings.map((s: string) => (
            <Notice key={s}>{s}</Notice>
          ))}
          {preview.errors.length > 0 && (
            <div className="error-list">
              {preview.errors.slice(0, 100).map((s: string, i: number) => (
                <p key={i}>{s}</p>
              ))}
              <strong>{preview.errors.length} lỗi cần sửa trước khi ghi</strong>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Mã</th>
                  <th>Màu/Size</th>
                  <th>SL</th>
                  <th>Phân loại</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.sku}</td>
                    <td>
                      {r.color} · {r.size}
                    </td>
                    <td>{r.qty}</td>
                    <td>{r.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Notice>
            Xác nhận sẽ{" "}
            {preview.mode === "replace"
              ? "thay thế dữ liệu bán hiện tại trong kỳ đã chọn; dữ liệu ngoài kỳ được giữ"
              : "bổ sung và bỏ qua dòng đã nhập có cùng nội dung"}
            . Tồn kho, vòng đời và lệnh sản xuất không thay đổi.
          </Notice>
          <button
            className="primary"
            disabled={busy || preview.errors.length > 0}
            onClick={() =>
              void run(
                () => send(`/api/imports/sales/${preview.id}/confirm`, {}),
                "Đã nhập báo cáo bán hàng",
              ).then((ok) => {
                if (ok) {
                  setPreview(null);
                  setRefresh((n) => n + 1);
                }
              })
            }
          >
            Xác nhận ghi báo cáo
          </button>
        </Modal>
      )}
    </>
  );
}
function SalesImport({
  onClose,
  busy,
  run,
  onPreview,
}: {
  onClose: () => void;
  busy: boolean;
  run: Run;
  onPreview: (p: any) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [mode, setMode] = useState("replace"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [exported, setExported] = useState(localTime(new Date().toISOString()));
  return (
    <Modal title="Nhập file TikTok Shop" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          void run(
            async () =>
              onPreview(
                await send("/api/imports/sales/preview", {
                  filename: file.name,
                  base64: await fileBase64(file),
                  periodStart: start,
                  periodEnd: end,
                  mode,
                  exportedAt: new Date(exported + ":00+07:00").toISOString(),
                }),
              ),
            "Đã phân tích file, chưa ghi vào báo cáo",
          );
        }}
      >
        <Field label="File đơn hàng CSV hoặc XLSX (tối đa 10 MB)">
          <input
            type="file"
            accept=".csv,.xlsx"
            required
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Kỳ báo cáo từ">
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Kỳ báo cáo đến">
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Thời điểm xuất báo cáo (Việt Nam)">
          <input
            type="datetime-local"
            required
            value={exported}
            onChange={(e) => setExported(e.target.value)}
          />
        </Field>
        <Field label="Cách nhập">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="replace">Thay thế kỳ báo cáo đã chọn</option>
            <option value="append">
              Nhập bổ sung — cần Order Line ID hoặc SKU ID
            </option>
          </select>
        </Field>
        <Notice>
          Cần cột Order ID, Order Status, Product Name hoặc Seller SKU,
          Variation, Quantity, Created Time. Combo không tự gán về một SKU.
          Không tải dữ liệu tới dịch vụ bên ngoài.
        </Notice>
        <button className="primary" disabled={busy || !file}>
          Phân tích và xem trước
        </button>
      </form>
    </Modal>
  );
}
function SalesChart({ values }: { values: [string, number][] }) {
  if (!values.length)
    return <Empty>Biểu đồ sẽ hiển thị từ dữ liệu bán đã nhập.</Empty>;
  const max = Math.max(1, ...values.map((v) => v[1])),
    points = values.map(([date, qty], i) => ({
      date,
      qty,
      x: 40 + (values.length === 1 ? 220 : (i / (values.length - 1)) * 440),
      y: 190 - (qty / max) * 145,
    }));
  return (
    <svg
      className="sales-chart"
      viewBox="0 0 520 240"
      role="img"
      aria-label="Sản lượng sản phẩm lẻ theo ngày"
    >
      <line x1="40" y1="190" x2="490" y2="190" stroke="#dedfe3" />
      <line x1="40" y1="45" x2="490" y2="45" stroke="#eee" />
      <text x="5" y="48">
        {max}
      </text>
      <polyline
        points={points.map((p) => p.x + "," + p.y).join(" ")}
        fill="none"
        stroke="#EE741F"
        strokeWidth="3"
      />
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={p.x} cy={p.y} r="4" fill="#EE741F">
            <title>
              {p.date}: {p.qty} sp
            </title>
          </circle>
          {values.length < 16 && (
            <text x={p.x} y={p.y - 12} textAnchor="middle">
              {p.qty}
            </text>
          )}
          {(values.length < 12 || i % Math.ceil(values.length / 8) === 0) && (
            <text x={p.x} y="215" textAnchor="middle">
              {p.date.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
