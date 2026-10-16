# Đối chiếu nút thao tác V9 và quyền trên COMS-FLOW

File V9 gửi lại có SHA-256 `5e468146bd3ed292b7e4494a1276e4572d08161743a5f83f57adb36ce20b3316`, trùng bản đã đọc/đối chiếu trong V9_FEATURE_MAP.md và docs/V9_SOURCE_INVENTORY.md. Không có thay đổi công thức do lần gửi lại này. 400 trường hợp tính toán vẫn được đối chiếu với calc V9 gốc trong bộ test.

Ảnh người dùng đã đăng nhập hiển thị **Viewer** ở góc trên. Đây là nguyên nhân các nút ghi bị ẩn; dữ liệu trống chưa chứng minh thiếu module. V9 chạy một người, không có phân quyền; ứng dụng nhiều người kiểm tra quyền cả UI lẫn backend.

| Thao tác V9 | Trong ứng dụng mới | Quyền thao tác |
| --- | --- | --- |
| Thêm SKU, mã/màu/nhiều size; sửa số bán/tồn/đang về/test | Dự kiến sản xuất | Administrator / Production Planner |
| Chính sách 5 ngày, vòng đời, đổi trạng thái theo mã | Dự kiến sản xuất | Administrator / Production Planner |
| Chọn SKU đề xuất và lập lệnh | Dự kiến sản xuất → Lập lệnh | Administrator / Production Planner |
| Tạo lệnh thủ công, nhóm màu/size, ưu tiên, lưu | Gối lệnh sản xuất → Tạo lệnh sản xuất | Administrator / Production Planner |
| Sửa lệnh đã lưu, lý do, lịch sử thay đổi | Chi tiết lệnh / Lịch sử & giao nhận | Administrator / Production Planner |
| Nhận nhiều đợt, giới hạn số còn chờ | Chi tiết lệnh → Ghi nhận hàng | Administrator / Warehouse Operator |
| Hủy phần chờ, mở lại, xóa mềm/khôi phục | Chi tiết lệnh / Lệnh đã xóa | Administrator / Production Planner |
| Import bán hàng và chuyển số bán sang kế hoạch | Phân tích bán hàng | Administrator / Production Planner |
| Import bản sao lưu JSON V9, xem trước và xác nhận | Cấu hình & dữ liệu → Nhập dữ liệu V9 | Administrator |
| CSV/XLSX, bản in theo chức năng hiện có | Các bảng và chi tiết lệnh | Xem dữ liệu theo quyền; thao tác ghi vẫn bị chặn |
| Cấp quyền nhân viên (mới so với V9) | Cấu hình & dữ liệu → Phân quyền | Administrator |

Khác biệt có chủ đích: SKU phải được tạo trong Dự kiến sản xuất trước khi chọn vào lệnh để giữ danh mục và khóa ngoại; không seed dữ liệu bán nhúng V9. Backup toàn database dùng công cụ PostgreSQL thay vì localStorage. Lark Base chỉ đọc preview, chưa sync; workflow duyệt Manager chưa triển khai. Không tuyên bố đã gửi lệnh tới xưởng khi chỉ đổi trạng thái nội bộ.

## Khởi tạo Administrator đầu tiên không cần SQL thủ công

1. Đăng nhập Lark và mở **Cấu hình & dữ liệu → Tích hợp & môi trường → Tài khoản & quyền thao tác**.
2. Chủ hệ thống kiểm tra đúng tài khoản và sao chép **Lark Open ID của tài khoản đang đăng nhập**. Đây là định danh, không phải App Secret hoặc token.
3. Trong Railway → khanh → Variables thêm **LARK_INITIAL_ADMIN_OPEN_ID** bằng Open ID đó, Save và Deploy.
4. Mở lại Cấu hình bằng đúng tài khoản → nhấn **Khởi tạo Administrator cho tài khoản của tôi**. Backend kiểm tra tenant, danh tính cấu hình, trạng thái tài khoản, chưa có Administrator, chưa từng bootstrap; yêu cầu session/CSRF và có transaction/advisory lock.
5. Thành công sẽ reload giao diện. Các nút theo vai trò Administrator xuất hiện; vào **Phân quyền** để cấp Production Planner/Warehouse Operator cho từng nhân viên.
6. Có thể gỡ biến initial-admin sau khi hoàn tất. Bản ghi audit bất biến giữ bước này chỉ dùng một lần, kể cả sau khi hạ quyền. Có Administrator (kể cả bị khóa) thì không dùng bootstrap này; quản trị tài khoản qua Administrator hoặc CLI vận hành đã được ủy quyền.

Không tự cấp admin cho người đầu tiên đăng nhập, không chấp nhận open_id/role do request browser chọn. Người giữ quyền Railway là người chỉ định chính xác danh tính, người dùng đó xác nhận trong phiên Lark của họ. Các nhân viên còn lại tiếp tục mặc định Viewer.
