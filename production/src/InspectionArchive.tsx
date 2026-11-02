import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Field, Empty, fmt } from "./ui";
import {
  inspectionCategories,
  type InspectionArchiveResult,
} from "../shared/inspection-images";
import { InspectionCard } from "./InspectionAttachments";
export function InspectionArchive({
  onOrder,
  onDraft,
}: {
  onOrder: (id: string) => void;
  onDraft: (id: string) => void;
}) {
  const [filters, setFilters] = useState({
      search: "",
      supplier: "",
      month: "",
      from: "",
      to: "",
      category: "",
      source: "",
      state: "",
    }),
    [page, setPage] = useState(1),
    [report, setReport] = useState<InspectionArchiveResult | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const seq = ++sequence.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "24",
      });
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      api<InspectionArchiveResult>("/api/inspection-archive?" + params)
        .then((value) => {
          if (seq === sequence.current) setReport(value);
        })
        .catch((e) => {
          if (seq === sequence.current) {
            setError(e.message);
            setReport(null);
          }
        })
        .finally(() => {
          if (seq === sequence.current) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      sequence.current++;
    };
  }, [filters, page, revision]);
  const change = (key: keyof typeof filters, value: string) => {
    setPage(1);
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(key === "month"
        ? { from: "", to: "" }
        : key === "from" || key === "to"
          ? { month: "" }
          : {}),
    }));
  };
  const displayPage = report?.page || 1;
  return (
    <div className="inspection-archive">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CHỨNG TỪ HÀNG VỀ</div>
          <h1>Kho ảnh phiếu kiểm</h1>
          <p>
            Tra cứu ảnh gốc theo ngày kiểm, nhà xưởng, sản phẩm và lệnh sản
            xuất. Bao gồm phiếu nhập thủ công, JSON và các đợt nhận tại lệnh.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Tải lại kho ảnh
        </button>
      </div>
      <section className="incoming-panel">
        <div className="inspection-filters">
          <Field label="Tìm ảnh, mã phiếu, lệnh, mã hoặc màu sản phẩm">
            <input
              type="search"
              value={filters.search}
              placeholder="MIU37, LSX…, tên ảnh…"
              onChange={(e) => change("search", e.target.value)}
            />
          </Field>
          <Field label="Nhà xưởng">
            <input
              value={filters.supplier}
              placeholder="Tên nhà xưởng"
              onChange={(e) => change("supplier", e.target.value)}
            />
          </Field>
          <Field label="Tháng phiếu kiểm">
            <input
              type="month"
              value={filters.month}
              onChange={(e) => change("month", e.target.value)}
            />
          </Field>
          <Field label="Ngày kiểm từ">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => change("from", e.target.value)}
            />
          </Field>
          <Field label="Ngày kiểm đến">
            <input
              type="date"
              value={filters.to}
              onChange={(e) => change("to", e.target.value)}
            />
          </Field>
          <Field label="Loại chứng từ trong kho">
            <select
              value={filters.category}
              onChange={(e) => change("category", e.target.value)}
            >
              <option value="">Tất cả loại chứng từ</option>
              {inspectionCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Nguồn phiếu nhập">
            <select
              value={filters.source}
              onChange={(e) => change("source", e.target.value)}
            >
              <option value="">Tất cả nguồn nhập</option>
              <option value="manual">Nhập thủ công</option>
              <option value="json">Nhập JSON</option>
              <option value="direct">Nhận tại lệnh</option>
            </select>
          </Field>
          <Field label="Trạng thái phiếu">
            <select
              value={filters.state}
              onChange={(e) => change("state", e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="confirmed">Đã ghi nhận</option>
              <option value="draft">Nháp được phép xem</option>
            </select>
          </Field>
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              setFilters({
                search: "",
                supplier: "",
                month: "",
                from: "",
                to: "",
                category: "",
                source: "",
                state: "",
              });
              setPage(1);
            }}
          >
            Bỏ bộ lọc — tất cả thời gian
          </button>
          <span aria-live="polite">
            {loading
              ? "Đang tìm ảnh…"
              : `${fmt(report?.total || 0)} ảnh phù hợp`}
          </span>
        </div>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="inspection-stats" aria-label="Thống kê kho ảnh">
            <div>
              <small>Ảnh chứng từ</small>
              <strong>{fmt(report.total)}</strong>
            </div>
            <div>
              <small>Phiếu / đợt nhận có ảnh</small>
              <strong>{fmt(report.slips)}</strong>
            </div>
            <div>
              <small>Dung lượng ảnh gốc</small>
              <strong>
                {report.bytes < 1024 * 1024
                  ? `${fmt(report.bytes / 1024)} KB`
                  : `${fmt(report.bytes / 1024 / 1024)} MB`}
              </strong>
            </div>
            <div>
              <small>Ảnh đang dùng ngày nhận / tạo phiếu</small>
              <strong>{fmt(report.inferred)}</strong>
            </div>
          </div>
          {!!report.months.length && (
            <div
              className="actions inspection-months"
              aria-label="Phân bổ ảnh theo tháng"
            >
              <span>Theo tháng kiểm:</span>
              {report.months.map((m) => (
                <button
                  type="button"
                  aria-pressed={filters.month === m.month}
                  key={m.month}
                  onClick={() =>
                    change("month", filters.month === m.month ? "" : m.month)
                  }
                >
                  {m.month.split("-").reverse().join("/")} · {fmt(m.count)} ảnh
                </button>
              ))}
            </div>
          )}
          <p className="muted">
            Ảnh cũ chưa có ngày kiểm riêng được xếp theo ngày nhận hoặc ngày tạo
            phiếu, có nhãn phân biệt. Phiếu nháp chỉ hiển thị cho người lập và
            Administrator.
          </p>
          {!report.images.length && !loading && (
            <Empty>
              Chưa có ảnh phù hợp. Mở một phiếu nhập hoặc đợt giao để đính kèm
              ảnh; thử bỏ bộ lọc để xem chứng từ cũ.
            </Empty>
          )}
          <div className="inspection-grid" aria-busy={loading}>
            {report.images.map((i) => (
              <InspectionCard
                key={i.id + ":" + i.version}
                image={i}
                onChanged={() => setRevision((v) => v + 1)}
                onOrder={onOrder}
                onDraft={onDraft}
              />
            ))}
          </div>
          {report.total > report.pageSize && (
            <div className="actions inspection-pagination">
              <button
                type="button"
                disabled={loading || displayPage <= 1}
                onClick={() => setPage(displayPage - 1)}
              >
                Trang trước
              </button>
              <span>
                Trang {displayPage} /{" "}
                {Math.ceil(report.total / report.pageSize)}
              </span>
              <button
                type="button"
                disabled={
                  loading || displayPage * report.pageSize >= report.total
                }
                onClick={() => setPage(displayPage + 1)}
              >
                Trang sau
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
