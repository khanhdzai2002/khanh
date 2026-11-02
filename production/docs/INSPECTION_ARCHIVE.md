# Ảnh phiếu kiểm và kho chứng từ hàng về

## Cách dùng

- Trong **Nhập liệu hàng về** hoặc phiếu ở **Nhập hàng tự động**, mở **Thêm ảnh phiếu kiểm**, chọn ngày kiểm trên phiếu, loại chứng từ, ảnh và ghi chú, rồi **Lưu thêm ảnh phiếu kiểm**. Có thể thêm nhiều lần, kể cả phiếu đã xác nhận. Bảng số lượng đang nhập không bị tải lại khi lưu ảnh.
- Trong chi tiết lệnh → **Ảnh phiếu kiểm theo đợt nhận**, mở đợt giao để bổ sung chứng từ cho biên nhận nhập trực tiếp. Nếu đợt giao được phân bổ từ phiếu nhập, ảnh được lưu về đúng phiếu nguồn và hiện trên các lệnh được phân bổ từ phiếu đó.
- Mở **Kho ảnh phiếu kiểm** để tìm theo tên ảnh, mã phiếu, mã lệnh, mã/màu sản phẩm hoặc nhà xưởng; lọc tháng/ngày kiểm, loại chứng từ, nguồn nhập và trạng thái. Thống kê tổng ảnh, số phiếu có ảnh và dung lượng áp dụng cho toàn bộ kết quả, không chỉ trang hiện tại. Các nút tháng cho biết số ảnh của từng tháng theo các bộ lọc nội dung (không giới hạn bởi bộ lọc ngày). Mặc định xem tất cả thời gian; danh sách có phân trang.
- Bấm ảnh để xem, phóng to, xoay; **Tải ảnh** giữ nguyên file gốc. Có liên kết mở phiếu nhập và các lệnh liên quan. **Phân loại ảnh** cho phép sửa ngày kiểm, loại chứng từ, ghi chú; mỗi thay đổi được lưu audit, có kiểm tra phiên bản chống ghi đè giữa người dùng.

## Lưu trữ và quyền

Ảnh JPEG/PNG/WebP giữ nguyên bytes trong PostgreSQL, không dùng ổ tạm của Railway, không gửi AI/dịch vụ bên ngoài. Mỗi lần tải tối đa 4 ảnh / 8 MB; mỗi phiếu tối đa 40 ảnh / 80 MB. Ảnh trùng bytes trong chính phiếu được bỏ qua khi tải lại, không tạo ảnh hay nhận hàng trùng. Chỉ tải metadata cho danh sách; bytes ảnh tải riêng khi cần xem.

Administrator và Warehouse Operator có thể thêm/phân loại ảnh trên phiếu do mình lập; Administrator có thể quản lý mọi phiếu. Người có quyền đọc xem được ảnh của phiếu đã ghi nhận. Phiếu nháp chỉ người lập và Administrator xem được. Các đường dẫn ảnh yêu cầu đăng nhập; thao tác ghi kiểm tra CSRF/Origin và vai trò tại backend.

## Bảo toàn dữ liệu đang có

Migration **015_inspection_archive.sql** chỉ mở rộng cấu trúc và tạo bảng phân loại đi kèm. Không xóa/reset/backfill phiếu, biên nhận, nguồn JSON, ảnh, số lượng, SKU, tồn kho hoặc lệnh cũ. Trigger mới chặn UPDATE/DELETE ảnh gốc. Các đường dẫn xem ảnh cũ vẫn hoạt động.

Ảnh cũ xuất hiện ngay trong kho: lấy ngày kiểm từ JSON nguồn nếu có, nếu không lấy ngày nhận/ngày tạo phiếu và ghi rõ nguồn ngày. Không bịa giờ tải cho ảnh cũ chưa được ghi thời điểm riêng. Khi phân loại ảnh cũ, chỉ thêm/sửa metadata, giữ nguyên file và chứng từ gốc.

Thêm ảnh không đổi `form`, `version`, `result` hoặc `confirmation_hash` của phiếu; không đổi biên nhận, khóa idempotency, phân bổ, sản lượng hoặc tồn kho. Retry xác nhận cũ vẫn trả kết quả cũ. Kiểm tra ảnh trùng khi tạo/xác nhận phiếu mới tiếp tục hoạt động, kể cả ảnh đính kèm biên nhận trực tiếp. Thêm cùng ảnh cho các biên nhận đã chốt chỉ bổ sung chứng từ, không ghi hàng.

Khởi động backend tự chạy migration theo cơ chế hiện có. Không chạy reset/import lại dữ liệu khi triển khai. Kiểm thử migration với schema giả lập có dữ liệu trước 015 xác minh ảnh bytes, phiếu, biên nhận, sản lượng và tồn kho giữ nguyên; đây không phải kiểm chứng hay sao lưu database Railway thực tế.
