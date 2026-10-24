# Nhập đơn hàng và báo cáo theo mã → màu × size

## Nhập file

Dùng quyền Administrator hoặc Production Planner, mở **Phân tích bán hàng → Nhập đơn hàng Excel / CSV**.

1. Chọn file xuất đơn hàng theo SKU của TikTok Shop, tối đa 10 MB / 100.000 dòng.
2. Ứng dụng nhận diện worksheet, số dòng và khoảng ngày từ `Created Time`. Không dùng ngày hôm nay làm kỳ mặc định của file lịch sử.
3. Nếu tên file có dạng `…YYYY-MM-DD-HH_mm.xlsx`, thời điểm xuất được nhận diện theo giờ Việt Nam. **Kiểm tra lại thời điểm này**, nhất là file được đổi tên. Nếu không nhận diện được, phải nhập đúng thời điểm xuất để tránh tính ngày chưa trọn vào tốc độ bán.
4. Chọn **Thay thế kỳ** hoặc **Nhập bổ sung**. Bổ sung cần `Order Line ID` hoặc `SKU ID` cùng `Order ID` làm khóa chống trùng; file thiếu khóa vẫn có thể dùng thay thế kỳ.
5. Bấm **Phân tích và xem trước**. Có tổng sản phẩm lẻ, combo, số bị loại; mở phần **Xem tổng hợp … mã theo màu × size** để xem toàn bộ số lượng theo SKU trước khi ghi. Bảng dòng gốc chỉ hiển thị 100 dòng đầu.
6. Kiểm tra rồi bấm **Xác nhận ghi báo cáo**. Xem trước/nhận diện không thay đổi báo cáo hiện tại. Chỉ xác nhận mới ghi dữ liệu tập trung và nhật ký người nhập.

Nếu chọn một khoảng ngày con, chỉ các dòng trong khoảng được nhập; số dòng ngoài khoảng được cảnh báo rõ. Khi thay thế, dữ liệu đã lưu ngoài khoảng vẫn được giữ.

Các cột cơ bản: `Order ID`, `Order Status`, `Quantity`, `Created Time`. Nên có `Product Name`/`Seller SKU`, `Variation`, `SKU ID` hoặc `Order Line ID`, `Sku Quantity of return`, `Cancelation/Return Type`. Thiếu định danh màu/size đưa vào đối soát thay vì tự gán SKU. Cột liên hệ/người mua không được đưa vào bảng dữ liệu bán hàng của ứng dụng.

## Đọc báo cáo

- **Theo mã · màu · size**: mặc định. Mỗi khối là một mã, có tổng bán, tỷ trọng và tín hiệu bán. Mở khối để xem mỗi hàng là một màu, các cột **S | M | L | XL**, tổng màu và tỷ trọng trong mã. Có tổng theo size/toàn mã. Ô có lượng bán cao đậm màu hơn; ô không bán hiển thị “—”. Mã và màu bán nhiều được xếp trước; có mở tất cả, thu gọn và xem thêm mã.
- **Biểu đồ**: top mã bằng thanh ngang và xu hướng sản lượng theo ngày. Bấm mã trong biểu đồ để lọc về ma trận mã đó.
- **Chi tiết & dự báo**: bấm số lượng trong ma trận để mở đúng SKU, hoặc mở tab này để sửa tồn, đang về, vòng đời/test và xem công thức. Có chuyển riêng SKU, chuyển cả mã hoặc nhóm đang lọc sang dự báo.
- **Combo & loại trừ**: chọn riêng combo, chưa rõ SKU hoặc đơn hủy/hoàn/chưa thanh toán. Không cộng các nhóm này vào số sản phẩm lẻ hoặc ma trận. Bộ lọc mã có cả mã chỉ xuất hiện trong đối soát.

Tìm kiếm/lọc theo mã, màu/size và kỳ. CSV/Excel xuất theo tab hiện tại và bộ lọc: ma trận giữ các cột size/tổng màu; chi tiết có tốc độ và công thức; đối soát chỉ xuất nhóm đang chọn. Bản ma trận có hàng **TỔNG MÃ** để đối chiếu; khi tự tổng hợp lại file cần tránh cộng cả hàng màu và hàng tổng hai lần.

Trên điện thoại, cuộn ngang bảng để xem đủ size và tổng; điều hướng thu gọn, các chức năng vẫn dùng chung dữ liệu.

## Giữ nguyên nghiệp vụ V9

Đếm sản phẩm, không đếm số đơn. Combo chưa tách màu/size được đếm theo lượt combo và giữ ở đối soát. Quy tắc loại hủy/hoàn và trừ số hoàn vẫn theo V9. TB 2/7 ngày dùng cửa sổ ngày đầy đủ gần nhất, chia cố định 2/7; bộ lọc kỳ chỉ thay sản lượng kỳ xem. Ngày xuất chưa trọn không tính vào tốc độ chuẩn. Tín hiệu bán không tự chuyển vòng đời sang Tăng trưởng.

Chuyển số bán giữ tồn, đang về, vòng đời và SL test; không tự tạo lệnh hoặc tăng tồn. Dữ liệu nhúng/mẫu V9 không tự nạp thành báo cáo vận hành. Chính sách 5 ngày và các ràng buộc lệnh/biên nhận giữ nguyên.

## Sửa tương thích Excel

File mẫu có cấu trúc worksheet chia một dòng logic thành nhiều phần `<row r="N">`, mỗi phần chứa một ô. Bộ đọc Excel trước đây ghi đè phần trước của cùng số dòng, nên chỉ còn cột cuối và báo không có dữ liệu.

`server/xlsx-reader.ts` đọc XML bằng SAX và ghép theo tọa độ ô (ví dụ A1, B1), nhận diện worksheet/header, shared strings/rich text và ngày Excel. Hai giá trị khác nhau cho cùng ô bị chặn, không âm thầm ghi đè. ZIP/XML hỏng hoặc DTD bị từ chối; có giới hạn file, số dòng, cột và độ dài ô. Dùng JSZip/Saxes đã pin và có trong lockfile; không thực thi macro/formula hoặc gọi dịch vụ chuyển đổi ngoài.

Nhận diện file là endpoint chỉ đọc, có quyền và CSRF. Xác nhận import vẫn trong transaction/advisory lock; ghi theo lô 500 dòng, giữ chống trùng, phát lại và rollback. Ngày bán được lấy dạng ngày lịch từ PostgreSQL, không lệch do múi giờ máy chủ.

## Kiểm tra cục bộ không ghi dữ liệu

```bash
# Trong production; chỉ phân tích trên máy đang chạy, không kết nối/ghi database.
npm run sales:check -- '/duong-dan/bao-cao.xlsx'
```

Lệnh chỉ in metadata và số tổng hợp, không in mã đơn, người mua hoặc thông tin liên hệ. File thật gửi kèm đã được kiểm tra bằng cách này; không đưa file thật/dữ liệu đơn hàng vào Git, fixtures hoặc database kiểm thử. Các bài import/confirm dùng fixture tổng hợp mô phỏng cấu trúc XML của file mẫu.

Xem [TESTING.md](TESTING.md) để chạy bộ test và smoke trình duyệt. Không cần migration mới hoặc thay cấu hình Lark để dùng bản này. Cần chờ Railway triển khai commit mới rồi tải lại trang trước khi nhập lại file.
