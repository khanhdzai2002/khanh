"""Manual browser regression against tests/serve-smoke.ts + Vite 5175 ONLY.
Requires Python playwright and system Chromium. All entered values are synthetic.
Never point this script at deployed services or a business database.
"""
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(locale='vi-VN', viewport={'width':1440,'height':1000})
    page.set_default_timeout(10000)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept('SYNTHETIC audit reason') if d.type == 'prompt' else d.accept())
    page.goto('http://localhost:5175', wait_until='networkidle')
    page.get_by_role('button', name='Đăng nhập DEV (dữ liệu thử nghiệm)').click()
    expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN', exact=False)).to_be_visible()
    assert page.request.get('http://localhost:5175/api/me').json()['development'] is True
    assert page.request.get('http://localhost:5175/api/skus').json() == [], 'Start with a fresh dedicated _test DB'
    page.get_by_role('button', name='Gối lệnh sản xuất', exact=True).click()
    page.get_by_role('button', name='Tạo lệnh sản xuất', exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('Nhà xưởng', exact=True).fill('SYNTHETIC Xưởng UI')
    d.get_by_role('button', name='Lưu lệnh vào lịch sử', exact=True).click()
    expect(d.get_by_role('alert')).to_contain_text('Lệnh chưa có sản phẩm')
    # Fresh catalogue: adding products must work here without closing this editor.
    d.get_by_label('Mã sản phẩm mới hoặc đã có', exact=True).fill('SYNTHETIC-UI')
    d.get_by_label('Màu / phối màu — mỗi màu một dòng', exact=True).fill('Cam\nTrắng')
    for size,qty in [('S','10'),('M','20'),('L','30')]: d.get_by_label(size, exact=True).fill(qty)
    d.get_by_role('button',name='Thêm các màu đã chọn',exact=True).click()
    expect(d.get_by_label('SYNTHETIC-UI Cam S',exact=True)).to_have_value('10')
    # A size absent from the catalogue must be editable in the matrix.
    d.get_by_label('SYNTHETIC-UI Cam XL',exact=True).fill('7')
    d.get_by_label('SYNTHETIC-UI Cam XL',exact=True).fill('')
    d.get_by_label('SYNTHETIC-UI Cam XL',exact=True).fill('7')
    assert page.request.get('http://localhost:5175/api/skus').json()==[], 'Uncommitted draft must not write catalogue'
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/orders/compose')) as response:
        d.get_by_role('button',name='Lưu lệnh vào lịch sử',exact=True).click()
    assert response.value.status==201, response.value.text()
    saved=response.value.json()
    d.wait_for(state='hidden')
    assert sum(i['qty'] for i in saved['items'])==127
    skus=page.request.get('http://localhost:5175/api/skus').json()
    assert len(skus)==7 and all(s['stock'] is None and s['health']=='Mở bán' for s in skus)
    row=page.get_by_role('row').filter(has_text=saved['code'])
    row.get_by_role('button',name='Chi tiết',exact=True).click()
    d=page.get_by_role('dialog')
    receive=d.get_by_label('Nhận SYNTHETIC-UI Cam S',exact=True)
    receive.fill('1000')
    d.get_by_role('button',name='Ghi nhận hàng giao',exact=True).click()
    expect(d.get_by_role('alert')).to_contain_text('không vượt số còn chờ')
    for qty in ['3','2']:
        receive.fill(qty)
        with page.expect_response(lambda r:r.request.method=='POST' and '/receipts' in r.url) as received:
            d.get_by_role('button',name='Ghi nhận hàng giao',exact=True).click()
        assert received.value.status==200
        expect(receive).to_have_value('0')
    assert all(s['stock'] is None for s in page.request.get('http://localhost:5175/api/skus').json())
    expect(d.get_by_text('SYNTHETIC-UI · Cam · S',exact=True)).to_have_count(2)
    # Partial receipts survive edit; add a new colour inside the existing order.
    d.get_by_role('button',name='Chỉnh sửa',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('SYNTHETIC-UI Cam S',exact=True).fill('12')
    d.get_by_role('button',name='Nhập mã / màu mới',exact=True).click()
    d.get_by_label('Mã sản phẩm mới hoặc đã có',exact=True).fill('SYNTHETIC-UI')
    d.get_by_label('Màu / phối màu — mỗi màu một dòng',exact=True).fill('Đen')
    for size,qty in [('XS','2'),('S','0'),('M','0'),('L','0')]: d.get_by_label(size,exact=True).fill(qty)
    d.get_by_role('button',name='Thêm các màu đã chọn',exact=True).click()
    d.get_by_label('Lý do chỉnh sửa (bắt buộc)',exact=True).fill('SYNTHETIC thêm màu sau nhận')
    with page.expect_response(lambda r:r.request.method=='PUT' and '/compose' in r.url) as edited:
        d.get_by_role('button',name='Lưu chỉnh sửa và nhật ký',exact=True).click()
    assert edited.value.status==200, edited.value.text()
    d.wait_for(state='hidden')
    row.get_by_role('button',name='Chi tiết',exact=True).click()
    d=page.get_by_role('dialog')
    expect(d.locator('summary').filter(has_text='SYNTHETIC thêm màu sau nhận')).to_be_visible()
    # Downloads really return files, and print document includes order identity.
    for name in ['Excel','CSV']:
        with page.expect_download() as download: d.get_by_role('link',name=name,exact=True).click()
        assert download.value.failure() is None
    page.evaluate('window.print = () => { window.__printed = true }')
    d.get_by_role('button',name='In / PDF',exact=True).click()
    assert page.evaluate('window.__printed') is True
    page.emulate_media(media='print')
    expect(d.get_by_role('heading',name='LỆNH SẢN XUẤT · '+saved['code'])).to_be_visible()
    page.emulate_media(media='screen')
    # Cancel/reopen then archive/restore: preserve receipts and revision log.
    for name in ['Hủy phần còn chờ','Khôi phục phần chưa nhận']:
        d.get_by_role('button',name=name,exact=True).click()
        d.get_by_label('Lý do thao tác (bắt buộc)',exact=True).fill('SYNTHETIC cancel or reopen')
        with page.expect_response(lambda r:r.request.method=='POST' and ('/cancel' in r.url or '/reopen' in r.url)) as action:
            d.get_by_role('button',name='Xác nhận thao tác',exact=True).click()
        assert action.value.status==200
        expect(d.get_by_role('heading',name='LỆNH SẢN XUẤT · '+saved['code'])).to_be_visible()
    d.get_by_role('button',name='Đóng',exact=True).click()
    row.get_by_role('button',name='Xóa mềm',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('Lý do thao tác (bắt buộc)',exact=True).fill('SYNTHETIC archive')
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/delete')) as deleted:
        d.get_by_role('button',name='Xác nhận thao tác',exact=True).click()
    assert deleted.value.status==200
    page.get_by_role('button',name='Lệnh đã xóa',exact=True).click()
    row=page.get_by_role('row').filter(has_text=saved['code'])
    row.get_by_role('button',name='Khôi phục',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('Lý do thao tác (bắt buộc)',exact=True).fill('SYNTHETIC restore')
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/restore')) as restored:
        d.get_by_role('button',name='Xác nhận thao tác',exact=True).click()
    assert restored.value.status==200
    page.get_by_role('button',name='Dự kiến sản xuất',exact=True).click()
    # Inline stock/test edits and selection -> order save.
    sku=next(s for s in page.request.get('http://localhost:5175/api/skus').json() if s['color']=='Cam' and s['size']=='S')
    stock=page.get_by_label('Tồn '+sku['id'],exact=True)
    stock.fill('1.5');stock.press('Enter')
    expect(page.get_by_role('alert')).to_contain_text('số nguyên')
    expect(stock).to_have_value('')
    with page.expect_response(lambda r:r.request.method=='PUT' and '/api/skus/' in r.url) as updated:
        stock.fill('30');stock.press('Enter')
    assert updated.value.status==200
    test=page.get_by_label('SL test '+sku['id'],exact=True)
    with page.expect_response(lambda r:r.request.method=='PUT' and '/api/skus/' in r.url) as updated:
        test.fill('9');test.press('Enter')
    assert updated.value.status==200
    page.get_by_label('Chọn SYNTHETIC-UI Cam S',exact=True).check()
    page.get_by_role('button',name='Đưa vào lệnh',exact=False).click()
    d=page.get_by_role('dialog')
    expect(d.get_by_label('SYNTHETIC-UI Cam S',exact=True)).to_have_value('9')
    d.get_by_label('Nhà xưởng',exact=True).fill('SYNTHETIC refresh failure')
    page.route('**/api/dashboard', lambda route: route.abort(), times=1)
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/compose')) as refresh_test:
        d.get_by_role('button',name='Lưu lệnh vào lịch sử',exact=True).click()
    assert refresh_test.value.status==201
    d.wait_for(state='hidden')
    expect(page.get_by_role('alert')).to_contain_text('Thao tác đã hoàn tất')
    assert len(page.request.get('http://localhost:5175/api/orders').json())==2
    page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click()
    expect(page.get_by_role('alert')).to_have_count(0)
    # A backend validation conflict stays visible inside the editor, preserving input.
    page.get_by_role('button',name='Tạo lệnh sản xuất',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('Mã lệnh (để trống để sinh tự động)',exact=True).fill(saved['code'])
    d.get_by_label('Nhà xưởng',exact=True).fill('SYNTHETIC duplicate')
    d.get_by_label('Mã sản phẩm',exact=True).select_option('SYNTHETIC-UI')
    d.get_by_role('button',name='Thêm các màu đã chọn',exact=True).click()
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/compose')) as duplicate:
        d.get_by_role('button',name='Lưu lệnh vào lịch sử',exact=True).click()
    assert duplicate.value.status==409
    expect(d.locator('.dialog-feedback')).to_contain_text('đã tồn tại')
    expect(d.get_by_label('Nhà xưởng',exact=True)).to_have_value('SYNTHETIC duplicate')
    d.get_by_role('button',name='Đóng, không lưu',exact=True).click()
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button',name='Tạo lệnh sản xuất',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_role('button',name='Lưu lệnh vào lịch sử',exact=True).scroll_into_view_if_needed()
    expect(d.get_by_role('button',name='Lưu lệnh vào lịch sử',exact=True)).to_be_in_viewport()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    d.get_by_role('button',name='Đóng, không lưu',exact=True).click()
    assert not errors, errors
    print('PASS V9 core browser workflow: empty catalogue -> manual multi-colour order -> new matrix size -> save -> over-receipt blocked -> 2 receipts -> edit/add colour -> files/print -> cancel/reopen -> archive/restore -> inline validation and persistence -> planning selection -> mobile. Synthetic data only.')
    browser.close()
