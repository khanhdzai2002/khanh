# Ảnh sản phẩm và loại hàng

Mở **Thiết lập sản phẩm** trong menu bên trái. Danh sách lấy mã đã lưu trong danh mục; mỗi mã có một ảnh chung, một loại hàng mặc định và **ảnh riêng cho từng màu**. Một ảnh màu dùng chung cho các size của đúng mã–màu đó. Có tìm mã/tên/màu không dấu, lọc In/Trơn/chưa chọn loại, mã thiếu ảnh chung và màu thiếu ảnh riêng.

## Thêm sản phẩm, màu và SKU ngay tại đây

- **Thêm sản phẩm** ở đầu trang: nhập mã mới, tên (tùy chọn), loại In/Trơn (tùy chọn), các màu mỗi màu một dòng và chọn S/M/L/XL. Lưu tạo mã và các SKU con màu × size cùng một transaction. Mã đã có bị chặn để tránh ghi đè; dùng Thêm SKU con trên mã đó.
- **Thêm SKU con** trên từng thẻ mã: thêm màu mới, hoặc nhập màu đã có để bổ sung size thiếu. Cửa sổ hiển thị trước số SKU sẽ tạo và số đã có được giữ nguyên.
- **Thêm size** ở từng màu: tự chọn các size đang thiếu, giữ đúng mã/màu. Đủ cả S/M/L/XL thì nút không cần thao tác nữa.
- Các size đã có hiển thị thành nhãn con dưới màu. Sau lưu, bộ lọc chuyển về mã vừa thêm và nhóm màu/SKU tự mở để kiểm tra; ảnh chung/ảnh màu tiếp tục thiết lập bằng các nút hiện có.

SKU cũ **không được cập nhật/reset** khi bổ sung: giữ ID, version, tên, tồn, bán, lifecycle, ảnh và mọi chứng từ tham chiếu. SKU mới mặc định Mở bán, tồn null (chưa nhập), inbound/số bán/test0 theo quy tắc SKU hiện hành. Một mã–màu–size đã có được bỏ qua và báo số giữ nguyên. Màu/size trùng trong lựa chọn được loại trùng; tên màu vẫn phân biệt dấu tiếng Việt. Thao tác tạo/append có quyền plan, CSRF, khóa giao dịch, unique constraint và audit. Không cần migration mới hay API key. Sửa loại/tên/ảnh cũ không nằm trong thao tác thêm SKU.

## Thiết lập ảnh và loại hàng

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
