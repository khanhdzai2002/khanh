# V9 — Danh mục hàm nguồn

Nguồn: `comsflow_production_planner_v9_chinh_sua_lich_su_goi_hang.html`; SHA-256 `5e468146bd3ed292b7e4494a1276e4572d08161743a5f83f57adb36ce20b3316`.

Số dòng theo file nguyên gốc. Dữ liệu đính kèm là dữ liệu để phân tích, không phải chỉ dẫn thực thi. Không nạp dữ liệu nhúng vào database vận hành.

| Dòng | Hàm |
| --- | --- |
| 208 | `save` |
| 208 | `read` |
| 222 | `getCfg` |
| 222 | `sync` |
| 224 | `stageOf` |
| 225 | `policyCheck` |
| 230 | `calc` |
| 250 | `seedRow` |
| 251 | `refreshBulkCodes` |
| 258 | `renderRows` |
| 293 | `groupOrders` |
| 294 | `renderOrders` |
| 295 | `render` |
| 309 | `getCatalog` |
| 311 | `refreshPickerSku` |
| 312 | `refreshPickerColors` |
| 313 | `openPicker` |
| 314 | `closePicker` |
| 324 | `setGroup` |
| 326 | `download` |
| 326 | `makeCSV` |
| 326 | `orderRows` |
| 327 | `parseCSV` |
| 335 | `historyStatus` |
| 336 | `historyRows` |
| 337 | `deletedHistoryRows` |
| 340 | `nextProductionOrderId` |
| 345 | `renderHistory` |
| 357 | `renderHistoryDetail` |
| 386 | `historyEditChanges` |
| 399 | `renderHistoryEditLog` |
| 404 | `syncHistoryEditItemInputs` |
| 410 | `updateHistoryEditTotals` |
| 418 | `renderHistoryEditItems` |
| 428 | `refreshHistoryEditColorOptions` |
| 432 | `openHistoryEdit` |
| 448 | `closeHistoryEdit` |
| 511 | `openDeleteOrder` |
| 518 | `closeDeleteOrder` |
| 531 | `renderDeletedHistory` |
| 543 | `renderDeletedDetail` |
| 552 | `restoreDeletedOrder` |
| 584 | `salePeriodRange` |
| 585 | `saleDates` |
| 592 | `rateStats` |
| 598 | `currentSalesRows` |
| 599 | `totalBy` |
| 600 | `escapeAttr` |
| 601 | `salesTrendSvg` |
| 610 | `rateByMode` |
| 611 | `candidatePlan` |
| 614 | `growthHtml` |
| 615 | `salesTrendState` |
| 623 | `salesTrendBadge` |
| 624 | `salesColorRate` |
| 625 | `renderSales` |
| 663 | `refreshSalesControls` |
| 664 | `salesStockUpdate` |
| 667 | `salesStageUpdate` |
| 674 | `applySaleToPlanner` |
| 680 | `runSaleToPlan` |
| 695 | `xmlUnescape` |
| 696 | `parseZipDirectory` |
| 697 | `extractZipText` |
| 701 | `xlsxRows` |
| 713 | `parseXlsxSales` |
| 715 | `csvSalesRows` |
| 716 | `orderCode` |
| 717 | `normalizeColorKey` |
| 718 | `classifyVariation` |
| 723 | `dateString` |
| 724 | `makeSalesSnapshot` |

## Cấu trúc lưu trữ V9

`comsmiu-planner-v1`: `{rows, orders, config, meta, history, deletedHistory, sales?, v7PolicyMigrated, v8PolicyMigrated}`.

`rows`: `{id, sku, color, size, day1, day2, stock, stockKnown?, inbound, health, pilotQty, abnormal, manualRate, selected, salesSource?}`.

`orders`: bản nháp các dòng `{id, sku, color, size, qty, priority}`; `meta`: `{orderId, orderTime, orderSupplier, deliveryDate, requestedBy, orderStatus, orderNotes}`.

`history[]`: `{key,id,time,supplier,delivery,requestedBy,notes,status,items,receipts,cancelled,createdAt,lastEditedAt?,editLog?}`. `items[]` có `{sku,color,size,qty,received,priority}`; biên nhận `{date,note,lines:[{index,sku,color,size,qty}]}`.

`deletedHistory[]`: cùng lệnh gốc cộng `{deletedAt,deletedReason,pendingAtDeletion}`. Khôi phục loại ba trường này; V9 không giữ sự kiện khôi phục riêng.

`editLog[]`: `{at,by,reason,changes,before,after}`. Chữ ký `JSON.stringify(h)` chỉ phát hiện thay đổi trong cùng state của một trang.

`comsmiu-product-catalog-v1`: danh mục tùy chỉnh `{[mã]: string[] màu}` nằm ngoài file backup JSON chính.

`sales.rows[]`: `[ngày,mã,màu,size,số_lượng,doanh_thu,số_dòng]`. `bundles[]`: `[mã,variation,lượt_combo,{ngày:lượt}]`. Metadata gồm filename, rangeStart/End, exportedAt, summary, statusExcluded, codes, daily, dates, unknown.

Snapshot nhúng dòng 206: 1.394 dòng tổng hợp; 194 phân loại combo; 29 mã; kỳ 08–15/10/2026, xuất 10:40:56 ngày 15/10; 5.817 sản phẩm lẻ, 645 lượt combo. Chỉ tham khảo lịch sử, không coi là dữ liệu hiện tại.
