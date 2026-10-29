# Ảnh sản phẩm và loại hàng

Mở **Thiết lập sản phẩm** trong menu bên trái. Danh sách lấy mã đã lưu trong danh mục; một mã có một ảnh nhận diện và một loại hàng mặc định dùng chung cho mọi màu/size. Có tìm mã/tên không dấu, lọc In/Trơn/chưa chọn loại và chỉ xem mã chưa có ảnh.

1. Bấm **Thiết lập** tại mã cần sửa, chọn ảnh JPEG/PNG/WebP.
2. Chọn loại mặc định **In** hoặc **Trơn**; có thể để Chưa thiết lập nếu chưa xác định.
3. Bấm **Lưu thiết lập sản phẩm**. Gỡ ảnh chỉ có hiệu lực sau khi lưu; đóng cửa sổ không ghi thay đổi. Ảnh gốc tối đa20MB, trình duyệt tối ưu cạnh dài tối đa1.600px thành JPEG tối đa2MB (nền trắng cho ảnh trong suốt); backend giới hạn/kiểm tra định dạng riêng.

Administrator và Production Planner được cập nhật; các vai trò khác chỉ đọc. Backend kiểm tra đăng nhập, quyền, Origin/CSRF và phiên bản thiết lập để không ghi đè thay đổi của người khác. Ảnh chỉ được tải qua API có đăng nhập, không có URL ảnh công khai hoặc dịch vụ AI.

## Khi lập và xem lệnh

- Dự kiến sản xuất: thêm ảnh và loại mặc định bên cạnh mã; Lên lệnh nhanh mang loại mặc định vào các dòng mới.
- Lập/chỉnh sửa lệnh: bảng có ảnh thu nhỏ và cột **Loại hàng** theo dòng màu. Chọn In/Trơn áp dụng cho các size thuộc dòng đó. Thêm size vào dòng giữ loại hiện có. Nếu một dòng đang có loại khác nhau theo size, hiển thị rõ “Khác nhau theo size”, chỉ đổi khi người dùng chọn lại.
- Bấm ảnh để phóng to; Escape chỉ đóng ảnh, giữ biểu mẫu lệnh và số lượng đang nhập.
- Chi tiết lệnh có ảnh, loại hàng; in/PDF hiển thị ảnh hiện tại. CSV/Excel có thêm cột Loại hàng. Không nhúng ảnh nhị phân vào CSV/XLSX.

Loại được lưu trên từng dòng lệnh. Thay loại mặc định trong Thiết lập sản phẩm không tự đổi lệnh đã lưu; chỉnh loại trong lệnh cần lý do và có revision/audit như chỉnh lệnh hiện hành. Lệnh cũ chưa có loại giữ **Chưa chọn**, không đoán từ tên màu hay tự backfill. Client cũ không gửi loại vẫn giữ loại cũ khi chỉnh sửa. Thay ảnh chỉ cập nhật ảnh nhận diện dùng chung; ảnh trong màn hình/in lệnh cũ là ảnh hiện tại, không phải bản snapshot ảnh tại ngày lập lệnh.

## Lưu trữ và triển khai

Migration012 thêm `product_profiles` theo product ID và `production_order_items.goods_type` nullable. Không sửa quantities, biên nhận, tồn kho hoặc công thức gối. Ảnh lưu PostgreSQL cùng backup database, không dùng filesystem tạm trên Railway; mỗi mã chỉ lưu một bản ảnh hiện hành. Dashboard chỉ trả URL/metadata ảnh, không đưa base64 vào payload SKU.

Startup/pre-deploy tự chạy migration theo cấu hình hiện có. Chỉ mã đã lưu mới có thể thiết lập ảnh; mã mới đang gõ trong lệnh sẽ xuất hiện ở danh sách thiết lập sau khi lưu lệnh thành công. Không cần biến môi trường/API key mới.
