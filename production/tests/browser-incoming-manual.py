"""Synthetic _test API only. Confirm incoming goods without any OCR configuration."""
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(locale='vi-VN',viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:5175',wait_until='networkidle');page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click();expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development']
 assert page.request.get('http://localhost:5175/api/incoming/status').json()['configured'] is False
 h={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 def post(path,body):
  r=page.request.post('http://localhost:5175'+path,data=body,headers=h);assert r.ok,r.text();return r.json()
 v=post('/api/skus',{'sku':'SYNTHETIC-MANUAL-RECEIPT','color':'Đen','size':'S','stock':30,'inbound':10})['id']
 o=post('/api/orders',{'time':'2026-10-26T10:00:00+07:00','supplier':'Synthetic factory','delivery':'2026-10-28','requestedBy':'Synthetic receiver','notes':'SYNTHETIC ONLY','status':'Đang sản xuất','items':[{'variantId':v,'qty':100,'priority':'THƯỜNG'}]})
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click();page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click();expect(page.get_by_text('Chưa cấu hình dịch vụ đọc ảnh.',exact=False)).to_be_visible()
 page.get_by_role('button',name='Nhập bảng thủ công',exact=True).click();page.get_by_role('button',name='Thêm dòng hàng',exact=True).click()
 page.get_by_label('Mã dòng 1',exact=True).fill('SYNTHETIC-MANUAL-RECEIPT');page.get_by_label('Màu phiếu dòng 1',exact=True).fill('Đen');page.get_by_label('Số nhận dòng 1',exact=True).fill('125');page.get_by_role('button',name='Gợi ý ánh xạ lại',exact=True).click()
 expect(page.get_by_label('Màu danh mục dòng 1',exact=True)).to_have_value(v);expect(page.get_by_label('Lệnh dòng 1',exact=True)).to_have_value(o['id'])
 page.get_by_text('Tôi đã đối chiếu ảnh, mã, màu, size, ngày, số lượng',exact=False).click()
 with page.expect_response(lambda r:r.url.endswith('/confirm')) as saved:page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True).click()
 assert saved.value.status==200,saved.value.text();assert saved.value.json()['received']==125
 item=next(x for x in page.request.get('http://localhost:5175/api/orders').json() if x['id']==o['id'])['items'][0];assert item['qty']==100 and item['received']==125
 assert not errors,errors
 print('PASS no OCR key: explicit configuration notice -> manual entry -> exact Đen matching -> automatic unique order -> real125 receipt above order100 -> no external service.')
 b.close()
