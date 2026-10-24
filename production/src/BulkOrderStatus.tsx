import { useState } from "react";
import { statuses, type ProductionOrder } from "../shared/domain";
import { send } from "./api";
import { Modal, Field, Notice, type Run } from "./ui";
export function BulkOrderStatus({
  orders,
  run,
  busy,
  onClose,
  onSaved,
}: {
  orders: ProductionOrder[];
  run: Run;
  busy: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] =
      useState<(typeof statuses)[number]>("Đã xác nhận"),
    [reason, setReason] = useState("");
  return (
    <Modal
      title={`Đổi trạng thái ${orders.length} lệnh sản xuất`}
      onClose={onClose}
    >
      <Notice>
        Đổi trạng thái nội bộ của các lệnh đã chọn. Không tự gửi email/tin nhắn
        tới xưởng, không sửa số lượng, ưu tiên hoặc biên nhận. Hoàn thành/giao
        một phần tính từ hàng đã nhận; hủy/khôi phục là thao tác riêng.
      </Notice>
      <Field label="Trạng thái nội bộ mới">
        <select
          disabled={busy}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Lý do đổi trạng thái hàng loạt">
        <textarea
          disabled={busy}
          minLength={3}
          maxLength={450}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Nhập lý do (ít nhất 3 ký tự)"
        />
      </Field>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mã lệnh</th>
              <th>Trạng thái hiện tại</th>
              <th>Sau cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.code}</td>
                <td>{o.status}</td>
                <td>{o.status === status ? "Giữ nguyên" : status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Notice>
        Lưu lịch sử trước/sau cho từng lệnh. Nếu bất kỳ lệnh nào đã thay đổi
        trong lúc mở cửa sổ này, toàn bộ lần cập nhật sẽ bị chặn để bạn tải lại.
      </Notice>
      <button
        className="primary"
        disabled={busy || reason.trim().length < 3}
        onClick={() =>
          void run(async () => {
            const result = await send("/api/orders/bulk-status", {
              orders: orders.map((o) => ({
                id: o.id,
                expectedVersion: o.version,
              })),
              status,
              reason: reason.trim(),
            });
            if (!result.changed && result.unchanged) return;
          }, "Đã xử lý trạng thái các lệnh; chỉ lệnh thay đổi được lưu lịch sử").then(
            (ok) => {
              if (ok) onSaved();
            },
          )
        }
      >
        Xác nhận đổi trạng thái
      </button>
    </Modal>
  );
}
