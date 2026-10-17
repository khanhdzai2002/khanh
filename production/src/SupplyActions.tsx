import { useState } from "react";
import { RefreshCw, ClipboardCheck } from "lucide-react";
import { send } from "./api";
import { Modal, Notice, fmt, type Run } from "./ui";
export function SupplyActions({
  ids,
  run,
  busy,
  writable,
}: {
  ids: string[];
  run: Run;
  busy: boolean;
  writable: boolean;
}) {
  const [kind, setKind] = useState<"inventory" | "inbound" | null>(null),
    [preview, setPreview] = useState<any>(null);
  const [includeDrafts, setDrafts] = useState(false),
    [includePaused, setPaused] = useState(false),
    [dirty, setDirty] = useState(false);
  const [scope, setScope] = useState<string[]>([]);
  const read = (
    type: "inventory" | "inbound",
    target: string[],
    drafts = false,
    paused = false,
  ) => {
    setKind(type);
    setPreview(null);
    setScope(target);
    setDrafts(drafts);
    setPaused(paused);
    setDirty(true);
    void run(
      async () => {
        const value = await send(
          type === "inventory"
            ? "/api/lark/inventory/preview"
            : "/api/planning/inbound/preview",
          type === "inventory"
            ? { ids: target }
            : { ids: target, includeDrafts: drafts, includePaused: paused },
        );
        setPreview(value);
        setDirty(false);
      },
      type === "inventory"
        ? "Đã đọc tồn Lark; kiểm tra trước khi cập nhật"
        : "Đã đối soát lệnh; kiểm tra trước khi cập nhật",
    );
  };
  if (!writable) return null;
  return (
    <>
      <div className="actions supply-actions">
        <button
          disabled={busy || !ids.length || ids.length > 2000}
          onClick={() => read("inventory", ids)}
        >
          <RefreshCw size={16} />
          Cập nhật tồn từ Lark
        </button>
        <button
          disabled={busy || !ids.length || ids.length > 2000}
          onClick={() => read("inbound", ids)}
        >
          <ClipboardCheck size={16} />
          Đối soát hàng đang về
        </button>
        <small>
          Áp dụng cho {ids.length} SKU đã chọn hoặc đang xem. Đọc nguồn → kiểm
          tra → cập nhật, không nhập từng ô.
        </small>
      </div>
      {kind && (
        <Modal
          title={
            kind === "inventory"
              ? "Cập nhật tồn kho từ Lark"
              : "Đối soát hàng đang về từ lệnh sản xuất"
          }
          onClose={() => {
            setKind(null);
            setPreview(null);
          }}
        >
          {kind === "inventory" ? (
            <Notice>
              Lấy theo đúng mã–màu–size từ nguồn Lark đã cấu hình. Ô size trống
              = 0 theo cấu hình; SKU không tìm thấy giữ nguyên. Chỉ cập nhật tồn
              thực tế, giữ nguyên doanh số, vòng đời và hàng đang về. Nếu chưa
              có nguồn, Administrator cần cấu hình tại Cấu hình & dữ liệu → Tồn
              kho Lark Base.
            </Notice>
          ) : (
            <>
              <Notice>
                Hàng đang về = tổng số đặt − số đã nhận theo từng SKU. Mặc định
                lấy các lệnh đã gửi xưởng, đã xác nhận hoặc đang sản xuất; loại
                nháp, tạm dừng, đã xóa, đã hủy. Cập nhật sẽ thay thế số đang về
                hiện tại, không cộng dồn và không cộng thêm lần nữa vào công
                thức dự báo.
              </Notice>
              <div className="actions">
                <label>
                  <input
                    type="checkbox"
                    checked={includeDrafts}
                    disabled={busy}
                    onChange={(e) => {
                      setDrafts(e.target.checked);
                      setDirty(true);
                    }}
                  />{" "}
                  Tính cả lệnh nháp
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={includePaused}
                    disabled={busy}
                    onChange={(e) => {
                      setPaused(e.target.checked);
                      setDirty(true);
                    }}
                  />{" "}
                  Tính cả lệnh tạm dừng
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    read("inbound", scope, includeDrafts, includePaused)
                  }
                >
                  Đối soát lại
                </button>
              </div>
            </>
          )}
          {!preview && (
            <p>
              {busy
                ? "Đang đọc dữ liệu…"
                : "Chưa có kết quả. Kiểm tra thông báo lỗi hoặc thử đọc lại."}
            </p>
          )}
          {preview && (
            <>
              <p>
                {scope.length} SKU yêu cầu · {preview.rows.length} SKU có kết
                quả · đọc lúc{" "}
                {new Date(preview.fetchedAt).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
                .
              </p>
              {(preview.warnings || []).map((w: string) => (
                <Notice key={w}>{w}</Notice>
              ))}
              {preview.errors?.length > 0 && (
                <div className="error-list">
                  {preview.errors.slice(0, 50).map((e: string, i: number) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Mã SP</th>
                      <th>Màu</th>
                      <th>Size</th>
                      <th>Hiện tại</th>
                      <th>
                        {kind === "inventory" ? "Tồn Lark" : "Đang về đối soát"}
                      </th>
                      <th>
                        {kind === "inventory"
                          ? "Ngày kiểm / xử lý"
                          : "Các lệnh còn chờ"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 200).map((r: any, i: number) => (
                      <tr key={i}>
                        <td>{r.sku}</td>
                        <td>{r.color}</td>
                        <td>{r.size}</td>
                        <td>
                          {r.previous === null ? "Chưa nhập" : fmt(r.previous)}
                        </td>
                        <td>
                          {fmt(kind === "inventory" ? r.stock : r.inbound)}
                        </td>
                        <td>
                          {kind === "inventory"
                            ? `${r.date} · ${r.action === "update" ? "Cập nhật" : r.action === "older" ? "Bỏ qua: tồn cũ hơn" : "Bỏ qua"}`
                            : r.sources.length
                              ? r.sources.map((s: any) => (
                                  <div key={s.orderId}>
                                    {s.code}: {fmt(s.ordered)} −{" "}
                                    {fmt(s.received)} = <b>{fmt(s.pending)}</b>
                                  </div>
                                ))
                              : "Không có lệnh hợp lệ → cập nhật 0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 200 && (
                <p>
                  Hiển thị 200/{preview.rows.length} SKU; xác nhận áp dụng toàn
                  bộ kết quả.
                </p>
              )}
              {kind === "inbound" && preview.ignored.length > 0 && (
                <details>
                  <summary>
                    {preview.ignored.length} lệnh bị loại khỏi đối soát
                  </summary>
                  {preview.ignored.slice(0, 100).map((o: any, i: number) => (
                    <p key={i}>
                      {o.code} · {o.reason}
                    </p>
                  ))}
                </details>
              )}
              <Notice>
                Bản xem trước có hiệu lực 15 phút. Nếu SKU hoặc lệnh thay đổi,
                hãy đối soát lại. Nhận hàng từ xưởng chưa tự tăng tồn thực tế;
                cần kiểm kho trước khi cập nhật tồn Lark.
              </Notice>
              {dirty && (
                <p>
                  Lựa chọn đã thay đổi; bấm Đối soát lại trước khi cập nhật.
                </p>
              )}
              <button
                className="primary"
                disabled={
                  busy ||
                  dirty ||
                  preview.errors?.length > 0 ||
                  (kind === "inventory" && !preview.count)
                }
                onClick={() =>
                  void run(
                    () =>
                      send(
                        kind === "inventory"
                          ? `/api/lark/inventory/${preview.id}/confirm`
                          : `/api/planning/inbound/${preview.id}/confirm`,
                        {},
                      ),
                    kind === "inventory"
                      ? "Đã cập nhật tồn từ Lark"
                      : "Đã cập nhật hàng đang về từ các lệnh, không cộng trùng",
                  ).then((ok) => {
                    if (ok) {
                      setKind(null);
                      setPreview(null);
                    }
                  })
                }
              >
                {kind === "inventory"
                  ? "Xác nhận cập nhật tồn kho"
                  : "Cập nhật hàng đang về"}
              </button>
            </>
          )}
          {kind === "inventory" && !preview && !busy && (
            <button onClick={() => read("inventory", scope)}>
              Đọc lại tồn Lark
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
