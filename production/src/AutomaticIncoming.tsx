import { useEffect, useRef, useState } from "react";
import { can, sizes, type Role } from "../shared/domain";
import { api, send } from "./api";
import { Field, Notice, fmt, vnDate, type Run } from "./ui";
import type { Snapshot } from "./App";
import type { z } from "zod";
import {
  jsonCreateSchema,
  jsonMappingNeedsReview,
} from "../shared/incoming-json";
import { IncomingGoods } from "./IncomingGoods";
type Mapping = z.infer<typeof jsonCreateSchema>["mappings"][number];
export function AutomaticIncoming({
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
  const [text, setText] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [mappings, setMappings] = useState<Mapping[]>([]),
    [date, setDate] = useState(""),
    [supplier, setSupplier] = useState(""),
    [note, setNote] = useState(""),
    [metadataReviewed, setMetadata] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<any[]>([]),
    [draftId, setDraftId] = useState<string | null>(null);
  const inFlight = useRef(false),
    writable = can(role, "receive");
  const reload = async () => setHistory(await api("/api/incoming-json"));
  useEffect(() => {
    if (writable) void reload().catch((e) => setError(e.message));
  }, [writable]);
  const act = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const changeText = (s: string) => {
    setText(s);
    setPreview(null);
    setMetadata(false);
  };
  const read = () =>
    void act(async () => {
      const p = await send("/api/incoming-json/preview", { text });
      setPreview(p);
      setDate(p.source.document.receipt_date);
      setSupplier(p.source.document.supplier);
      setMetadata(false);
      setNote("");
      setMappings(
        p.lines.map((l: any) => ({
          key: l.key,
          sku: l.suggestedSku,
          color: l.suggestedColor,
          keepUnmatched: false,
          reviewed: false,
        })),
      );
    });
  const patch = (key: string, change: Partial<Mapping>) =>
    setMappings((m) => m.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const unreviewed = preview
    ? preview.lines.filter((l: any) => {
        const m = mappings.find((m) => m.key === l.key)!;
        return jsonMappingNeedsReview(l, m) && !m.reviewed;
      }).length
    : 0;
  if (draftId)
    return (
      <IncomingGoods
        key={draftId}
        data={data}
        role={role}
        run={run}
        onOrder={onOrder}
        initialDraftId={draftId}
        jsonMode
        onBack={() => {
          setDraftId(null);
          setPreview(null);
          void reload().catch((e) => setError(e.message));
        }}
      />
    );
  return (
    <div className="incoming-page incoming-json-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">NHẬP DỮ LIỆU ĐÃ XỬ LÝ</div>
          <h1>Nhập hàng tự động từ JSON</h1>
          <p>
            Dán JSON phiếu kiểm hàng → kiểm tra ánh xạ → tạo bảng nháp → đối
            soát lệnh và xác nhận nhận hàng.
          </p>
        </div>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!writable ? (
        <Notice>
          Cần vai trò Administrator hoặc Warehouse Operator để nhập JSON hàng
          về.
        </Notice>
      ) : (
        <>
          <section className="incoming-panel">
            <h2>1. Dán JSON đầu vào</h2>
            <Field label="Dữ liệu JSON hàng về">
              <textarea
                className="json-receipt-input"
                value={text}
                maxLength={1000000}
                disabled={busy}
                placeholder={
                  '{"schema":"comsflow.production.import.v1","import_mode":"WAREHOUSE_RECEIPT",...}'
                }
                onChange={(e) => changeText(e.target.value)}
              />
            </Field>
            <Field label="Hoặc chọn file JSON">
              <input
                type="file"
                accept=".json,application/json,.txt,text/plain"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void act(async () => {
                      if (f.size > 4000000)
                        throw Error(
                          "File quá lớn; JSON tối đa 1.000.000 ký tự",
                        );
                      changeText(await f.text());
                    });
                }}
              />
            </Field>
            <button
              className="primary"
              disabled={busy || !text.trim()}
              onClick={read}
            >
              Đọc JSON và xem ánh xạ
            </button>
            <p>
              Chỉ nhập phiếu WAREHOUSE_RECEIPT. Xem trước chưa ghi nhận hàng và
              không tạo lệnh sản xuất.
            </p>
            <p>
              Chống trùng theo mã chứng từ áp dụng cho phiếu JSON. Với hàng đã
              ghi thủ công trước đây, hãy đối chiếu lịch sử trước khi nhập để
              tránh ghi nhận lần nữa.
            </p>
          </section>
          {preview && (
            <section className="incoming-panel">
              <h2>2. Kiểm tra chứng từ và phân loại</h2>
              <p>
                <b>{preview.source.document.document_id}</b> ·{" "}
                {preview.source.items.length} dòng size nguồn ·{" "}
                {preview.lines.length} dòng mã–màu ·{" "}
                <b>{fmt(preview.total)} sản phẩm</b>
              </p>
              {!!preview.ignoredZero && (
                <Notice>
                  {preview.ignoredZero} ô có số lượng 0 được bỏ qua. Không tự
                  chuyển các size đã ngừng sang size khác.
                </Notice>
              )}
              <div className="form-grid columns-3">
                <Field label="Ngày nhận từ JSON">
                  <input
                    type="date"
                    value={date}
                    disabled={busy}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setMetadata(false);
                    }}
                  />
                </Field>
                <Field label="Nhà xưởng nhận JSON">
                  <input
                    list="json-receipt-suppliers"
                    value={supplier}
                    disabled={busy}
                    onChange={(e) => {
                      setSupplier(e.target.value);
                      setMetadata(false);
                    }}
                  />
                  <datalist id="json-receipt-suppliers">
                    {preview.suppliers.map((s: string) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Ghi chú bổ sung JSON">
                  <input
                    maxLength={500}
                    value={note}
                    disabled={busy}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
              </div>
              <p>
                Người kiểm trên nguồn:{" "}
                {preview.source.document.checker || "Chưa ghi"}. Ngày/xưởng
                nguồn: {preview.source.document.receipt_date} /{" "}
                {preview.source.document.supplier}.
              </p>
              {preview.source.document.supplier_review_required && (
                <Notice>
                  Nguồn đánh dấu cần kiểm tra tên xưởng. Chọn hoặc sửa đúng tên
                  xưởng trước khi đối soát lệnh.
                </Notice>
              )}
              {preview.source.notes.map((n: string, i: number) => (
                <p className="json-source-note" key={i}>
                  {n}
                </p>
              ))}
              <label className="check-label">
                <input
                  aria-label="Đã kiểm tra thông tin chứng từ JSON"
                  type="checkbox"
                  checked={metadataReviewed}
                  disabled={busy}
                  onChange={(e) => setMetadata(e.target.checked)}
                />
                Tôi đã kiểm tra mã chứng từ, ngày nhận, nhà xưởng và tổng số
                lượng.
              </label>
              <Notice>
                Ô màu gợi ý cần được kiểm tra theo đúng mã sản phẩm. Dòng chưa
                có mã/màu có thể chọn giữ nguyên để ghi nhận Chưa đối chiếu
                lệnh. Số bao trống được giữ trống, không tự kế thừa. Có thể
                chỉnh số lượng ở bảng nháp sau bước này.
              </Notice>
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    setMappings((ms) =>
                      ms.map((m) => {
                        const l = preview.lines.find(
                          (l: any) => l.key === m.key,
                        );
                        return !l.needsReview &&
                          !m.keepUnmatched &&
                          !!m.color &&
                          preview.variants.some(
                            (v: any) =>
                              v.sku.toUpperCase() === m.sku.toUpperCase() &&
                              v.color === m.color,
                          )
                          ? { ...m, reviewed: true }
                          : m;
                      }),
                    )
                  }
                >
                  Đã kiểm tra các gợi ý màu
                </button>
                <span>{unreviewed} dòng cần xác nhận kiểm tra</span>
              </div>
              <p>
                Dòng nguồn đánh dấu cần xác minh và hàng giữ nguyên chưa đối
                chiếu phải xác nhận riêng từng dòng.
              </p>
              <div className="table-scroll json-receipt-mapping">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng / bao nguồn</th>
                      <th>Mã / màu JSON</th>
                      <th>Mã sản phẩm trên app</th>
                      <th>Màu trên app</th>
                      {sizes.map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                      <th>Kiểm tra / phân loại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((l: any) => {
                      const m = mappings.find((r) => r.key === l.key)!;
                      const codes = [
                          ...new Set<string>(
                            preview.variants.map((v: any) => v.sku),
                          ),
                        ].sort(),
                        colors = [
                          ...new Set<string>(
                            preview.variants
                              .filter(
                                (v: any) =>
                                  v.sku.toUpperCase() === m.sku.toUpperCase(),
                              )
                              .map((v: any) => v.color),
                          ),
                        ];
                      return (
                        <tr key={l.key}>
                          <td>
                            Dòng {l.sourceRow}
                            <small>Bao: {l.bag || "Không ghi"}</small>
                          </td>
                          <td>
                            <b>{l.sku}</b>
                            <small>{l.color}</small>
                            <small>{l.skuSources.join(", ")}</small>
                          </td>
                          <td>
                            <select
                              aria-label={"Mã ánh xạ dòng " + l.key}
                              disabled={busy || m.keepUnmatched}
                              value={m.sku}
                              onChange={(e) =>
                                patch(l.key, {
                                  sku: e.target.value,
                                  color: "",
                                  reviewed: false,
                                })
                              }
                            >
                              {!codes.includes(l.sku) && (
                                <option value={l.sku}>
                                  {l.sku} — mã nguồn chưa có
                                </option>
                              )}
                              {codes.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {m.keepUnmatched ? (
                              <span>{m.color}</span>
                            ) : (
                              <select
                                aria-label={"Màu ánh xạ dòng " + l.key}
                                disabled={busy}
                                value={m.color}
                                onChange={(e) =>
                                  patch(l.key, {
                                    color: e.target.value,
                                    reviewed: false,
                                  })
                                }
                              >
                                <option value="">Chọn màu đầy đủ</option>
                                {colors.map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                            )}
                            <small>{l.matchSource}</small>
                          </td>
                          {sizes.map((s) => (
                            <td key={s}>{fmt(l.quantities[s])}</td>
                          ))}
                          <td>
                            <label>
                              <input
                                aria-label={"Giữ chưa đối chiếu dòng " + l.key}
                                type="checkbox"
                                disabled={busy}
                                checked={m.keepUnmatched}
                                onChange={(e) =>
                                  patch(l.key, {
                                    keepUnmatched: e.target.checked,
                                    sku: l.sku,
                                    color: e.target.checked
                                      ? l.color
                                      : l.suggestedColor,
                                    reviewed: false,
                                  })
                                }
                              />
                              Giữ nguyên, chưa đối chiếu
                            </label>
                            <label>
                              <input
                                aria-label={"Đã kiểm tra dòng JSON " + l.key}
                                type="checkbox"
                                disabled={busy}
                                checked={m.reviewed}
                                onChange={(e) =>
                                  patch(l.key, { reviewed: e.target.checked })
                                }
                              />
                              Đã kiểm tra dòng
                            </label>
                            {l.needsReview && (
                              <b className="orange-text">
                                Nguồn yêu cầu kiểm tra
                              </b>
                            )}
                            {l.reviewNotes.map((n: string, i: number) => (
                              <small key={i}>{n}</small>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                className="primary"
                disabled={
                  busy ||
                  !metadataReviewed ||
                  !date ||
                  !supplier.trim() ||
                  mappings.some((m) => !m.color || !m.sku) ||
                  !!unreviewed
                }
                onClick={() =>
                  void act(async () => {
                    const r = await send(
                      `/api/incoming-json/${preview.id}/create`,
                      { date, supplier, note, metadataReviewed, mappings },
                    );
                    setDraftId(r.id);
                  })
                }
              >
                Tạo phiếu JSON để đối soát lệnh
              </button>
              <p>
                Bước này chỉ tạo phiếu nháp, chưa ghi số nhận vào lệnh. Mã chứng
                từ đã có phiếu sẽ bị chặn nhập lại; mở phiếu cũ ở danh sách bên
                dưới.
              </p>
            </section>
          )}
          <section className="incoming-panel">
            <h2>Phiếu JSON của tôi</h2>
            <button disabled={busy} onClick={() => void act(reload)}>
              Tải lại phiếu JSON
            </button>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mã chứng từ</th>
                    <th>Ngày nguồn / xưởng</th>
                    <th>Tổng nguồn</th>
                    <th>Trạng thái</th>
                    <th>Thực nhận</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        {h.document_id}
                        <small>{vnDate(h.created_at)}</small>
                      </td>
                      <td>
                        {h.document.receipt_date}
                        <small>{h.document.supplier}</small>
                      </td>
                      <td>{fmt(Number(h.original_total))}</td>
                      <td>
                        {h.state === "confirmed" ? "Đã ghi nhận" : "Nháp"}
                      </td>
                      <td>{h.result ? fmt(h.result.received) : "Chưa ghi"}</td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => setDraftId(h.id)}
                        >
                          Mở phiếu JSON
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!history.length && <p>Chưa có phiếu JSON.</p>}
          </section>
        </>
      )}
      {busy && <p role="status">Đang xử lý JSON…</p>}
    </div>
  );
}
