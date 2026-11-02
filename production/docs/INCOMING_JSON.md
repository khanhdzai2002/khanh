# Nhập hàng tự động từ JSON

Menu mới **Nhập hàng tự động** nhận JSON đã xử lý bên ngoài app (đúng định dạng xuất từ HTML phiếu kiểm hàng). Module **Nhập liệu hàng về** nhập ảnh/bảng thủ công vẫn giữ. Không gọi AI, không cần API key mới, không chạy HTML được tải lên.

## Quy trình

1. Dán JSON hoặc chọn file `.json`/`.txt`, bấm **Đọc JSON và xem ánh xạ**. Chỉ xem trước; chưa tạo lệnh, chưa nhận hàng, chưa đổi tồn kho.
2. Kiểm tra document ID, ngày nhận, tên xưởng, người kiểm và tổng lượng. Nếu nguồn có `supplier_review_required`, sửa/chọn đúng xưởng. Ứng dụng giữ cả thông tin nguồn và thông tin người dùng đã chọn.
3. Bảng theo dòng phiếu/bao có bốn cột S/M/L/XL. Mã đối chiếu theo danh mục; màu ưu tiên khớp đúng, quy ước đã lưu, rồi gợi ý duy nhất trong cùng mã. Màu nhiều khả năng phù hợp không tự chọn; người dùng chọn màu đầy đủ. Mã đọc nhầm có thể chọn lại từ danh mục.
4. Dòng `needs_review=true`, màu gợi ý/thay đổi và hàng chưa có danh mục phải xác nhận đã kiểm tra. Nút **Đã kiểm tra các gợi ý màu** chỉ áp dụng dòng đang hiển thị có mã/màu hợp lệ, trừ dòng nguồn đánh dấu cần xác minh và dòng giữ chưa đối chiếu. Hai loại đó phải kiểm tra riêng. Metadata có ô xác nhận riêng.
5. Mã/màu chưa có trên app có thể chọn **Giữ nguyên, chưa đối chiếu**. Giữ thông tin thực nhận, không tự tạo SKU hoặc lệnh giả. Nếu đã có đúng mã/màu nhưng size chưa có SKU, vẫn nhập được theo cơ chế hàng chưa đối chiếu hiện hành.
6. Bấm **Tạo phiếu JSON để đối soát lệnh**. Tạo phiếu nháp, tự điền Bao → mã/màu → S/M/L/XL, không cần nhập lại số lượng. Từ đây dùng bảng và các nút hiện hành: chỉnh sửa, lưu nháp, **Tự động cộng dồn — xem phân bổ**, chọn lệnh/phần dư, xác nhận hàng chưa đối chiếu và cuối cùng **Xác nhận ghi nhận hàng**.
7. FIFO chia đúng mã–màu–size/xưởng vào phần còn thiếu của từng lệnh. Phần chưa tìm được lệnh/giao dư cần lựa chọn riêng như nhập thủ công. Không tự cộng tồn kho. Dashboard hàng về tính các biên nhận này một lần, cùng dữ liệu nhập thủ công.

**Quay lại nhập JSON** tự lưu bảng nháp hợp lệ trước khi quay lại danh sách. Phiếu JSON của tôi cho mở lại nháp/phiếu đã xác nhận; phiếu đã ghi chỉ xem. Nút **Tải JSON nguồn** tải nguồn đã kiểm tra schema. Nguồn, quyết định ánh xạ, người nhập, mã chứng từ và tổng nguồn được giữ để đối soát. Nếu sửa số lượng tại bảng nháp làm tổng khác nguồn, giao diện cảnh báo chênh lệch; không viết lại nguồn.

## Màu trạng thái và tìm dòng cần xử lý

- **Xanh**: Khớp danh mục/quy ước đã lưu, hoặc ánh xạ đã kiểm tra. Nếu người dùng đổi màu, nhãn cập nhật ngay theo lựa chọn mới.
- **Đỏ**: cần chọn mã/màu hoặc lựa chọn không còn khớp danh mục. Đánh dấu đã kiểm tra không thể làm dòng thiếu màu chuyển xanh.
- **Cam**: gợi ý theo mã/chọn lại màu/nguồn có cờ cần kiểm tra, đang chờ xác nhận. Màu khớp vẫn cam nếu số liệu nguồn chưa được duyệt.
- **Tím**: chủ động giữ nguyên để nhận chưa đối chiếu lệnh, đã xác nhận dòng. Dòng giữ nguyên chưa kiểm tra vẫn cam.

Nhãn chữ/ký hiệu và nền/viền dòng đi cùng màu. Các nút có số lượng để lọc Tất cả, Đã sẵn sàng, Cần chọn mã/màu, Cần kiểm tra, Chưa đối chiếu; tìm không dấu theo mã, màu, bao hoặc dòng nguồn. Trạng thái cập nhật sau chọn/kiểm tra, dòng có thể rời bộ lọc đang xem khi đã xử lý. Dòng ẩn vẫn giữ đầy đủ trong phiếu và còn được kiểm tra tại backend; lọc không bỏ số lượng hoặc bỏ qua dòng lỗi. Nút kiểm tra gợi ý không xác nhận dòng bị ẩn bởi bộ lọc/tìm kiếm.

## Định dạng nhận

Nhận duy nhất `schema: comsflow.production.import.v1`, `import_mode: WAREHOUSE_RECEIPT`, `document.document_type: WAREHOUSE_RECEIPT`. Từ chối PRODUCTION_ORDER để không nhầm hàng thực về thành lệnh đặt mới.

```json
{
  "schema": "comsflow.production.import.v1",
  "import_mode": "WAREHOUSE_RECEIPT",
  "document": {
    "document_id": "SYNTHETIC-DEMO-001",
    "document_type": "WAREHOUSE_RECEIPT",
    "receipt_date": "2026-11-01",
    "supplier": "Xưởng thử nghiệm",
    "supplier_review_required": false,
    "checker": "Người kiểm thử"
  },
  "items": [
    {
      "sku": "SYNTHETIC-DEMO",
      "color": "Đen",
      "size": "M",
      "quantity": 12,
      "source_row": 1,
      "bag_no": "1",
      "sku_source": "handwritten",
      "needs_review": false,
      "review_note": ""
    }
  ],
  "notes": []
}
```

Các trường tùy chọn của document: `document_type_label`, `inspection_date`, `receipt_number`. Ngày ISO YYYY-MM-DD, quantity là số nguyên không âm (không tự đổi chuỗi hoặc số thập phân). JSON tối đa1.000.000 ký tự; tối đa2.000 items nguồn và250 dòng mã–màu sau gom, tương đương1.000 ô size. Một ô tối đa1.000.000 sản phẩm. JSON bọc đúng một code fence json hoặc BOM được chấp nhận; không nhận nhiều đối tượng ghép nối.

Số lượng dương chỉ thuộc S/M/L/XL. Ô0 bỏ qua; XS/XXL/2XL dương bị chặn, không đổi sang XL. Một mã/màu/size lặp ở nhiều bao/dòng được giữ và cộng đủ khi phân bổ, không ghi đè. Cùng source_row/bao/mã/màu có size lặp được cộng vào ô đó và giữ chỉ mục nguồn. Số bao trống không tự kế thừa; mỗi dòng nguồn trống bao có nhóm riêng để tránh gộp nhầm.

## Chống nhập trùng và bảo toàn dữ liệu

Mỗi phiếu thực tế cần **document_id duy nhất**. Mã được chuẩn hóa trim/NFKC/hoa để kiểm tra trùng trên toàn hệ thống. Khi tạo nháp, mã được giữ chỗ; nhập lại cùng mã bị chặn ngay cả khác người hoặc phiếu vẫn nháp. Muốn sửa phiếu đó, mở lại nháp thay vì tạo bản thứ hai. Không đổi document ID để lách cảnh báo trùng của cùng chứng từ.

Tạo nháp lặp cùng preview/nội dung trả lại cùng draft ID; nội dung khác bị chặn. Preview gắn chủ tài khoản, TTL30phút, kiểm tra đầy đủ ánh xạ và danh mục tại backend; không tin ID/số lượng do client tự gửi thêm. Tạo draft + form + registry + audit trong một transaction. Giai đoạn ghi nhận dùng lại transaction/version/idempotency/snapshot lệnh của module nhập hàng hiện hành.

Migration014 **chỉ tạo bảng mới** `incoming_json_sources` và trigger chống sửa/xóa nguồn. Không UPDATE/DELETE/backfill dữ liệu cũ. Nguồn và quyết định ánh xạ lưu PostgreSQL cùng backup. Không có tác vụ tự nhập file mẫu hoặc seed dữ liệu công ty. Deploy không tự ghi nhận hàng; chỉ thao tác xác nhận của người được phép mới ghi.

Administrator và Warehouse Operator được nhập JSON; ảnh/phiếu/lệnh và module thủ công giữ cơ chế quyền hiện hành. Không cần biến môi trường mới. Railway tự chạy migration qua startup/pre-deploy như cấu hình đang có. Những chứng từ nhập thủ công trước đây không có document_id trong registry mới; nhân viên vẫn cần đối soát để tránh nhập lại chúng qua JSON.


## Đính kèm ảnh phiếu kiểm

Sau tạo phiếu JSON, dùng **Ảnh phiếu kiểm đính kèm → Thêm ảnh phiếu kiểm** để lưu ảnh cùng phiếu; có thể thêm sau khi ghi nhận. Ngày kiểm mặc định từ JSON nguồn nếu có, người dùng xác nhận/sửa ngày trên ảnh trước khi tải. Nguồn JSON bất biến, bảng nhập, tổng số nhận và phân bổ không bị sửa khi thêm hoặc phân loại ảnh. Tra cứu ở **Kho ảnh phiếu kiểm**; xem [hướng dẫn chứng từ](INSPECTION_ARCHIVE.md).
