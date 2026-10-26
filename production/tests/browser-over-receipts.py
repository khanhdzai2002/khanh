"""Synthetic _test database only: receive factory surplus through the actual UI."""
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=b.new_page(locale='vi-VN',viewport={'width':1440,'height':1000})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:5175',wait_until='networkidle')
    page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click()
    expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
    me=page.request.get('http://localhost:5175/api/me').json(); assert me['development']
    h={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
    def post(path,body):
        r=page.request.post('http://localhost:5175'+path,data=body,headers=h);assert r.ok,r.text();return r.json()
    items=[]
    for size in ['S','M']:
        v=post('/api/skus',{'sku':'SYNTHETIC-SURPLUS','color':'Cam','size':size,'stock':30,'inbound':10})
        items.append({'variantId':v['id'],'qty':100,'priority':'THƯỜNG'})
    o=post('/api/orders',{'time':'2026-10-26T10:00:00+07:00','supplier':'Synthetic factory','delivery':'2026-10-28','requestedBy':'Synthetic','notes':'Surplus test only','status':'Đang sản xuất','items':items})
    page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click()
    page.get_by_role('button',name='Gối lệnh sản xuất',exact=True).click()
    page.get_by_role('row').filter(has=page.get_by_role('cell',name=o['code'],exact=True)).get_by_role('button',name='Chi tiết',exact=True).click()
    d=page.get_by_role('dialog')
    def receive(size,qty):
        field=d.get_by_label('Nhận SYNTHETIC-SURPLUS Cam '+size,exact=True)
        field.fill(str(qty))
        with page.expect_response(lambda r:r.request.method=='POST' and '/receipts' in r.url) as response:
            d.get_by_role('button',name='Ghi nhận hàng giao',exact=True).click()
        assert response.value.status==200,response.value.text()
        expect(field).to_have_value('0')
    receive('S',150)
    expect(d.locator('.order-summary strong')).to_have_text('75%')
    srow=d.locator('.print-order tbody tr').filter(has=page.get_by_role('cell',name='S',exact=True))
    expect(srow.locator('td').nth(6)).to_have_text('0')
    expect(srow.locator('td').nth(7)).to_have_text('50')
    expect(d.locator('.order-summary .badge')).to_have_text('Đã giao một phần')
    receive('M',100)
    expect(d.locator('.order-summary strong')).to_have_text('125%')
    expect(d.locator('.order-summary .badge')).to_have_text('Đã giao vượt')
    receive('S',10)
    expect(d.locator('.order-summary strong')).to_have_text('130%')
    expect(srow.locator('td').nth(4)).to_have_text('100')
    expect(srow.locator('td').nth(5)).to_have_text('160')
    data=page.request.get('http://localhost:5175/api/skus').json()
    assert all(v['stock']==30 and v['inbound']==10 for v in data)
    csv=page.request.get('http://localhost:5175/api/export/orders?id='+o['id']).text()
    assert 'Giao dư' in csv and 'Tiến độ (%)' in csv
    d.get_by_role('button',name='Chỉnh sửa',exact=True).click()
    d=page.get_by_role('dialog')
    expect(d.get_by_label('SYNTHETIC-SURPLUS Cam S',exact=True)).to_have_value('100')
    d.get_by_label('Ghi chú gửi xưởng',exact=True).fill('Synthetic surplus metadata edit')
    d.get_by_label('Lý do chỉnh sửa (bắt buộc)',exact=True).fill('Synthetic audit after surplus')
    with page.expect_response(lambda r:r.request.method=='PUT' and '/compose' in r.url) as response:
        d.get_by_role('button',name='Lưu chỉnh sửa và nhật ký',exact=True).click()
    assert response.value.status==200,response.value.text()
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    print('PASS UI: receive150/100 -> per-SKU pending/surplus ->125% -> receive extra after completion130% -> original quantities/stock unchanged -> CSV -> metadata edit -> mobile.')
    b.close()
