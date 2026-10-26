# Giao nhận theo sản lượng thực tế

Theo yêu cầu mới, cắt tròn cây vải có thể làm sản lượng giao khác số đặt. Chính sách này thay thế giới hạn nhận không vượt số đặt của V9.

- Cho nhận vượt từng SKU và nhận thêm sau khi đã đủ; mỗi đợt là số nguyên dương tối đa 1.000.000/SKU. Không được dùng dòng thuộc lệnh khác.
- Số đặt gốc giữ nguyên. Đã nhận là tổng các biên nhận thực tế. Tiến độ = tổng nhận / tổng đặt × 100%, có thể vượt 100%. Thanh tiến độ chỉ tô tối đa chiều rộng khung, nhãn phần trăm giữ giá trị thực.
- Còn chờ = tổng max(0, số đặt − đã nhận) của từng SKU. Giao dư = tổng max(0, đã nhận − số đặt) của từng SKU. Không bù dư màu/size này sang thiếu màu/size khác.
- Chỉ báo Đã giao đủ/Đã giao vượt khi mọi SKU đều đủ; tổng trên 100% nhưng còn thiếu SKU vẫn là Đã giao một phần.
- Nếu giao ít hơn, tiếp tục để phần thiếu trong Còn chờ, hoặc người có quyền dùng Hủy phần còn chờ với lý do khi xưởng chốt không giao tiếp. Không tự coi hàng thiếu là đã nhận.
- Không sửa biên nhận cũ, không tự cộng tồn kho, không tự đổi số đặt bằng số nhận. Khóa phiên bản, transaction, phân quyền và idempotency được giữ.
- Sửa ghi chú/ưu tiên lệnh đã giao dư vẫn được phép, giữ SKU và số đặt gốc. Không giảm tiếp số đặt dưới min(số đặt hiện tại, đã nhận).
- Migration 008 chỉ nới ràng buộc số nhận trong PostgreSQL, không thay đổi dữ liệu đã lưu. Lệnh đã xóa/hủy vẫn không nhận thêm.
