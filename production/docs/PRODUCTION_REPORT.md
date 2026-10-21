# Báo cáo tỷ trọng sản phẩm gối

Mở **Gối lệnh sản xuất → Báo cáo tỷ trọng sản phẩm**. Chức năng chỉ đọc, không thay đổi lệnh, hàng giao nhận, tồn kho hoặc công thức V9. Mọi vai trò được xem lệnh hiện có đều xem/xuất báo cáo được; không cấp thêm quyền ghi.

## Các phần trong báo cáo

- KPI theo đúng bộ lọc: số mã, số lệnh duy nhất, tổng đã đặt/đã nhận/còn chờ, số lệnh quá hạn.
- Biểu đồ thanh top10 mã theo số còn chờ hoặc số đã đặt. Bấm mã để lọc. Tỷ trọng tính trên tất cả mã phù hợp bộ lọc, không chỉ top10.
- Thẻ từng mã: sản lượng, tỷ trọng, số lệnh/xưởng/màu, tiến độ nhận và cảnh báo quá hạn. Mở thẻ để xem ma trận màu × XS/S/M/L/XL/2XL.
- Bảng lệnh của mỗi mã: mã lệnh có thể bấm mở chi tiết/giao nhận, xưởng, hẹn giao, đã đặt/nhận/còn chờ, tỷ trọng mã trong lệnh, tình trạng quá hạn.
- Chọn một lệnh cụ thể để xem cơ cấu sản phẩm của lệnh đó, hoặc tổng hợp nhiều lệnh.
- Xuất CSV/Excel đúng bộ lọc, dữ liệu từng dòng mã–màu–size–lệnh. Không có dòng tổng trộn vào chi tiết để tránh cộng trùng.

## Bộ lọc và mẫu số

Lọc ngày lập lệnh (ngày Việt Nam UTC+7, không phải ngày giao nhận), lệnh, xưởng, mã, phạm vi và cơ sở tỷ trọng. Khoảng ngày bao gồm cả ngày đầu/ngày cuối; bỏ trống là không giới hạn. Ngày đảo ngược bị chặn ở giao diện và backend.

Mặc định **Đang gối — các mã còn chờ trong lệnh**, lấy lệnh đã gửi xưởng/đã xác nhận/đang sản xuất. Nháp và tạm dừng chỉ tính khi chủ động bật. Lệnh xóa mềm hoặc hủy phần còn lại luôn bị loại trong báo cáo này, kể cả khi có lịch sử nhận hàng; báo cáo không thay thế màn hình lịch sử/xóa/hủy.

Ở phạm vi Đang gối, chỉ giữ mã có phần còn chờ trong từng lệnh; vẫn giữ các size đã giao đủ của cùng mã đó trong lệnh để tính đúng tổng đặt, nhận, tiến độ và tỷ trọng mã. Các mã đã giao đủ ở lệnh khác không cộng vào phạm vi này. Đổi sang **Toàn bộ** để tính cả mã đã giao đủ trong các lệnh phù hợp.

**Tỷ trọng trong báo cáo** = số của mã / tổng số của tất cả mã trong bộ lọc ×100. Có hai cơ sở: số còn chờ (mặc định) và số đã đặt. Không dùng số lệnh, số SKU hoặc doanh thu làm tỷ trọng. Khi chỉ lọc một mã có số lượng thì tỷ trọng báo cáo của mã là100%.

**Tỷ trọng mã trong lệnh** = tổng đã đặt của mã trong lệnh / tổng đã đặt của toàn bộ lệnh ×100. Mẫu số vẫn là toàn lệnh ngay cả khi bộ lọc chỉ xem một mã. Ví dụ lệnh có A100/B300: A25%, B75%; lọc riêng A thì tỷ trọng A trong báo cáo100% nhưng trong lệnh vẫn25%.

Ma trận màu–size dùng đúng cơ sở tỷ trọng đang chọn. Tiến độ = đã nhận/đã đặt; quá hạn khi hẹn giao trước ngày hiện tại ở Việt Nam và mã còn chờ. Không có ngày hẹn thì không tự coi là quá hạn. Phạm vi Toàn bộ, cơ sở còn chờ có thể cho tỷ trọng0% nếu toàn bộ đã giao; hãy chọn Đã đặt để xem cơ cấu lịch sử.

## Xuất và độ mới dữ liệu

Mỗi dòng xuất là một SKU trong một lệnh. Cộng các cột Đã đặt/Đã nhận/Còn chờ để đối soát. Các cột tỷ trọng là giá trị của mã/lệnh hoặc mã/báo cáo được nhắc lại trên dòng chi tiết; **không cộng các cột phần trăm**. Không cộng tỷ trọng mã giữa các lệnh khác nhau.

Giao diện dùng snapshot đã tải trong ứng dụng và cập nhật sau thao tác/nhấn Tải lại. Xuất đọc PostgreSQL trong transaction REPEATABLE READ để các lệnh, dòng và biên nhận cùng một snapshot. Nếu người khác vừa cập nhật, file xuất có thể mới hơn màn hình; tải lại để đối soát.

Không cần migrations, biến môi trường hoặc quyền Lark mới. Kết quả được kiểm tra bằng dữ liệu tổng hợp trên database `_test`; chưa xác minh triển khai Railway hoặc dữ liệu sản xuất thật. Không tự tạo dữ liệu mẫu trên hệ thống thật.

## Kiểm thử

170 tests /13file đạt, gồm11tests mới về tỷ trọng số lượng, nhiều lệnh, 2cơ sở, lọc trạng thái, giữ size đã nhận của mã còn chờ, ngày Việt Nam, quá hạn, bảo toàn tổng, ngày sai, mẫu số trong lệnh và xuất CSV/Excel có xác thực/Viewer. Chromium desktop1440 vàmobile390px kiểm tra mở báo cáo/màu-size/lệnh, lọc mã/xưởng/lệnh, đổi cơ sở, xuất CSV theo bộ lọc, khoảng ngày sai, bật nháp và không lỗi JavaScript hoặc tràn trang.
