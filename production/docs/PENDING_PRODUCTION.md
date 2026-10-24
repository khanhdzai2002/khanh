# Danh sách chờ theo mã–màu–size và biểu đồ tròn

Mở **Gối lệnh sản xuất → Danh sách lệnh**, cuộn xuống **Chờ sản xuất theo mã · màu · size** ngay dưới bảng lệnh. Đây là phần xem nhanh riêng; tab Báo cáo tỷ trọng sản phẩm trước đó vẫn giữ nguyên.

## Tra cứu

- Tìm không dấu và không phân biệt hoa/thường: ví dụ `miu66 xam tieu` hoặc `tieu miu66 xam`. Các từ tìm trong mã, màu, size, mã lệnh và xưởng, không bắt buộc cùng thứ tự.
- Chọn mã, màu, size, xưởng, trạng thái nội bộ, ngày lập lệnh từ/đến (ngày Việt Nam). Đổi mã sẽ bỏ lựa chọn màu cũ để tránh bộ lọc màu không còn phù hợp.
- Bộ lọc này độc lập với bộ lọc danh sách lệnh phía trên và bộ lọc tab báo cáo. Biểu đồ, bảng và file xuất bên dưới dùng chung bộ lọc của phần xem nhanh.
- Mặc định không tính Nháp/Tạm dừng. Có ô bật riêng nếu cần; chọn trạng thái Nháp/Tạm dừng mà chưa bật tính tương ứng sẽ không có kết quả. Lệnh xóa mềm hoặc hủy phần còn lại luôn bị loại.

## Cách tính

Mỗi dòng là một mã + màu, các cột XS/S/M/L/XL/2XL là **tổng đã đặt trừ tổng đã nhận** của đúng SKU trong các lệnh hợp lệ. Chỉ lấy dòng còn chờ >0; size đã nhận đủ hiển thị0 khi nhóm vẫn còn các size khác. Không cộng lại số đã nhận hoặc cộng thêm tồn/hàng đang về nhập tay.

Nhãn “chờ sản xuất” ở đây là **số xưởng còn chưa giao/ứng dụng chưa ghi nhận**, bao gồm cả đang sản xuất. Không giả định tất cả số này đều chưa bắt đầu sản xuất. Không sửa trạng thái lệnh, dự báo, tồn hoặc biên nhận khi xem báo cáo.

Ví dụ kiểm thử tổng hợp: MIU66/Xám tiêu, S đặt100/nhận30 ở lệnh1, S đặt20/nhận5 ở lệnh2 → S85; M đặt80/nhận20 → M60; L đặt50/nhận10 → L40. Tổng nhóm185. Đây chỉ là ví dụ kiểm thử, không phải tồn/lệnh thật của công ty.

Số lệnh từng dòng là lệnh duy nhất của nhóm; tổng chân bảng đếm lệnh duy nhất của toàn bộ bộ lọc, không cộng lặp số lệnh giữa các màu. Hẹn sớm nhất lấy ngày hẹn nhỏ nhất của các nguồn còn chờ có ngày hẹn. Quá hạn khi nguồn có ngày hẹn trước hôm nay theo Việt Nam và còn chờ.

Bấm **Xem lệnh mã/màu** để mở cửa sổ đối soát nguồn: mã lệnh, xưởng, trạng thái nội bộ, số còn chờ mỗi size, tổng và ngày hẹn. Bấm mã lệnh để chuyển sang chi tiết lệnh/giao nhận hiện có; không mở chồng hai cửa sổ.

## Biểu đồ tròn

Dạng donut: giữa là tổng số sản phẩm còn chờ, mỗi phần là một mã. Chú giải ghi mã, số sản phẩm và %. Tỷ trọng = số sản phẩm còn chờ của mã / tổng còn chờ trong bộ lọc ×100, **không phải số lệnh**. Bấm mã ở chú giải để mở chi tiết màu–size ngay bên dưới, không tự thay đổi bộ lọc hoặc tỷ trọng biểu đồ. Muốn lọc riêng, dùng nút Lọc riêng mã trong mục mở rộng.

Có hơn8 mã thì hiển thị8 mã lớn nhất và nhóm Khác. Khác vẫn cộng đủ toàn bộ mã còn lại để tổng số lượng/tỷ trọng không mất dữ liệu. Dùng bộ lọc mã để xem mã nằm trong Khác. Tổng bằng0 không dựng tỷ trọng hoặc số liệu giả.

## Xuất và giới hạn hiển thị

CSV/Excel xuất các nhóm mã–màu theo đúng bộ lọc, đủ6 size, tổng còn chờ, số lệnh, ngày hẹn sớm nhất, cờ quá hạn và danh sách mã lệnh liên quan. Mỗi nhóm chỉ có một dòng; không trộn dòng tổng vào chi tiết. Tải tối đa100 nhóm đầu trên giao diện rồi bấm Xem thêm100; chân bảng và biểu đồ luôn tính trên toàn bộ bộ lọc, file xuất cũng lấy toàn bộ.

Giao diện cập nhật theo dữ liệu ứng dụng tải được sau thao tác hoặc nút Tải lại; không phải luồng dữ liệu trực tiếp từ xưởng. File xuất đọc PostgreSQL trong transaction REPEATABLE READ. Nếu dữ liệu vừa được người khác sửa, tải lại màn hình để đối chiếu với file mới.

Phần này chỉ đọc, theo quyền xem lệnh hiện có (kể cả Viewer); backend vẫn yêu cầu đăng nhập. Không có migration/biến môi trường/quyền Lark mới. Không thay dữ liệu nghiệp vụ hoặc công thức V9.

## Kiểm thử

179tests/14file đạt. 9tests mới kiểm tra cộng nhiều lệnh/size/màu, trừ nhận một phần, search không dấu/thứ tự từ, các bộ lọc và ngày Việt Nam, loại xóa/hủy/đã đủ/nháp/tạm dừng, donut8+Khác bảo toàn tổng/tỷ trọng, nhóm/cột size/CSV cộng khớp tổng, dữ liệu0/ngày sai, số lệnh duy nhất/quá hạn và xuất CSV/Excel có session/Viewer trên PostgreSQL `_test`.

Chromium desktop1440/mobile390px xác minh bảng xuất hiện dưới danh sách lệnh, donut285 từ dữ liệu tổng hợp, truy vấn MIU66/Xám tiêu S85/M60/L40, lệnh nguồn và chi tiết lệnh, CSV đúng bộ lọc, size/xưởng/mã/màu, bấm chú giải, đổi mã bỏ màu cũ, không có kết quả, ngày đảo ngược và bật nháp có chủ ý. Không lỗi JavaScript/tràn trang. Không kiểm thử bằng dữ liệu công ty và chưa xác minh triển khai Railway.


## Mục con ngay dưới mã ở biểu đồ

- Bấm mã (ví dụ MIU37) để mở/thu gọn ngay tại chú giải. Hiện tổng còn chờ, số màu, số lệnh duy nhất và tỷ trọng của mã trong bộ lọc.
- Mặc định mở sẵn tối đa3màu đầu để thấy size ngay. Bấm tên màu để thu gọn/mở; có Mở tất cả màu và Thu gọn màu.
- Mỗi màu có số sản phẩm và % trong mã; mỗi size có số sản phẩm, % trong màu và % trong mã. Các mẫu số đều lấy cùng bộ lọc hiện tại, không lấy số đã đặt hoặc tự cộng dữ liệu ngoài bộ lọc.
- Bấm size có số lượng >0 để xem đúng nguồn lệnh của mã–màu–size đó. Cửa sổ chỉ hiển thị cột size đã chọn, số còn chờ tương ứng, xưởng và hẹn giao; size0khóa nút.
- Bấm Xem các lệnh của màu để xem nguồn theo tất cả size đang phù hợp bộ lọc. Bấm mã lệnh mở chi tiết/giao nhận lệnh hiện có, đóng cửa sổ nguồn trước để không chồng hai cửa sổ.
- Mở mục con không tự lọc mã, giữ nguyên tỷ trọng trong toàn bộ dashboard. Nút Lọc riêng mã là hành động riêng; khi lọc một mã thì tỷ trọng mã trong bộ lọc có thể100%.

191tests/15file đạt. 2tests mới kiểm tra MIU37 tổng3200 từ dữ liệu tổng hợp, màu2000chiếm62,5% mã/50% tổng4000, size400chiếm20% màu/12,5% mã, bảo toàn tổng/phần trăm, lệnh duy nhất và dữ liệu theo bộ lọc/không có mã. Browser xác minh mở mục con không đổi tổng285, màu/size hiện ngay, size0khóa, chọn S chỉ có lệnh S70/S15 và mở lệnh thật trong `_test`, lọc riêng mã, desktop/mobile. Không thay dữ liệu công ty.
