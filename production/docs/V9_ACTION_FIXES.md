# Rà soát và sửa thao tác V9 — 17/10/2026

Nguồn đối chiếu là HTML V9 744 dòng, SHA-256 `5e468146bd3ed292b7e4494a1276e4572d08161743a5f83f57adb36ce20b3316`. Đã đọc lại các handler lập lệnh, picker mã/màu/size, sửa lịch sử, giao nhận, hủy/xóa/khôi phục và chuyển bán hàng. Xem thêm [bảng chức năng](../../V9_FEATURE_MAP.md) và [danh mục hàm gốc](../../docs/V9_SOURCE_INVENTORY.md).

## Nguyên nhân và bản sửa

| Thao tác | Vấn đề tìm thấy | Hành vi sau sửa |
| --- | --- | --- |
| Lưu lệnh trong ảnh người dùng | Bảng chi tiết rỗng; nút bị disabled mà chưa có thông báo cạnh nút. “Dòng thủ công” vẫn phụ thuộc danh mục đã nhập ở trang khác. | Bảng rỗng có hướng dẫn; bấm lưu sẽ chỉ ra thiếu dòng. Có “Nhập mã / màu mới” ngay tại lệnh, tự mở chế độ này nếu danh mục trống. |
| Thêm mã/màu/nhiều size | SKU chưa tồn tại bị bỏ qua; size thiếu trong ma trận chỉ có dấu gạch. | Nhập nhiều màu, số lượng từng size; thêm size ngay trong ma trận. SKU mới và lệnh lưu trong cùng transaction qua API compose. Thất bại rollback cả danh mục và audit mới. |
| Nhập lại số lượng một dòng | Xóa tạm ô số lượng có thể làm biến mất dòng/nhóm cuối trước khi gõ số thay thế. | Giữ dòng 0 trong bản đang sửa; loại dòng chưa nhận có số 0 khi gửi lưu. Không gửi dòng 0 hoặc lệnh rỗng tới backend. Dòng đã nhận vẫn bị chặn giảm dưới số nhận. |
| Thêm màu vào nhóm có sẵn | Sửa trực tiếp object của state; ưu tiên mới chưa được nâng như picker V9. | Sao chép dòng trước khi cộng số; giữ một dòng mỗi SKU và nâng ưu tiên theo V9. |
| Lỗi lưu trong cửa sổ | Thông báo chủ yếu ở khung trang; dễ bỏ sót trong form dài. Lỗi cũ có thể đi theo cửa sổ mới. | Lỗi backend nằm trong vùng sticky của dialog, giữ dữ liệu đang nhập. Xóa thông báo cũ khi mở dialog mới. |
| Giao nhận | Nút ngoài form nên min/max HTML không tự chặn gửi; lỗi chỉ hiện sau request. | Kiểm tra ngày, số nguyên, số còn chờ trước gửi; lỗi cạnh form. Backend tiếp tục khóa lệnh và kiểm tra giới hạn/idempotency. Không cộng tồn. |
| Hủy/xóa/khôi phục | Dùng `window.prompt` và thiếu bản mô tả tác động ngay tại xác nhận. | Dialog riêng nhập lý do tối thiểu 3 ký tự, hiển thị mã/xưởng và phạm vi thao tác. Có version check và nhật ký; giữ biên nhận. |
| Nhập số trong bảng dự báo | Có thể nhập tồn/test dạng thập phân; ô giữ giá trị thất bại khiến tưởng đã lưu. | Kiểm tra số nguyên cho tồn/đang về/test; giới hạn test 100.000. Thất bại trả ô về số đã lưu và hiện lỗi. Sửa tồn thủ công ghi nguồn và ngày cập nhật. |
| Thêm nhiều SKU | Parse có thể ném lỗi bên ngoài cơ chế bắt lỗi, màu lặp trong input chưa lọc. | Gửi qua cơ chế bắt lỗi chung, lọc màu nhập lặp, kiểm tra backend vẫn bắt buộc. |
| Nhãn trường nhà xưởng/select | Label bọc cả datalist/options khiến tên truy cập bị lẫn nội dung, đặc biệt khi đã có xưởng trong danh sách. | Label liên kết bằng `htmlFor`/ID với đúng input/select/textarea; không chứa nội dung options. |
| Chính sách tồn | Thiếu nút đặt lại mặc định như V9. | “Khôi phục mặc định V9” đưa form về 5/3/0/1, không cộng lead; chỉ ghi sau bấm lưu. |
| Chuyển bán hàng sang dự báo | Nút cũ chuyển tất cả báo cáo dù đang lọc một mã; thiếu chuyển riêng từng SKU. | “Chuyển SKU đang lọc sang dự báo” gửi danh sách định danh cụ thể, có nút chuyển từng dòng; giữ tồn/đang về/vòng đời/test. |
| Sửa từ bảng bán hàng | Thiếu ô tồn, đang về, vòng đời, SL test và chi tiết đề xuất so với V9. | Bổ sung các ô này, kiểm tra quyền/version, hiển thị công thức theo tốc độ 2/7 ngày. Tín hiệu bán vẫn tách khỏi vòng đời. |
| Xuất file | Bộ lọc giao diện chưa đi vào request xuất; CSV combo thiếu chuỗi phân loại. | Xuất lệnh theo tìm kiếm/trạng thái; bán hàng theo mã/kỳ/tìm kiếm/tốc độ. CSV/XLSX bán hàng có TB 2/7 ngày và công thức. CSV combo giữ phân loại để đối soát. |
| In/PDF | Mã lệnh chỉ ở header dialog bị ẩn khi in. | Thêm mã vào nội dung bản in. |
| Lưu thành công nhưng tải lại lỗi | Cơ chế chung trả thất bại sau khi dữ liệu đã ghi, dễ khiến người vận hành bấm lưu lại. | Đóng form sau thao tác đã xác nhận thành công; báo rõ chỉ cần tải lại dữ liệu, không gửi lại thao tác. Chặn thao tác ghi chồng trong cùng giao diện. |

SKU tạo từ lệnh mặc định **Mở bán**, **CHƯA NHẬP TỒN**, không đưa số đặt thành doanh số hoặc tồn kho. Không tạo các mã/dữ liệu nhúng V9 vào vận hành. Không thay công thức, vòng đời, biên nhận hay lịch sử cũ.

## Xác minh

- `npm test`: 119 tests trong 9 file; gồm 400 đầu vào đối chiếu trực tiếp hàm `calc` gốc trong test công thức. Dùng PostgreSQL riêng `_test`.
- Tests bổ sung: tạo lệnh từ danh mục trống; tái sử dụng SKU khác hoa/thường; rollback khi mã trùng; chặn ID nháp giả, dòng trùng và dòng thừa; thêm màu sau nhận; hủy/reopen; cập nhật cùng version; hai người tạo cùng danh mục; chỉ chuyển SKU được chọn; quyền/CSRF trên API compose; xuất theo bộ lọc.
- Browser Chromium: xem [TESTING.md](TESTING.md). Hai script đã lưu trong `tests/browser-workflow.py` và `tests/browser-sales.py` để chạy lại. Các script chỉ dùng bản smoke trên localhost:5175 với `tests/serve-smoke.ts`, không được trỏ tới dữ liệu vận hành.

## Cập nhật Railway

1. Dịch vụ **khanh** lấy nhánh **comsflow-railway**, Root Directory **/production**.
2. Chờ bản deploy chứa commit sửa này báo Active/Success; nếu chưa tự chạy, chọn Deploy Latest Commit trong Deployments.
3. Mở lại https://khanh-production.up.railway.app và Ctrl+F5. Dùng Administrator hoặc Production Planner để lập/sửa lệnh; Warehouse Operator/Administrator để nhận hàng.
4. Tạo lệnh: nhập xưởng → nhập/chọn mã và màu → nhập số theo size → **Thêm các màu đã chọn** → kiểm tra bảng có dòng và tổng → **Lưu lệnh vào lịch sử**.
5. Không đổi các secret/cấu hình Lark đã hoạt động. Đợt sửa này không có migration mới và không cần nhập lại dữ liệu.

Chưa trực tiếp truy cập Railway Console hoặc thao tác trên database vận hành; thành công ở môi trường thử không xác nhận deployment mới đã chạy. Lark Base vẫn chỉ preview đọc, workflow phê duyệt Manager chưa triển khai, không có gửi tin/email xưởng hoặc tự đối soát nhập kho. Đây không phải cam kết mọi file TikTok ngoài mẫu đã thử đều có thể nhập; cần cấu trúc cột được hỗ trợ như tài liệu import.
