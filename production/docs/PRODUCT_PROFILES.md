# Ảnh sản phẩm và loại hàng

Mở **Thiết lập sản phẩm** trong menu bên trái. Danh sách lấy mã đã lưu trong danh mục; mỗi mã có một ảnh chung, một loại hàng mặc định và **ảnh riêng cho từng màu**. Một ảnh màu dùng chung cho các size của đúng mã–màu đó. Có tìm mã/tên/màu không dấu, lọc In/Trơn/chưa chọn loại, mã thiếu ảnh chung và màu thiếu ảnh riêng.

1. Bấm **Thiết lập** tại mã cần sửa, chọn ảnh JPEG/PNG/WebP.
2. Chọn loại mặc định **In** hoặc **Trơn**; có thể để Chưa thiết lập nếu chưa xác định.
3. Bấm **Lưu thiết lập sản phẩm**. Gỡ ảnh chỉ có hiệu lực sau khi lưu; đóng cửa sổ không ghi thay đổi. Ảnh gốc tối đa20MB, trình duyệt tối ưu cạnh dài tối đa1.600px thành JPEG tối đa2MB (nền trắng cho ảnh trong suốt); backend giới hạn/kiểm tra định dạng riêng.

Để thiết lập ảnh màu, mở **Ảnh theo màu** bên dưới mã → tìm đúng màu → **Ảnh màu** → tải ảnh → **Lưu ảnh màu**. Ví dụ MIU15 / Đen và MIU15 / Xám tiêu đậm có hai ảnh độc lập. Gỡ ảnh riêng của một màu không gỡ ảnh chung hoặc ảnh của màu khác. Màu lấy từ SKU đã lưu; thêm màu mới trong Dự kiến sản xuất hoặc lưu lệnh mới trước khi thiết lập ảnh. Màu đã có ảnh vẫn được giữ để quản lý nếu SKU cuối cùng của màu bị xóa.

Administrator và Production Planner được cập nhật; các vai trò khác chỉ đọc. Backend kiểm tra đăng nhập, quyền, Origin/CSRF và phiên bản thiết lập để không ghi đè thay đổi của người khác. Ảnh chỉ được tải qua API có đăng nhập, không có URL ảnh công khai hoặc dịch vụ AI.

## Khi lập và xem lệnh

- Dự kiến sản xuất: ảnh theo đúng mã–màu và loại mặc định bên cạnh mã; Lên lệnh nhanh mang loại mặc định vào các dòng mới.
- Lập/chỉnh sửa lệnh: bảng có ảnh thu nhỏ và cột **Loại hàng** theo dòng màu. Chọn In/Trơn áp dụng cho các size thuộc dòng đó. Thêm size vào dòng giữ loại hiện có. Nếu một dòng đang có loại khác nhau theo size, hiển thị rõ “Khác nhau theo size”, chỉ đổi khi người dùng chọn lại.
- Bấm ảnh để phóng to; Escape chỉ đóng ảnh, giữ biểu mẫu lệnh và số lượng đang nhập.
- Chi tiết lệnh có ảnh, loại hàng; in/PDF hiển thị ảnh hiện tại. CSV/Excel có thêm cột Loại hàng. Không nhúng ảnh nhị phân vào CSV/XLSX.

Ảnh được chọn bằng mã và toàn bộ tên màu, giữ phân biệt dấu tiếng Việt và phối màu; không dùng ảnh của màu gần giống hoặc của mã khác. Ưu tiên ảnh riêng của màu. Màu chưa có ảnh riêng dùng ảnh chung, có nhãn **Ảnh chung**; nếu cả hai chưa có thì hiện Chưa có ảnh. Tìm theo tên màu trong trang thiết lập sẽ mở nhóm màu tương ứng. Ảnh hiển thị hiện hành, không tạo snapshot ảnh bất biến cho từng lệnh.

Loại được lưu trên từng dòng lệnh. Thay loại mặc định trong Thiết lập sản phẩm không tự đổi lệnh đã lưu; chỉnh loại trong lệnh cần lý do và có revision/audit như chỉnh lệnh hiện hành. Lệnh cũ chưa có loại giữ **Chưa chọn**, không đoán từ tên màu hay tự backfill. Client cũ không gửi loại vẫn giữ loại cũ khi chỉnh sửa. Thay ảnh chỉ cập nhật ảnh nhận diện dùng chung; ảnh trong màn hình/in lệnh cũ là ảnh hiện tại, không phải bản snapshot ảnh tại ngày lập lệnh.

## Lưu trữ và triển khai

Migration012 thêm `product_profiles` theo product ID và `production_order_items.goods_type` nullable; migration013 bổ sung `product_color_profiles` theo product ID + color key. Không sửa quantities, biên nhận, tồn kho hoặc công thức gối. Ảnh lưu PostgreSQL cùng backup database, không dùng filesystem tạm trên Railway; mỗi mã giữ một ảnh chung và mỗi màu giữ một ảnh riêng hiện hành. Dashboard chỉ trả URL/metadata ảnh, không đưa base64 vào payload SKU. Ảnh chung cũ được giữ nguyên; không tự nhân bản ảnh đó thành ảnh riêng của các màu. Khóa phiên bản ảnh màu độc lập với thiết lập chung và các màu khác; audit chỉ lưu metadata/hash.

Startup/pre-deploy tự chạy migration theo cấu hình hiện có. Chỉ mã đã lưu mới có thể thiết lập ảnh; mã mới đang gõ trong lệnh sẽ xuất hiện ở danh sách thiết lập sau khi lưu lệnh thành công. Không cần biến môi trường/API key mới.
