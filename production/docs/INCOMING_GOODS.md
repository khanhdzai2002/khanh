# Nhập liệu hàng về

Mục mới dành cho **Administrator / Warehouse Operator**. Đăng nhập bằng Lark; không tự nâng quyền Planner/Viewer. Dữ liệu tập trung tại PostgreSQL, không dùng localStorage.

## Sử dụng

1. Mở **Nhập liệu hàng về**, chọn tối đa 4 ảnh JPEG/PNG/WebP, tổng 8 MB → **Tạo phiếu từ ảnh**. Có thể tạo phiếu **Nhập bảng thủ công** không cần dịch vụ AI.
2. Ảnh được lưu trong database dưới dạng bytea, có SHA-256. Tạo/lưu ảnh chưa gửi ra ngoài và chưa ghi nhận hàng. Có nút xoay ảnh và mở ảnh gốc.
3. Nếu đã cấu hình OCR, đánh dấu đồng ý gửi những ảnh này đến OpenAI rồi bấm **Đọc ảnh & tạo bảng**. Có phí API riêng. Không tự gửi dữ liệu Lark, danh mục, lệnh hoặc ảnh khác đến nhà cung cấp. Không có lời bảo đảm độ chính xác chữ viết tay; người nhận phải so sánh ảnh với kết quả.
4. Kiểm tra mã, màu, bao, ngày và S/M/L/XL. Mỗi hàng màu được tách thành bốn dòng size để phân bổ vào lệnh. Ô trống/khó đọc là **null**, không tự coi là 0. Chỉ điền 0 sau khi kiểm tra; có nút điền 0 các ô trống với xác nhận riêng.
5. Chọn màu danh mục theo mã và size; nút **Gợi ý ánh xạ lại** chạy quy tắc. Khớp chính xác trước, sau đó quy ước đã lưu và gợi ý từ khóa duy nhất theo mã. Ví dụ MIU37 + Cam chỉ tự gợi ý Cam cháy (phối đen) khi đây là màu phù hợp duy nhất; có hai màu Cam thì phải chọn. Trắng đỏ có thể khớp Trắng (Phối đỏ). Gợi ý từ khóa phải khớp màu chính ở đầu tên; không lấy Đen để tự chọn Cam cháy (phối đen). Không tự tạo SKU/màu và không chuyển XS thành S hoặc XXL thành XL.
6. Nếu chỉ có một lệnh phù hợp còn chờ cho SKU, gợi ý lệnh đó; nhiều lệnh thì phải chọn. Lệnh đã đủ vẫn chọn được để nhận giao dư. Lệnh hủy/xóa không được chọn. Xưởng/ngày/lệnh hiển thị để kiểm tra. **Tách dòng** tạo dòng cùng SKU với số nhận 0; giảm dòng gốc và chia số lượng sang lệnh khác, tránh nhân đôi. Tổng hiện tại và tổng OCR ban đầu hiển thị để đối soát.
7. **Ghi nhớ theo mã** chỉ lưu khi xác nhận biên nhận thành công. Quy ước mã–cách viết màu chỉ áp dụng cho mã đó; không tự ghi đè quy ước cũ nếu khác. Nếu cần nhập ngoại lệ, bỏ Ghi nhớ để không đổi quy ước chung.
8. **Lưu nháp** trước khi rời trang. Có thể mở lại 100 phiếu gần nhất của mình; mỗi phiếu có version để phát hiện hai người sửa. **Xem lệnh** tự lưu bảng hợp lệ trước khi chuyển trang. Nhấn tải lại dữ liệu ở đầu app rồi mở lại phiếu nếu lệnh vừa được người khác cập nhật.
9. Đánh dấu đã kiểm tra rồi **Xác nhận ghi nhận hàng**. Mọi số lượng phải rõ, dòng có hàng phải khớp đúng mã–size và SKU của lệnh. Số bao không tính là sản lượng. Các dòng trùng SKU trong cùng lệnh được gộp thành một dòng biên nhận; nhiều lệnh tạo nhiều biên nhận trong cùng transaction.
10. Xác nhận thành công khóa phiếu; có nút mở lệnh tương ứng. Lịch sử giao nhận của lệnh có đường dẫn mở ảnh kiểm kho gốc. Không sửa biên nhận cũ, không tự cộng tồn kho và không thay số đặt gốc. Cho nhận vượt số đặt/tiến độ trên 100% theo chính sách hiện hành.

## Cấu hình Railway

Service **khanh → Variables → New Variable**:

```dotenv
INCOMING_OCR_API_KEY=
INCOMING_OCR_MODEL=gpt-4.1-mini
```

`INCOMING_OCR_API_KEY` là API key của dự án OpenAI có hạn mức sử dụng; **không phải** Lark App Secret và **không phải** tài khoản/gói ChatGPT. Điền giá trị thật trực tiếp vào Railway, không gửi trong chat hoặc commit. Model tùy chọn; phải hỗ trợ hình ảnh, JSON mode và Chat Completions. Deploy lại sau khi lưu. Backend gọi cố định `https://api.openai.com/v1/chat/completions`, timeout 60 giây, không tự retry gửi ảnh; khi thất bại vẫn giữ ảnh/nháp.

Nếu chưa muốn dùng nhà cung cấp ngoài, để trống khóa: tạo phiếu/ảnh, nhập tay, ánh xạ và ghi nhận vẫn hoạt động; nút đọc ảnh bị khóa và có hướng dẫn. Chỉ ảnh trong phiếu đã chọn được gửi khi người dùng đồng ý và chủ động bấm đọc. Cần thống nhất việc dùng nhà cung cấp trước khi đưa chứng từ công ty vào chức năng này.

Hợp đồng request đã đối chiếu với mã nguồn SDK chính thức: https://github.com/openai/openai-node/blob/master/src/resources/chat/completions/completions.ts (image_url, response_format json_object, max_completion_tokens). Chưa kiểm tra bằng key thật hoặc đo độ chính xác trên phiếu thật; tests mô phỏng provider và kiểm tra backend/API/giao diện thật.

## Lưu trữ và tính toàn vẹn

Migration **009** thêm `incoming_goods_drafts`, `incoming_goods_images`, `incoming_color_aliases`. Không đổi lệnh/biên nhận cũ. Ảnh và bản nháp được lưu PostgreSQL trên Railway, bao gồm trong backup database. Ảnh giới hạn theo phiếu; cần theo dõi dung lượng database khi dùng lâu dài. Chưa có OCR tự host, xử lý PDF/HEIC, tự crop, tự xóa ảnh theo lịch hoặc tìm trùng bằng nội dung hình ảnh.

Chống trùng dựa trên bytes SHA-256 của ảnh: một ảnh đã xác nhận không được xác nhận ở phiếu khác hoặc tải lại làm phiếu mới. Hai lần chụp khác nhau cùng phiếu có thể có hash khác, vẫn cần nhân viên đối soát. Phiếu thủ công không có ảnh cần tự kiểm tra số chứng từ. Retry cùng nội dung/cùng phiếu trả lại kết quả cũ; nội dung khác sau khi đã xác nhận trả 409. Khóa version từng lệnh, khóa ảnh và transaction đảm bảo không ghi một phần khi xung đột. API kiểm tra quyền, CSRF/Origin, chủ phiếu; ảnh đính kèm lệnh chỉ đọc được khi đăng nhập có quyền xem lệnh. Các ảnh/nháp chưa xác nhận chỉ chủ phiếu hoặc Administrator truy cập bằng ID.
