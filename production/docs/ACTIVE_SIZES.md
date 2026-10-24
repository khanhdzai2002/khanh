# Chính sách size hiện tại: S, M, L, XL

Theo yêu cầu mới của chủ hệ thống, từ bản cập nhật này **chỉ kinh doanh/sản xuất S, M, L, XL**. XS và2XL (bao gồm alias XXL từ file bán hàng) ngừng sử dụng. Chính sách này thay phần6size của V9, không thay công thức gối5ngày, vòng đời hoặc quy trình giao nhận.

## Phần đã bỏ

Không còn lựa chọn/cột XS và2XL ở thêm/sửa SKU, dự báo, thêm nhiều size/màu, tạo lệnh/ma trận size, lên lệnh nhanh, phân tích bán hàng/ma trận màu-size, báo cáo tỷ trọng, bảng chờ/biểu đồ/mục con, bộ lọc size và cấu hình tồn Lark. Bảng nhập số lượng chia4cột; thẻ size ở màn hình nhỏ chia2×2.

Danh mục/API kế hoạch chỉ trả SKU đang dùng. Backend và database chặn tạo SKU size cũ, thêm dòng sản xuất size cũ và tăng số đặt của dòng size cũ. Không thể dùng UUID SKU cũ để lách giới hạn giao diện. Tồn Lark chỉ đọc4cột hiện hành; không gán nhầm cộtXXL vàoXL và không đổi dữ liệu của Base gốc.

File nhập kế hoạch hoặc JSON V9 có size cũ bị chặn trước khi ghi; giữ bản gốc để đối soát, không tự chuyển size hoặc âm thầm xóa dòng. File bán hàng vẫn nhận diện đúng size cũ nhưng đưa vào nhóm loại trừ, không vào sản lượng hợp lệ/dự báo/lên lệnh. Dữ liệu bán size cũ đã lưu cũng loại khỏi báo cáo vận hành mà không xóa nguồn lịch sử. Không coi XS làS hoặc XXL làXL.

## Bảo toàn lịch sử

Không xóa hàng loạt dữ liệu thật, lệnh, biên nhận, snapshot hoặc audit. Các SKU/lệnh cũ vẫn tồn tại để đối soát:

- Lệnh chỉ có size cũ không xuất hiện trong danh sách sản xuất vận hành; vẫn xem tại Lịch sử & giao nhận hoặc lịch sử xóa nếu đã xóa mềm.
- Lệnh có cả size hiện hành và size cũ vẫn là hợp đồng gốc: chi tiết/giao nhận/lịch sử giữ đúng dòng, số đã đặt, số đã nhận. Không che hoặc sửa số lịch sử thành số mới.
- Khi sửa lệnh cũ, ma trận nhập chỉ4size. Có thông báo những dòng đã ngừng được giữ nguyên ngoài bảng; tổng ma trận chỉ tính4size, không ngầm cộng dòng ẩn vào cột tổng. Backend không cho tăng/xóa/đổi định danh hoặc số đặt của dòng đã ngừng trong thao tác sửa. Sửa ghi chú/xưởng/ngày vẫn bảo toàn item ID và biên nhận.
- Có thể ghi nhận phần giao còn lại của lệnh cũ để tất toán lịch sử; thao tác này không tạo thêm sản xuất hay tự tăng tồn. Hủy phần còn chờ/khôi phục vẫn cần thao tác và lý do riêng.
- Dashboard, dự báo, báo cáo và số còn chờ vận hành chỉ tính4size. Tỷ trọng **trong lệnh** vẫn dùng tổng hợp đồng gốc làm mẫu số, không giả mạo tổng cũ.
- CSV/Excel tổng hợp vận hành chỉ4size. Khi xuất riêng chứng từ lệnh hoặc lịch sử xóa, cột size cũ chỉ xuất hiện nếu chứng từ đó thực sự có dữ liệu cũ, để không làm sai tài liệu gốc. Lệnh mới không có cột cũ trống.

Migration007 chỉ thêm chặn dữ liệu mới và bỏ2khóa ánh xạ tồn Lark cũ, tăng source version để các preview cũ không ghi tiếp. Không đổi số lượng của bất kỳ SKU/lệnh nào và không chạm các bảng biên nhận/audit bất biến. Constraint lưu trữ vẫn đọc được size lịch sử; đây không phải size được phép tạo mới.

Backup PostgreSQL lịch sử vẫn phải phục hồi đầy đủ theo quy trình sao lưu hiện có, không lọc/xóa size trong bản gốc. Luồng nhập JSON V9 là nhập mới, do đó bản có dòng size cũ cần đối soát trước; không tự dùng nó để tạo lại sản xuất đã ngừng.

## Kiểm thử

200tests/16file đạt, gồm9tests chính sách size mới: validation/backend/DB, dùng UUID cũ, lịch sử item/receipt bất biến khi sửa metadata, cấm thêm/tăng/xóa dòng cũ, báo cáo/dự báo không gối size cũ, tất toán lịch sử, loại trừ sales/alias, ánh xạ Lark4size và migration source/version. Đã cập nhật các test ma trận/export từ6sang4cột mà vẫn kiểm tra đủ tổng.

6luồng Chromium trên PostgreSQL `_test` riêng đã đạt: giao diện size hiện hành/API chặn size cũ; V9 core tạo-sửa-nhận-hủy-xóa-khôi phục; tồn→đang về→lên lệnh nhanh; tồn Lark4size; XLSX bán hàng/CSV4size; bảng chờ/biểu đồ/mục con. Desktop/mobile không lỗi JavaScript hoặc tràn trang. Không sửa dữ liệu sản xuất thật trong kiểm thử; chưa xác minh deploy Railway/database công ty.
