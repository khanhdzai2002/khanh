"""Run after browser-workflow.py against the same dedicated smoke _test DB only."""
from playwright.sync_api import sync_playwright, expect
csv='''Order ID,Order Line ID,Order Status,Product Name,Variation,Quantity,Created Time
SYNTHETIC-A,LA,Completed,Áo MIU66,"Trắng phối đen, M",10,2026-10-14 10:00:00
SYNTHETIC-B,LB,Completed,Áo MIU66,"Trắng phối đen, M",30,2026-10-15 10:00:00
SYNTHETIC-C,LC,Completed,Áo MIU37,"Đen, S",12,2026-10-15 10:00:00
SYNTHETIC-D,LD,Completed,Áo MIU66,"COMBO 2 ÁO, M",4,2026-10-15 10:00:00
SYNTHETIC-E,LE,Cancelled,Áo MIU66,"Trắng phối đen, M",99,2026-10-15 10:00:00'''
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=b.new_page(locale='vi-VN',viewport={'width':1440,'height':1000})
    page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.goto('http://localhost:5175',wait_until='networkidle')
    page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)').click()
    expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
    assert page.request.get('http://localhost:5175/api/me').json()['development'] is True
    page.get_by_role('button',name='Phân tích bán hàng',exact=True).click()
    page.get_by_role('button',name='Nhập đơn hàng Excel / CSV',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('File đơn hàng CSV hoặc XLSX (tối đa 10 MB)',exact=True).set_input_files({'name':'synthetic-ui-sales.csv','mimeType':'text/csv','buffer':csv.encode()})
    d.get_by_label('Kỳ báo cáo từ',exact=True).fill('2026-10-14')
    d.get_by_label('Kỳ báo cáo đến',exact=True).fill('2026-10-15')
    d.get_by_label('Thời điểm xuất báo cáo (Việt Nam)',exact=True).fill('2026-10-16T10:00')
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/sales/preview')) as preview:
        d.get_by_role('button',name='Phân tích và xem trước',exact=True).click()
    assert preview.value.status==200
    data=preview.value.json()
    assert data['errors']==[],data['errors']
    assert data['summary']['single']==52 and data['summary']['combo']==4 and data['summary']['excluded']==99
    expect(page.get_by_role('dialog',name='Xem trước kỳ bán hàng',exact=True)).to_be_visible()
    assert page.request.get('http://localhost:5175/api/sales').json()['variants']==[]
    with page.expect_response(lambda r:r.request.method=='POST' and '/sales/' in r.url and r.url.endswith('/confirm')) as confirmed:
        d.get_by_role('button',name='Xác nhận ghi báo cáo',exact=True).click()
    assert confirmed.value.status==200
    d.wait_for(state='hidden')
    expect(page.get_by_label('Tồn bán hàng MIU66 Trắng (phối tay đen) M',exact=True)).to_be_visible()
    # Enter inventory directly in sales like V9, preserving lifecycle as an operator choice.
    for label,val in [('Tồn bán hàng MIU66 Trắng (phối tay đen) M','30'),('Đang về bán hàng MIU66 Trắng (phối tay đen) M','10')]:
        with page.expect_response(lambda r:r.request.method in ['POST','PUT'] and '/api/skus' in r.url) as saved:
            field=page.get_by_label(label,exact=True);field.fill(val);field.press('Enter')
        assert saved.value.status in [200,201]
    with page.expect_response(lambda r:r.request.method=='PUT' and '/api/skus/' in r.url) as changed:
        page.get_by_label('Vòng đời bán hàng MIU66 Trắng (phối tay đen) M',exact=True).select_option('Tăng trưởng')
    assert changed.value.status==200
    code=page.get_by_label('Mã sản phẩm',exact=True)
    code.select_option('MIU66')
    # Export uses selected product/period and includes computed 2/7-day rates.
    with page.expect_download() as download: page.get_by_role('link',name='Excel',exact=True).click()
    assert download.value.failure() is None
    export=page.request.get('http://localhost:5175/api/export/sales?sku=MIU66&from=2026-10-14&to=2026-10-15').text()
    assert 'MIU66' in export and 'MIU37' not in export and 'TB/ngày 2 ngày' in export and '60' in export
    combo=page.request.get('http://localhost:5175/api/export/combos?sku=MIU66').text()
    assert 'COMBO 2 ÁO' in combo
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/sales/sync')) as synced:
        page.get_by_role('button',name='Chuyển SKU đang lọc sang dự báo',exact=True).click()
    assert synced.value.status==200 and synced.value.json()['count']==1
    expect(page.get_by_role('heading',name='Dự kiến sản xuất',exact=True)).to_be_visible()
    skus=page.request.get('http://localhost:5175/api/skus').json()
    assert not any(s['sku']=='MIU37' for s in skus)
    sku=next(s for s in skus if s['sku']=='MIU66')
    assert sku['stock']==30 and sku['inbound']==10 and sku['health']=='Tăng trưởng' and sku['day1']==10 and sku['day2']==30
    # Forecast remains exactly 20 * 5 - 30 - 10 = 60.
    row=page.get_by_role('row').filter(has=page.get_by_label('Tồn '+sku['id'],exact=True))
    expect(row.locator('.formula strong')).to_have_text('60')
    # SKU batch and policy defaults operate through the actual forms.
    page.get_by_role('button',name='Thêm SKU / nhiều size',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('Mã sản phẩm',exact=True).fill('SYNTHETIC-BATCH')
    d.get_by_label('Màu / phối màu — mỗi màu một dòng',exact=True).fill('Cam\nĐen')
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/skus/batch')) as batch:
        d.get_by_role('button',name='Tạo 6 SKU',exact=True).click()
    assert batch.value.status==201
    d.wait_for(state='hidden')
    page.get_by_role('button',name='Chính sách tồn',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('Ngày tồn mục tiêu',exact=True).fill('7')
    d.get_by_role('button',name='Khôi phục mặc định V9',exact=True).click()
    expect(d.get_by_label('Ngày tồn mục tiêu',exact=True)).to_have_value('5')
    with page.expect_response(lambda r:r.request.method=='PUT' and r.url.endswith('/api/policy')) as policy:
        d.get_by_role('button',name='Lưu chính sách',exact=True).click()
    assert policy.value.status==200
    d.wait_for(state='hidden')
    assert not errors,errors
    print('PASS sales browser: CSV preview/confirmation, exclusions+combo, inline inventory/inbound/lifecycle, filtered export, filtered sync preserves stock/lifecycle and excludes other SKU, forecast 60, batch SKU, policy defaults. Synthetic only.')
    b.close()
