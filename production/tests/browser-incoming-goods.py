"""Synthetic _test only: image-assisted manual input and actual FIFO receipt API."""
import base64
from playwright.sync_api import sync_playwright,expect
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(locale='vi-VN',viewport={'width':1600,'height':1000});page.set_default_timeout(10000)
 errors=[];external=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:external.append(r.url) if ('openai.com' in r.url or 'googleapis.com' in r.url) else None)
 page.goto('http://localhost:5175',wait_until='networkidle');page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click();expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development'];headers={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 def post(path,body):
  r=page.request.post('http://localhost:5175'+path,data=body,headers=headers);assert r.ok,r.text();return r.json()
 def sku(code,color,size):return post('/api/skus',{'sku':code,'color':color,'size':size,'stock':30,'inbound':10})['id']
 v=sku('MIU37','Ghi tây (Phối nâu)','M');other=sku('MIU37','Đen','M');v66=sku('MIU66','Trắng (Phối đỏ)','S');sku('SYNTHETIC-NOT-ORDERED','Cam','S')
 def order(vid,qty,time):return post('/api/orders',{'time':time,'supplier':'PRIMITEX','delivery':'2026-10-30','requestedBy':'Synthetic receiver','notes':'SYNTHETIC ONLY','status':'Đang sản xuất','items':[{'variantId':vid,'qty':qty,'priority':'THƯỜNG'}]})
 a=order(v,150,'2026-10-23T10:00:00+07:00');bb=order(v,200,'2026-10-24T10:00:00+07:00');c=order(other,100,'2026-10-22T10:00:00+07:00');order(v66,100,'2026-10-22T10:00:00+07:00')
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click();page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click()
 expect(page.get_by_role('button',name='Đọc ảnh & tạo bảng',exact=True)).to_have_count(0)
 page.get_by_label('Ảnh phiếu kiểm kho',exact=True).set_input_files({'name':'synthetic-slip.png','mimeType':'image/png','buffer':png})
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/incoming')) as created:page.get_by_role('button',name='Tạo phiếu từ ảnh (1)',exact=True).click()
 assert created.value.status==201;draft_id=created.value.json()['id']
 expect(page.get_by_text('Đã tạo phiếu. Xem ảnh',exact=False)).to_be_visible()
 page.get_by_role('button',name='Xoay ảnh 90°',exact=True).click();assert page.locator('.incoming-photo-scroll img').evaluate('(el)=>getComputedStyle(el).transform.startsWith("matrix(0, 1, -1, 0,")');page.get_by_role('button',name='Phóng to',exact=True).click();expect(page.get_by_text('125%',exact=True)).to_be_visible()
 page.get_by_role('button',name='Thêm dòng hàng',exact=True).click()
 code=page.get_by_label('Mã dòng 1',exact=True);assert code.locator('option').all_text_contents()==['Chọn mã sản phẩm','MIU37','MIU66']
 code.select_option('MIU37');color=page.get_by_label('Màu dòng 1',exact=True);assert set(color.locator('option').all_text_contents())=={'Chọn màu của mã','Đen','Ghi tây (Phối nâu)'}
 color.select_option('Ghi tây (Phối nâu)');expect(page.get_by_label('Size dòng 1',exact=True)).to_have_value('M');page.get_by_label('Số nhận dòng 1',exact=True).fill('300')
 expect(page.get_by_label('Lệnh dòng 1',exact=True)).to_have_value('auto')
 expect(page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True)).to_be_disabled()
 with page.expect_response(lambda r:r.url.endswith('/allocate')) as plan:page.get_by_role('button',name='Tự động cộng dồn — xem phân bổ',exact=True).click()
 assert plan.value.status==200,plan.value.text();allocation=plan.value.json();assert allocation['allocated']==300 and allocation['remaining']==0 and allocation['pendingAfter']==50
 assert [(r['orderId'],r['qty'],r['pendingAfter']) for r in allocation['allocations']]==[(a['id'],150,0),(bb['id'],150,50)]
 assert all(i['received']==0 for o in page.request.get('http://localhost:5175/api/orders').json() for i in o['items'])
 page.screenshot(path='/tmp/comsflow-fifo-preview.png',full_page=True)
 page.get_by_role('button',name='Lưu nháp',exact=True).click();expect(page.get_by_text('Đã lưu nháp.',exact=False)).to_be_visible();expect(page.get_by_text('Phân bổ dự kiến — chưa ghi nhận',exact=True)).to_have_count(0)
 page.reload(wait_until='networkidle');page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click();page.get_by_role('button',name='Mở phiếu',exact=True).click();expect(page.get_by_label('Số nhận dòng 1',exact=True)).to_have_value('300')
 page.get_by_role('button',name='Tự động cộng dồn — xem phân bổ',exact=True).click();expect(page.get_by_text('Đã tính phân bổ dự kiến.',exact=False)).to_be_visible()
 page.get_by_text('Tôi đã kiểm tra ảnh, số lượng và phân bổ',exact=False).click()
 with page.expect_response(lambda r:r.url.endswith('/confirm')) as confirmed:page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True).click()
 assert confirmed.value.status==200,confirmed.value.text();assert confirmed.value.json()['received']==300
 actual=page.request.get('http://localhost:5175/api/orders').json();byid={o['id']:o for o in actual};assert byid[a['id']]['items'][0]['received']==150 and byid[bb['id']]['items'][0]['received']==150 and byid[c['id']]['items'][0]['received']==0
 assert all(v['stock']==30 and v['inbound']==10 for v in page.request.get('http://localhost:5175/api/skus').json())
 page.get_by_role('button',name=a['code']+' · 150 sản phẩm · Xem lệnh',exact=True).click();d=page.get_by_role('dialog');expect(d.get_by_text('LỆNH SẢN XUẤT · '+a['code'],exact=True)).to_be_visible();expect(d.get_by_role('link',name='synthetic-slip.png · Mở ảnh gốc',exact=True)).to_be_visible();d.get_by_role('button',name='Đóng',exact=True).click()
 page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click();page.get_by_role('button',name='Nhập bảng không kèm ảnh',exact=True).click();page.get_by_role('button',name='Thêm dòng hàng',exact=True).click();page.get_by_label('Mã dòng 1',exact=True).select_option('MIU66');assert page.get_by_label('Màu dòng 1',exact=True).locator('option').all_text_contents()==['Chọn màu của mã','Trắng (Phối đỏ)']
 page.get_by_label('Mã dòng 1',exact=True).select_option('MIU37');page.get_by_label('Màu dòng 1',exact=True).select_option('Ghi tây (Phối nâu)');page.get_by_label('Số nhận dòng 1',exact=True).fill('100')
 with page.expect_response(lambda r:r.url.endswith('/allocate')) as excess:page.get_by_role('button',name='Tự động cộng dồn — xem phân bổ',exact=True).click()
 assert excess.value.json()['remaining']==50;expect(page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True)).to_be_disabled()
 page.get_by_label('Lệnh nhận dư dòng 1',exact=True).select_option(bb['id'])
 with page.expect_response(lambda r:r.url.endswith('/allocate')) as complete:page.get_by_role('button',name='Tự động cộng dồn — xem phân bổ',exact=True).click()
 assert complete.value.json()['remaining']==0 and complete.value.json()['excess']==50
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/comsflow-fifo-mobile.png',full_page=True)
 assert not errors,errors;assert not external,external
 print('PASS manual photo/FIFO UI: order-only code/colour choices -> photo rotate/zoom ->300 split150+150 -> preview only -> save/reload -> atomic receipts -> other colour untouched -> stock unchanged -> source/order link -> colour dependency -> excess50 requires target -> mobile. No external AI.')
 b.close()
