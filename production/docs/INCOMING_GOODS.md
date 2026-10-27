# Nhập liệu hàng về — xem ảnh, nhập tay và tự động cộng dồn

Theo yêu cầu mới, bỏ OCR. Ảnh dùng làm chứng từ để nhân viên xem và nhập số lượng vào bảng. Không gọi OpenAI/Gemini, không cần API key. Backend `/read` cũ trả410 để không có client cũ nào tiếp tục gửi ảnh ra ngoài.

## Cách sử dụng

1. Mở **Nhập liệu hàng về** bằng Administrator hoặc Warehouse Operator.
2. Chọn 1–4 ảnh JPEG/PNG/WebP, tổng tối đa8MB, bấm **Tạo phiếu từ ảnh**. Có thể nhập không kèm ảnh. Ảnh được lưu PostgreSQL, có nút xoay, phóng to/thu nhỏ, đổi ảnh và mở cửa sổ riêng. Ẩn ảnh để xem rộng bảng khi cần.
3. Bấm **Thêm bao**, nhập số bao một lần ở dòng tiêu đề. Chọn **Mã trên phiếu**, **Màu trên phiếu** ở dòng thụt vào bên dưới rồi nhập trực tiếp bốn cột **S | M | L | XL**. Mỗi dòng con là một mã–màu, có tổng dòng; mỗi bao có tổng số lượng và số dòng màu. **Thêm mã / màu vào bao** tạo dòng con kế tiếp và tự dùng số bao; **Thêm màu cùng mã** giữ mã sản phẩm, để chọn màu tiếp theo. Có tổng theo size và toàn phiếu ở cuối bảng. Cả S/M/L/XL đều nhập được, kể cả size chưa có trong lệnh hoặc danh mục. Khi không có mã/màu, chọn Nhập mã/màu chưa có trên app để ghi đúng thông tin hàng thực nhận; thao tác này không tự tạo SKU. Ô size trống ở dòng mới tính0; số lượng null từ phiếu cũ vẫn đánh dấu Chưa kiểm tra và cần nhập0 hoặc số thực trước khi xác nhận. Số bao không tính thành sản lượng.
4. Mặc định mỗi dòng màu dùng **Tự động cộng dồn** cho cả bốn size. Nếu biết lệnh, chọn **Chọn lệnh theo từng size**; phần chi tiết mở bên dưới để chọn lệnh riêng cho S/M/L/XL. Nút **Lệnh / giao dư theo size** luôn có thể mở để chọn lệnh nhận phần dư riêng từng size. Cho phép nhận vượt theo quy trình hiện hành.
5. Nếu chưa biết lệnh, chọn **Tự động cộng dồn**, sau đó bấm **Tự động cộng dồn — xem phân bổ**. Nút này chỉ tạo bảng xem trước, không ghi hàng ngay.
6. Xem từng dòng phân bổ: mã lệnh, mã–màu–size, còn thiếu trước, nhận phiếu này, còn thiếu sau và giao dư. Bảng tổng hợp theo mã–màu–size tính cả những lệnh phù hợp chưa cần phân bổ, để biết tổng còn thiếu sau phiếu này. Đánh dấu đã kiểm tra, rồi **Xác nhận ghi nhận hàng** để ghi thật.
7. **Lưu nháp** trước khi rời trang. Mở lại phiếu trong100 phiếu gần nhất; sau lưu hoặc sửa bảng cần tính phân bổ lại. Khi mở lệnh từ phiếu, bảng hợp lệ được lưu nháp trước khi chuyển trang.

## Quy tắc cộng dồn

- Khớp đúng variant cùng mã–màu–size, không bù sang màu/size khác.
- **Ngày giờ lập lệnh cũ trước**; nếu trùng thì theo ngày tạo, mã lệnh rồi ID để kết quả ổn định. Không dựa vào vị trí hiển thị danh sách hoặc chỉ chuỗi mã lệnh.
- Số nhận phân bổ tối đa **max(0, số đặt − đã nhận − số đã phân bổ trong cùng phiếu)** cho từng dòng lệnh. Nhiều bao/dòng cùng SKU dùng chung bộ đếm để không tính trùng.
- Ví dụ MIU37 / Ghi tây (Phối nâu) / M: lệnh23/10 còn150, lệnh24/10 còn200; nhập300 → nhận150 vào lệnh đầu,150 vào lệnh sau; lệnh sau còn50.
- Dòng chọn lệnh thủ công được giữ nguyên và trừ sức chứa trước khi chia các dòng tự động, bất kể thứ tự các dòng trong bảng.
- Không dùng lệnh đã xóa hoặc hủy phần còn lại. Mặc định loại Nháp/Tạm dừng khỏi tự động; chỉ cho tham gia khi nhân viên bật tùy chọn riêng. Nhận thủ công vào một lệnh là lựa chọn chủ động, vẫn giữ quy tắc hiện có.
- Nếu một SKU còn thiếu ở nhiều xưởng mà chưa chọn **Nhà xưởng trả hàng**, dừng phân bổ SKU đó và yêu cầu chọn xưởng. Khi đã chọn xưởng, cả lệnh thủ công và tự động phải đúng xưởng; đổi xưởng sẽ xóa các lựa chọn lệnh cũ để tránh gán nhầm.
- **Không tự gán hàng vượt tổng còn thiếu.** Phần chưa phân bổ hiển thị riêng. Chọn **Lệnh nhận phần dư** cùng SKU, rồi tính lại để ghi nhận giao dư vào lệnh được chọn, hoặc tách dòng nhận thủ công. Lệnh đã đủ có thể được chọn chủ động nhận phần dư. Không tự tạo lệnh hay đổi số đặt gốc.
- Nếu không có lệnh phù hợp, phần đó giữ chưa phân bổ; không tự bỏ hàng. Có thể ghi nhận phần chưa tìm được lệnh theo bước xác nhận riêng bên dưới.

## Tính toàn vẹn

Xem trước được lưu trong `import_previews` với loại `incoming-allocation`, gắn chủ phiếu, phiên bản và nội dung phiếu, hạn15phút. Khi xác nhận, backend khóa các lệnh theo thứ tự cố định, đối chiếu lại toàn bộ lệnh liên quan (kể cả lệnh mới), rồi tính lại từ dữ liệu thật. Nếu có thay đổi về số đã nhận, phiên bản, trạng thái, SKU, xưởng hoặc xuất hiện lệnh liên quan mới: trả409, không ghi một phần; nhân viên tải lại dữ liệu và tính phân bổ lại.

Mỗi lệnh tạo một biên nhận, gộp các dòng cùng SKU trong lệnh. Tất cả biên nhận, lịch sử và trạng thái phiếu được lưu trong cùng transaction. Retry cùng nội dung/cùng phiếu trả kết quả đã lưu, không nhân đôi; dùng lại bảng xem trước của người/phiếu khác hoặc đã hết hạn bị chặn. Quyền, CSRF/Origin, khóa phiên bản và idempotency đều kiểm tra tại backend.

Giữ số đặt gốc, biên nhận cũ bất biến. Không tự cộng tồn kho. Cho nhận vượt số đặt và tiến độ trên100% khi phần dư được chọn lệnh rõ ràng. Sau xác nhận, có liên kết mở từng lệnh và ảnh kiểm kho trong lịch sử giao nhận. Kết quả phân bổ chi tiết được giữ cùng phiếu và audit để đối soát.

## Dữ liệu và triển khai

Nhóm bao/cộng dồn dùng bảng phiếu/ảnh từ migration009 và bảng xem trước hiện có. Hàng chưa đối chiếu và snapshot xưởng dùng migrations010–011; startup tự áp dụng theo cơ chế migration hiện hành. Không sửa dữ liệu sản xuất đang lưu khi deploy. Phiếu cũ, ảnh gốc, kết quả OCR lịch sử, biên nhận và quy ước cũ vẫn giữ trong database để đối soát; giao diện mới không tự học hay dùng AI nữa.

Các biến `INCOMING_OCR_*`, `GEMINI_API_KEY`, `GEMINI_MODEL` trên hosting không còn được module này sử dụng. Có thể gỡ khỏi Variables theo quy trình quản lý khóa của công ty, nhưng không cần cung cấp khóa mới để dùng tính năng. Lark vẫn xác thực danh tính, PostgreSQL vẫn là nguồn dữ liệu tập trung.

Giới hạn hiện tại:100 phiếu gần nhất trong danh sách;4 ảnh/8MB mỗi phiếu; tối đa1.000 dòng bảng/phân bổ và200 lệnh trong một lần xác nhận. Chống trùng ảnh theo bytes SHA-256; hai lần chụp khác nhau cùng chứng từ vẫn cần nhân viên đối soát. Không nhận PDF/HEIC trực tiếp.

## Tương thích phiếu cũ và nhóm bao

Dữ liệu giao nhận vẫn theo SKU/size ở backend; ma trận chỉ đổi cách nhập. Mỗi ô giữ ID dòng, số nhận, variant và lệnh chọn riêng. Hai trường JSON tùy chọn `bagGroupId`/`lineGroupId` giúp giữ bao/dòng màu ổn định khi đổi nhãn bao, lưu nháp và mở lại. Không cần migration SQL mới.

Phiếu cũ không có ID nhóm được hiển thị theo số bao → mã–màu → size; thứ tự theo lần xuất hiện trong phiếu, không tự sắp xếp lại bao. Nếu có hai dòng cùng SKU và cùng size, giữ hai dòng màu riêng, không tự gộp số nhận hoặc ghi đè lệnh đã chọn. Các bao/dòng mới có ID riêng nên không bị nhập chung chỉ vì nhãn bao/mã/màu giống nhau. Phiếu đã xác nhận chỉ xem và không viết lại dữ liệu cũ.

Bỏ dòng màu chỉ loại các ô thuộc dòng đó khỏi nháp. Bỏ cả bao có xác nhận riêng. Sau mọi chỉnh sửa, bảng phân bổ cũ bị hủy để tính lại. Giới hạn1.000 ô SKU của backend tương ứng tối đa250 dòng màu mới đủ bốn size.

## Hàng về chưa tìm thấy lệnh — áp dụng từ bản mới

Hai nhóm độc lập: **Đã đối chiếu lệnh** (có biên nhận vào lệnh cụ thể) và **Chưa đối chiếu lệnh** (đã nhận vật lý, chưa xác định lệnh trên app). Nhóm thứ hai phù hợp hàng sửa, hàng lẻ hoặc lô trước khi triển khai app; không tự kết luận nguồn gốc khi chưa có căn cứ.

Tất cả bốn size đều mở nhập. Danh sách mã/màu lấy cả danh mục và lệnh đang lưu; có thể nhập mã/màu lô cũ bằng tùy chọn nhập tay. Nếu size chưa có variant, chỉ lưu thông tin thực nhận, không tạo sản phẩm/SKU hoặc lệnh giả. Có thể chọn “Chưa đối chiếu lệnh” cho cả dòng màu hoặc riêng từng size để chủ động ghi nhận lô cũ, kể cả hiện đã có lệnh trùng SKU.

Bấm xem phân bổ: FIFO chỉ cộng phần còn thiếu của lệnh phù hợp. Phần vượt hoặc không có lệnh nằm riêng ở “Chưa đối chiếu lệnh”. Để lưu phần này cần điền **Nhà xưởng trả hàng**, đánh dấu **Đồng ý lưu hàng chưa đối chiếu lệnh**, rồi xác nhận đã kiểm tra và ghi nhận. Có thể nhập tên xưởng cũ chưa có trong danh sách. Ví dụ nhận204, lệnh còn150: xác nhận150 vào lệnh +54 vào sổ chưa đối chiếu. Có thể chọn lệnh nhận dư để ghi204 theo lệnh nếu thực tế đã xác định đúng lệnh.

Không tự chuyển lỗi chọn lệnh thủ công hoặc nhiều xưởng mơ hồ thành hàng chưa đối chiếu. Phải sửa lựa chọn, chọn xưởng hoặc chủ động chọn chế độ Chưa đối chiếu lệnh. Hàng chưa đối chiếu không tự trừ nợ bất kỳ lệnh nào, không đổi số đặt và không cộng tồn kho.

Cả phiếu thuần chưa đối chiếu (không có biên nhận theo lệnh) và phiếu hỗn hợp đều lưu atomic/idempotent. `result.received` là tổng thực nhận, có hai tổng `matchedReceived` và `unmatchedReceived`. Ảnh, ngày, xưởng, người ghi, số bao, mã–màu–size và lý do được giữ. Không nhập lại phiếu đã xác nhận để tránh ghi trùng. Bản hiện tại chưa có chức năng gắn lại sổ chưa đối chiếu vào một lệnh sau khi đã xác nhận; cần quy trình đối soát riêng trước khi triển khai thao tác đó.

## Dashboard ngay trong Nhập liệu hàng về

- Tổng thực nhận, đã/chưa đối chiếu, tỷ lệ chưa đối chiếu, số mã có hàng nhận, số còn thiếu hiện tại; số biên nhận theo lệnh, phiếu có hàng chưa đối chiếu, lệnh còn thiếu và quá hạn.
- Biểu đồ tròn tỷ trọng sản lượng theo mã (top8 + nhóm các mã khác), bấm mã để lọc; biểu đồ hàng nhận theo ngày tách hai nhóm.
- Mở mã để xem màu và bốn cột S/M/L/XL, tổng đã/chưa đối chiếu.
- Chi tiết từng đợt nhận, nhãn phân loại, xưởng, lệnh hoặc phiếu, người ghi và lý do. Bấm mã lệnh mở chi tiết lệnh.
- Danh sách còn thiếu theo lệnh–mã–màu–size: số đặt, đã nhận, còn thiếu, hẹn giao, cảnh báo quá hạn.
- Lọc theo kỳ ngày nhận, mã, màu đầy đủ, size, xưởng, phân loại và tìm kiếm không dấu. Tùy chọn tính nợ Nháp/Tạm dừng. CSV có toàn bộ dòng hàng nhận của bộ lọc, không chỉ100 dòng đang hiển thị. Xem thêm từng100 dòng đến1.000; tổng và tỷ trọng luôn tính trên toàn bộ dữ liệu phù hợp.

Khoảng ngày áp dụng cho **ngày thực nhận**. Bảng nợ lệnh là hiện tại, theo bộ lọc sản phẩm/xưởng/tìm kiếm và trạng thái; không bị cắt theo ngày nhận hay phân loại nhận, có ghi rõ trên giao diện. Chưa đối chiếu không được trừ vào nợ lệnh. Dữ liệu nháp không tính vào KPI. Nhận trực tiếp ở chi tiết lệnh và biên nhận cũ đều được tính, không cộng thêm tổng JSON phiếu gây đếm trùng. Lệnh xóa/hủy vẫn giữ số nhận lịch sử trong báo cáo hàng về, nhưng không còn tính nợ vận hành. Chỉ bốn size đang kinh doanh được tính trong báo cáo này.

Administrator/Warehouse được nhập và xem; các vai trò chỉ đọc/Manager/Planner có thể xem dashboard và CSV theo quyền đọc hiện hành nhưng không ghi nhận. Mặc định kỳ30ngày theo giờ Việt Nam; chưa có dữ liệu thì hiện trạng thái rỗng, không dùng dữ liệu mẫu.

Migrations010–011 thêm sổ `incoming_unmatched_items` bất biến và cột snapshot xưởng cho biên nhận mới. Không backfill/sửa biên nhận cũ; biên nhận cũ chưa có snapshot dùng xưởng hiện tại trên lệnh khi báo cáo. Các lần nhận mới giữ xưởng tại thời điểm nhận dù về sau sửa xưởng của lệnh. Cả hai nguồn được đọc trong snapshot database nhất quán. Dữ liệu nằm PostgreSQL và đi cùng backup database; không gửi ra dịch vụ AI. Nhãn KPI tổng quan cũ đổi thành “Đã nhận theo lệnh” để rõ phạm vi; dashboard hàng về mới bao gồm cả nhóm chưa đối chiếu.
