"""Synthetic _test + serve-incoming-smoke.ts only. No real provider or company data."""
import base64
from playwright.sync_api import sync_playwright,expect
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(locale='vi-VN',viewport={'width':1600,'height':1000});page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:5175',wait_until='networkidle')
 page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click();expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development']
 headers={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 def post(path,body):
  r=page.request.post('http://localhost:5175'+path,data=body,headers=headers);assert r.ok,r.text();return r.json()
 def sku(code,color):return post('/api/skus',{'sku':code,'color':color,'size':'S','stock':30,'inbound':10})['id']
 a=sku('MIU37','Cam cháy (phối đen)');c=sku('MIU66','Cam cháy (phối đen)');sku('MIU66','Cam nhạt')
 def order(vid):return post('/api/orders',{'time':'2026-10-26T10:00:00+07:00','supplier':'Synthetic factory','delivery':'2026-10-28','requestedBy':'Synthetic receiver','notes':'SYNTHETIC ONLY','status':'Đang sản xuất','items':[{'variantId':vid,'qty':100,'priority':'THƯỜNG'}]})
 oa=order(a);ob=order(a);oc=order(c)
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click();page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click()
 page.get_by_label('Ảnh phiếu kiểm kho',exact=True).set_input_files({'name':'synthetic-slip.png','mimeType':'image/png','buffer':png})
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/incoming')) as created:page.get_by_role('button',name='Tạo phiếu từ ảnh (1)',exact=True).click()
 assert created.value.status==201;draft_id=created.value.json()['id']
 expect(page.get_by_text('Đã tạo phiếu nháp.',exact=False)).to_be_visible()
 read=page.get_by_role('button',name='Đọc ảnh & tạo bảng',exact=True);expect(read).to_be_disabled()
 page.get_by_text('Tôi đồng ý gửi ảnh phiếu này',exact=False).click()
 with page.expect_response(lambda r:r.url.endswith('/read')) as extracted:read.click()
 assert extracted.value.status==200,extracted.value.text()
 page.get_by_role('button',name='Ẩn ảnh để mở rộng bảng',exact=True).click();expect(page.locator('.incoming-images')).to_be_hidden();page.get_by_role('button',name='Hiện ảnh để đối chiếu',exact=True).click();expect(page.locator('.incoming-images')).to_be_visible()
 expect(page.get_by_label('Màu danh mục dòng 1',exact=True)).to_have_value(a)
 expect(page.get_by_label('Lệnh dòng 1',exact=True)).to_have_value('')
 expect(page.get_by_label('Màu danh mục dòng 5',exact=True)).to_have_value('')
 expect(page.get_by_label('Số nhận dòng 2',exact=True)).to_have_value('')
 expect(page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True)).to_be_disabled()
 page.get_by_label('Số nhận dòng 2',exact=True).fill('0')
 page.get_by_label('Lệnh dòng 1',exact=True).select_option(oa['id'])
 page.get_by_label('Số nhận dòng 1',exact=True).fill('100')
 page.locator('.incoming-table tbody tr').nth(0).get_by_role('button',name='Tách dòng',exact=True).click()
 page.get_by_label('Số nhận dòng 9',exact=True).fill('50');page.get_by_label('Lệnh dòng 9',exact=True).select_option(ob['id'])
 page.get_by_label('Màu danh mục dòng 5',exact=True).select_option(c)
 expect(page.get_by_label('Lệnh dòng 5',exact=True)).to_have_value(oc['id']);page.get_by_label('Ghi nhớ dòng 5',exact=True).check()
 with page.expect_response(lambda r:r.request.method=='PUT' and r.url.endswith('/api/incoming/'+draft_id)) as saved:page.get_by_role('button',name='Lưu nháp',exact=True).click()
 assert saved.value.status==200
 page.screenshot(path='/tmp/comsflow-incoming-review.png',full_page=True)
 assert all(i['received']==0 for o in page.request.get('http://localhost:5175/api/orders').json() for i in o['items'])
 page.reload(wait_until='networkidle');page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click();page.get_by_role('button',name='Mở phiếu',exact=True).click()
 expect(page.get_by_label('Số nhận dòng 9',exact=True)).to_have_value('50')
 page.get_by_text('Tôi đã đối chiếu ảnh, mã, màu, size, ngày, số lượng',exact=False).click()
 with page.expect_response(lambda r:r.url.endswith('/confirm')) as confirmed:page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True).click()
 assert confirmed.value.status==200,confirmed.value.text();result=confirmed.value.json();assert result['received']==155 and len(result['receipts'])==3
 expect(page.get_by_text('Đã ghi nhận hàng. Phiếu và biên nhận',exact=False)).to_be_visible()
 aliases=page.request.get('http://localhost:5175/api/incoming/aliases').json();assert aliases==[{'sku':'MIU66','raw_color':'cam','color':'Cam cháy (phối đen)'}]
 photo=page.request.get('http://localhost:5175/api/incoming/'+draft_id).json()['images'][0]['id']
 source=page.request.get('http://localhost:5175/api/orders/'+oa['id']+'/incoming-images/'+photo);assert source.ok and source.body()==png
 page.get_by_role('button',name=oa['code']+' · 100 sản phẩm · Xem lệnh',exact=True).click()
 d=page.get_by_role('dialog');expect(d.get_by_text('LỆNH SẢN XUẤT · '+oa['code'],exact=True)).to_be_visible();expect(d.get_by_role('link',name='synthetic-slip.png · Mở ảnh gốc',exact=True)).to_be_visible();d.get_by_role('button',name='Đóng',exact=True).click()
 page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click()
 page.get_by_role('button',name='Nhập bảng thủ công',exact=True).click();page.get_by_role('button',name='Thêm dòng hàng',exact=True).click()
 page.get_by_label('Mã dòng 1',exact=True).fill('MIU66');page.get_by_label('Màu phiếu dòng 1',exact=True).fill('Cam');page.get_by_label('Số nhận dòng 1',exact=True).fill('2')
 page.get_by_role('button',name='Gợi ý ánh xạ lại',exact=True).click();expect(page.get_by_label('Màu danh mục dòng 1',exact=True)).to_have_value(c)
 page.get_by_role('button',name='Lưu nháp',exact=True).click();expect(page.get_by_text('Đã lưu nháp.',exact=False)).to_be_visible()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth');page.screenshot(path='/tmp/comsflow-incoming-mobile.png',full_page=True)
 page.set_viewport_size({'width':1600,'height':1000});page.screenshot(path='/tmp/comsflow-incoming-desktop.png',full_page=True)
 assert not errors,errors
 print('PASS incoming UI: image upload -> consent -> mocked OCR through backend -> ambiguity/null review -> split across 3 orders -> save/reload draft -> atomic155 receipt -> learned SKU-scoped alias -> source image/order link -> next manual draft -> mobile. No real OCR/production data.')
 b.close()
