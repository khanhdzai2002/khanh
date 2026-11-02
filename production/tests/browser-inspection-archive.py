"""Run only with tests/serve-smoke.ts (_test DB) and Vite on localhost:5175.
Synthetic evidence: manual + JSON + confirmed/direct receipts, archive and unchanged data.
"""
import base64, io, json
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:5175'

def photo(label):
    image = Image.new('RGB', (800, 1100), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((70, 65), 'SYNTHETIC INSPECTION SLIP - ' + label, fill='black')
    for y in range(180, 950, 65):
        draw.line((60, y, 740, y), fill='gray')
    for x in [60, 170, 350, 480, 550, 620, 680, 740]:
        draw.line((x, 180, x, 895), fill='gray')
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    return {'name': 'synthetic-' + label + '.png', 'mimeType': 'image/png', 'buffer': buf.getvalue()}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(locale='vi-VN', viewport={'width': 1500, 'height': 1050})
    page.set_default_timeout(15000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='networkidle')
    page.get_by_role('button', name='Đăng nhập DEV (dữ liệu thử nghiệm)', exact=True).click()
    expect(page.locator('.dev-banner')).to_be_visible()
    me = page.request.get(BASE + '/api/me').json()
    assert me['development']
    headers = {'Origin': BASE, 'X-CSRF-Token': me['csrf']}

    def post(path, data):
        response = page.request.post(BASE + path, data=data, headers=headers)
        assert response.ok, response.text()
        return response.json()

    def get(path):
        response = page.request.get(BASE + path)
        assert response.ok, response.text()
        return response.json()

    def nav(name):
        if page.viewport_size['width'] < 700:
            page.get_by_role('button', name='Mở điều hướng', exact=True).click()
        page.get_by_role('button', name=name, exact=True).click()

    def attach(file, date):
        panel = page.get_by_role('region', name='Ảnh chứng từ của phiếu nhập', exact=True)
        expect(panel.get_by_label('Ảnh đính kèm bổ sung', exact=True)).to_have_count(1)
        detail = panel.locator('details.inspection-upload')
        if not detail.evaluate('(d)=>d.open'):
            detail.locator('summary').click()
        panel.get_by_label('Ngày kiểm trên phiếu', exact=True).fill(date)
        panel.get_by_label('Ảnh đính kèm bổ sung', exact=True).set_input_files(file)
        with page.expect_response(lambda r: '/api/inspection-archive/targets/' in r.url and r.url.endswith('/images')) as response:
            panel.get_by_role('button', name='Lưu thêm ảnh phiếu kiểm', exact=True).click()
        assert response.value.status == 201, response.value.text()
        return response.value.json()

    old_photo = photo('old-proof')
    old = post('/api/incoming', {'images': [{'name': old_photo['name'], 'data': base64.b64encode(old_photo['buffer']).decode()}]})
    old_before = get('/api/incoming/' + old['id'])
    variant = post('/api/skus', {'sku': 'SYNTHETIC-PROOF-MIU37', 'color': 'Ghi tay (Phoi nau)', 'size': 'M', 'stock': 30, 'inbound': 10})['id']
    order = post('/api/orders', {'time': '2026-10-23T10:00:00+07:00', 'supplier': 'Synthetic Proof Factory', 'delivery': '2026-11-03', 'requestedBy': 'Synthetic', 'notes': 'SYNTHETIC ONLY', 'status': 'Đang sản xuất', 'items': [{'variantId': variant, 'qty': 150, 'priority': 'THƯỜNG'}]})
    source = {'schema': 'comsflow.production.import.v1', 'import_mode': 'WAREHOUSE_RECEIPT', 'document': {'document_id': 'SYNTHETIC-PROOF-JSON', 'document_type': 'WAREHOUSE_RECEIPT', 'receipt_date': '2026-10-27', 'inspection_date': '2026-10-26', 'supplier': 'Synthetic Proof Factory'}, 'items': [{'sku': 'SYNTHETIC-PROOF-MIU37', 'color': 'Ghi tay (Phoi nau)', 'size': 'M', 'quantity': 100, 'source_row': 1, 'bag_no': '1'}]}
    preview = post('/api/incoming-json/preview', {'text': json.dumps(source)})
    json_draft = post('/api/incoming-json/' + preview['id'] + '/create', {'date': '2026-10-27', 'supplier': 'Synthetic Proof Factory', 'note': 'SYNTHETIC JSON', 'metadataReviewed': True, 'mappings': [{'key': line['key'], 'sku': line['suggestedSku'], 'color': line['suggestedColor'] or line['color'], 'keepUnmatched': False, 'reviewed': True} for line in preview['lines']]})

    page.get_by_role('button', name='Tải lại dữ liệu', exact=True).click()
    nav('Nhập liệu hàng về')
    with page.expect_response(lambda r: r.url.endswith('/api/incoming') and r.request.method == 'POST') as created:
        page.get_by_role('button', name='Nhập bảng không kèm ảnh', exact=True).click()
    manual_id = created.value.json()['id']
    page.get_by_label('Ghi chú phiếu', exact=True).fill('UNSAVED NOTE MUST SURVIVE PHOTO UPLOAD')
    page.get_by_role('button', name='Thêm bao', exact=True).click()
    page.get_by_label('Mã bao 1 dòng 1', exact=True).select_option('SYNTHETIC-PROOF-MIU37')
    page.get_by_label('Màu bao 1 dòng 1', exact=True).select_option('Ghi tay (Phoi nau)')
    page.get_by_label('M bao 1 dòng 1', exact=True).fill('12')
    form_before = get('/api/incoming/' + manual_id)
    attached = attach(photo('manual-proof'), '2026-10-27')
    assert attached['added'] == 1
    expect(page.get_by_label('Ghi chú phiếu', exact=True)).to_have_value('UNSAVED NOTE MUST SURVIVE PHOTO UPLOAD')
    expect(page.get_by_label('M bao 1 dòng 1', exact=True)).to_have_value('12')
    form_after = get('/api/incoming/' + manual_id)
    assert form_before['form'] == form_after['form'] and form_before['version'] == form_after['version']
    page.get_by_role('button', name='Lưu nháp', exact=True).click()
    expect(page.get_by_text('Đã lưu nháp', exact=False)).to_be_visible()
    # Same-target retry skips proof and leaves the original image untouched.
    retry = attach(photo('manual-proof'), '2026-10-27')
    assert retry['added'] == 0 and retry['skipped'] == 1

    # JSON draft: upload before confirmation, preserve source and allocation.
    nav('Nhập hàng tự động')
    page.locator('tr').filter(has_text='SYNTHETIC-PROOF-JSON').get_by_role('button', name='Mở phiếu JSON', exact=True).click()
    json_id = json_draft['id']
    jd_before = get('/api/incoming/' + json_id)
    attached_json = attach(photo('json-proof'), '2026-10-26')
    assert attached_json['added'] == 1
    jd_after = get('/api/incoming/' + json_id)
    assert jd_before['form'] == jd_after['form'] and jd_before['version'] == jd_after['version']
    assert get('/api/incoming-json/' + json_id + '/source')['document'] == source['document'] or get('/api/incoming-json/' + json_id + '/source')['document']['document_id'] == source['document']['document_id']
    with page.expect_response(lambda r: r.url.endswith('/allocate')) as allocated:
        page.get_by_role('button', name='Tự động cộng dồn — xem phân bổ', exact=True).click()
    assert allocated.value.json()['allocated'] == 100
    page.get_by_text('Tôi đã kiểm tra JSON, số lượng và phân bổ', exact=False).click()
    with page.expect_response(lambda r: r.url.endswith('/confirm')) as confirmed:
        page.get_by_role('button', name='Xác nhận ghi nhận hàng', exact=True).click()
    assert confirmed.value.status == 200, confirmed.value.text()
    confirmation = confirmed.value.json()
    final_before = get('/api/incoming/' + json_id)
    order_before = get('/api/orders/' + order['id'])
    extra = attach(photo('confirmed-extra'), '2026-10-28')
    assert extra['added'] == 1
    final_after = get('/api/incoming/' + json_id)
    assert all(final_before[k] == final_after[k] for k in ['form', 'version', 'result', 'confirmation_hash', 'state'])
    assert get('/api/orders/' + order['id']) == order_before
    assert next(v for v in get('/api/skus') if v['id'] == variant)['stock'] == 30

    # Archive: source/time/product search, view, metadata, original download and order link.
    nav('Kho ảnh phiếu kiểm')
    expect(page.get_by_role('heading', name='Kho ảnh phiếu kiểm', exact=True)).to_be_visible()
    search = page.get_by_label('Tìm ảnh, mã phiếu, lệnh, mã hoặc màu sản phẩm', exact=True)
    search.fill('SYNTHETIC-PROOF-JSON')
    expect(page.locator('.inspection-card')).to_have_count(2)
    page.get_by_label('Ngày kiểm từ', exact=True).fill('2026-10-28')
    page.get_by_label('Ngày kiểm đến', exact=True).fill('2026-10-28')
    expect(page.locator('.inspection-card')).to_have_count(1)
    card = page.locator('.inspection-card').first
    card.get_by_role('button', name='Xem phiếu synthetic-confirmed-extra.png', exact=True).click()
    viewer = page.get_by_role('dialog', name='Phiếu kiểm: synthetic-confirmed-extra.png', exact=True)
    expect(viewer).to_be_visible()
    viewer.get_by_role('button', name='Phóng to', exact=True).click()
    viewer.get_by_role('button', name='Xoay 90°', exact=True).click()
    with page.expect_download() as download:
        viewer.get_by_role('link', name='Tải ảnh gốc', exact=True).click()
    assert open(download.value.path(), 'rb').read() == photo('confirmed-extra')['buffer']
    page.keyboard.press('Escape')
    expect(viewer).to_have_count(0)
    card.get_by_role('button', name='Phân loại ảnh', exact=True).click()
    card.get_by_label('Loại chứng từ của ảnh', exact=True).select_option('Biên bản đối soát')
    card.get_by_label('Ghi chú ảnh', exact=True).fill('SYNTHETIC CORRECTED CLASSIFICATION')
    card.get_by_role('button', name='Lưu phân loại ảnh', exact=True).click()
    expect(card.locator('.badge')).to_have_text('Biên bản đối soát')
    expect(page.get_by_text('Đang tìm ảnh…', exact=True)).to_have_count(0)
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path='/tmp/comsflow-inspection-archive.png', full_page=True)
    # Linked order opens with evidence on the correct receipt.
    card.get_by_role('button', name=order['code'], exact=True).click()
    order_dialog = page.get_by_role('dialog').first
    expect(order_dialog).to_contain_text('Ảnh phiếu kiểm theo đợt nhận')
    details = order_dialog.locator('.inspection-receipt-group').first
    details.locator('summary').first.click()
    expect(details.get_by_role('heading', name='Ảnh phiếu kiểm đính kèm (2)', exact=True)).to_be_visible()
    assert get('/api/orders/' + order['id']) == order_before
    page.keyboard.press('Escape')
    # Phone archive and original slip navigation.
    page.set_viewport_size({'width': 390, 'height': 844})
    nav('Kho ảnh phiếu kiểm')
    expect(page.get_by_role('heading', name='Kho ảnh phiếu kiểm', exact=True)).to_be_visible()
    page.get_by_label('Tìm ảnh, mã phiếu, lệnh, mã hoặc màu sản phẩm', exact=True).fill('SYNTHETIC-PROOF-JSON')
    expect(page.locator('.inspection-card')).to_have_count(2)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/comsflow-inspection-mobile.png', full_page=True)
    page.locator('.inspection-card').first.get_by_role('button', name='Mở phiếu nhập', exact=True).click()
    expect(page.get_by_role('heading', name='Chứng từ JSON: SYNTHETIC-PROOF-JSON', exact=True)).to_be_visible()
    assert get('/api/incoming/' + old['id']) == old_before
    assert get('/api/incoming/' + json_id)['result'] == confirmation
    # A direct manual receipt also gets a searchable, downloadable attachment.
    page.set_viewport_size({'width': 1500, 'height': 1050})
    current_order = get('/api/orders/' + order['id'])
    response = page.request.post(BASE + '/api/orders/' + order['id'] + '/receipts', data={'expectedVersion': current_order['version'], 'date': '2026-10-29', 'note': 'SYNTHETIC DIRECT RECEIPT', 'lines': [{'itemId': current_order['items'][0]['id'], 'qty': 10}]}, headers={**headers, 'Idempotency-Key': 'synthetic-proof-direct-receipt'})
    assert response.ok, response.text()
    receipt = response.json()
    direct_photo = photo('direct-proof')
    direct = post('/api/inspection-archive/targets/receipt/' + receipt['receiptId'] + '/images', {'inspectionDate': '2026-10-29', 'category': 'Phiếu kiểm hàng', 'note': 'Synthetic direct proof', 'images': [{'name': direct_photo['name'], 'data': base64.b64encode(direct_photo['buffer']).decode()}]})
    direct_id = direct['images'][0]['id']
    raw_direct = page.request.get(BASE + '/api/orders/' + order['id'] + '/incoming-images/' + direct_id)
    assert raw_direct.ok and raw_direct.body() == direct_photo['buffer']
    assert any(i['id'] == direct_id for i in get('/api/orders/' + order['id'] + '/history')['sources'])
    nav('Kho ảnh phiếu kiểm')
    page.get_by_label('Nguồn phiếu nhập', exact=True).select_option('direct')
    page.get_by_label('Tìm ảnh, mã phiếu, lệnh, mã hoặc màu sản phẩm', exact=True).fill('SYNTHETIC-PROOF-MIU37')
    expect(page.locator('.inspection-card')).to_have_count(1)
    expect(page.locator('.inspection-card')).to_contain_text('synthetic-direct-proof.png')
    assert not errors, errors
    print('PASS evidence UI: manual unsaved matrix preserved; JSON before/after confirmation; retry skipped; source, stock, old data unchanged; archive time/search/classification; zoom/rotate/download; order/source links; mobile.')
    browser.close()
