# Nhập V9, tồn kho và dữ liệu bán hàng

## JSON V9

Trong V9, dùng “Tải bản sao lưu JSON”. HTML người dùng cung cấp là đặc tả và báo cáo lịch sử nhúng, không phải bản sao lưu localStorage của từng máy. Đừng đổi đuôi HTML thành JSON.

Administrator mở Cấu hình & dữ liệu → Nhập dữ liệu V9, chọn file JSON ≤10 MB. Schema gốc và cấu trúc `rows/orders/history/deletedHistory/config/meta/sales` được mô tả trong `../../docs/V9_SOURCE_INVENTORY.md`. Xem số SKU, lệnh, lệnh đã xóa, dòng nháp; lỗi trùng SKU/mã lệnh, số đã nhận lệch biên nhận, thời gian hoặc policy không hợp lệ sẽ khóa xác nhận. Nếu có config, giao diện so sánh policy hiện tại và policy sẽ áp dụng; không chạy migration v7/v8 tự đổi targetDays=10 thành 5.

Khi xác nhận, toàn bộ thao tác trong một transaction: tạo SKU, lệnh lịch sử, nhập từng biên nhận, khôi phục trạng thái hủy/xóa, lưu nguyên nguồn và nhật ký V9. Bản nháp có số lượng >0 được tạo thành lệnh theo metadata V9, không tự đổi Nháp thành Đã gửi xưởng. Dòng qty=0 giữ trong source để đối soát. Nguồn có tên người cũ được hiển thị dưới nhãn chưa xác thực Lark; người nhập được ghi riêng. Không sửa nội dung biên nhận cũ để khớp số tổng.

Importer không merge đè SKU đã tồn tại. Nếu có trùng, cần đối soát và chọn bộ dữ liệu sạch trước khi nhập, không xóa dữ liệu vận hành để né lỗi. `customCatalog` của V9 ở khóa localStorage riêng và không có trong backup chính; importer không tự bịa màu bị thiếu. Bản sales trong backup được giữ trong nguồn lịch sử, không thay báo cáo hiện tại. Metadata xóa/thời gian chỉnh sửa cũ được bảo toàn trong nguồn V9; sự kiện nhập/xóa/nhận được ghi với thời điểm và actor import trong hệ thống mới.

## Kế hoạch và tồn CSV/XLSX

Xuất file từ Dự kiến sản xuất để lấy tên cột. Nhập CSV/XLSX dùng:

```text
ma_sp,mau,size,ban_ngay_1,ban_ngay_2,ton_hien_tai,hang_dang_ve,trang_thai_san_pham,ngay_bat_thuong,tb_chuan_thu_cong,sl_test
```

Một dòng là một mã–màu–size. Tồn trống nghĩa là CHƯA NHẬP TỒN, khác số 0. Trạng thái là Mở bán/Tăng trưởng/Giảm sút/Xả kho; size S/M/L/XL. Nhập có preview và chống trùng; không ghi đè số hiện có. Với SKU hiện hữu, sửa trực tiếp bảng hoặc form sửa. Hàng đang về nhập tay không tự cộng thêm nợ xưởng từ lịch sử.

## TikTok Shop

Chọn file xuất trực tiếp CSV hoặc XLSX, sheet đầu tiên. Cần Order ID, Order Status, Quantity, Created Time, Variation và Product Name hoặc Seller SKU; cột hoàn trả là `Sku Quantity of return`, `Cancelation/Return Type`. Kê khai kỳ báo cáo và thời điểm xuất theo Việt Nam, không dùng thời điểm đơn mới nhất thay thời điểm xuất.

Xem trước thể hiện: sản phẩm lẻ hợp lệ, lượt combo, bị loại, chưa rõ SKU; tối đa 100 dòng mẫu. Combo là lượt mua combo chưa phân bổ, không nhân 2/3 về một SKU. Dòng thiếu mã/màu/size giữ ở đối soát. Dòng có size đã ngừng được đưa vào nhóm loại trừ; giữ ánh xạ màu MIU66/MIU01/MIU37 theo V9. Mọi trường số lượng phải là số nguyên không âm.

Hai lựa chọn ghi:

- **Thay thế kỳ:** vô hiệu hóa dòng active trong kỳ đã chọn, giữ dữ liệu nguồn cũ và số liệu ngoài kỳ; nhập file mới thay thế. Không cộng chồng.
- **Bổ sung:** cần khóa Order ID + Order Line ID hoặc SKU ID ổn định. Dòng trùng cùng nội dung bỏ qua; cùng khóa đổi số lượng/trạng thái bị chặn để yêu cầu thay thế/đối soát. Nếu thiếu khóa, không cho bổ sung vì mã đơn đơn lẻ không định danh dòng hàng.

Không tự kết nối TikTok API. Regex loại hủy/unpaid/return/refund giữ như V9; kiểm tra danh sách bị loại, nhất là chuỗi trạng thái chưa có trong dữ liệu gốc. Không suy đoán trạng thái mới. TB 2/7 chia cố định theo V9, loại ngày xuất chưa trọn vẹn và cảnh báo khi cần kiểm tra coverage. Bộ lọc kỳ xem không thay cửa sổ tốc độ chuẩn như hành vi V9.

“Chuyển tất cả sang dự báo” cập nhật doanh số của toàn báo cáo hiện tại, giữ tồn, inbound, vòng đời và test của SKU đã có. SKU mới chưa có tồn bị khóa tự gối khi Tăng trưởng. Tín hiệu doanh số không tự đổi vòng đời. Kiểm tra lại tồn và nguồn hàng đang về trước khi chọn SKU đưa vào lệnh.

## Giới hạn và bảo toàn dữ liệu

Tối đa 10 MB và 100.000 dòng mỗi file bán; chia kỳ nếu lớn hơn. Backend không gửi file tới dịch vụ phân tích bên ngoài. Không lưu địa chỉ/số điện thoại khách trong DailySales; giữ khóa dòng bằng hash cùng dữ liệu sản lượng đã chuẩn hóa. Nguồn backup V9 giữ nguyên để đối soát nên cần quản lý quyền truy cập và thời hạn lưu theo quy định công ty. Không nhập dữ liệu thật vào môi trường DEV khi chưa được phép.
