"""Synthetic _test: missing size + old lot -> acknowledged physical receipt -> report."""
import base64
from playwright.sync_api import sync_playwright,expect
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(locale='vi-VN',viewport={'width':1600,'height':1000});page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:5175',wait_until='networkidle');page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click();expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development'];h={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 def post(path,body):
  r=page.request.post('http://localhost:5175'+path,data=body,headers=h);assert r.ok,r.text();return r.json()
 def sku(color,size):return post('/api/skus',{'sku':'MIU37','color':color,'size':size,'stock':30,'inbound':10})['id']
 v=sku('Ghi tây (Phối nâu)','M');other=sku('Đen','S')
 def order(vid,qty):return post('/api/orders',{'time':'2026-10-23T10:00:00+07:00','supplier':'PRIMITEX','delivery':'2026-10-25','requestedBy':'Synthetic','notes':'SYNTHETIC ONLY','status':'Đang sản xuất','items':[{'variantId':vid,'qty':qty,'priority':'THƯỜNG'}]})
 a=order(v,150);o=order(other,100)
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click();page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click()
 dashboard=page.locator('.receiving-dashboard');expect(dashboard.get_by_role('heading',name='Báo cáo nhanh hàng về',exact=True)).to_be_visible()
 page.get_by_label('Ảnh phiếu kiểm kho',exact=True).set_input_files({'name':'synthetic-unmatched.png','mimeType':'image/png','buffer':png});page.get_by_role('button',name='Tạo phiếu từ ảnh (1)',exact=True).click();expect(page.get_by_text('Đã tạo phiếu. Xem ảnh',exact=False)).to_be_visible()
 page.get_by_label('Ngày nhận hàng',exact=True).fill('2026-10-28');page.get_by_label('Nhà xưởng trả hàng',exact=True).fill('PRIMITEX')
 page.get_by_role('button',name='Thêm bao',exact=True).click();page.get_by_label('Mã bao 1 dòng 1',exact=True).select_option('MIU37');page.get_by_label('Màu bao 1 dòng 1',exact=True).select_option('Ghi tây (Phối nâu)')
 for size in ['S','M','L','XL']:expect(page.get_by_label(size+' bao 1 dòng 1',exact=True)).to_be_enabled()
 page.get_by_label('M bao 1 dòng 1',exact=True).fill('204');page.get_by_label('XL bao 1 dòng 1',exact=True).fill('54')
 page.get_by_role('button',name='Thêm mã / màu vào bao 1',exact=True).click();page.get_by_label('Mã bao 1 dòng 2',exact=True).select_option('__custom__');page.get_by_label('Mã nhập tay bao 1 dòng 2',exact=True).fill('OLD99');page.get_by_label('Màu bao 1 dòng 2',exact=True).select_option('__custom__');page.get_by_label('Màu nhập tay bao 1 dòng 2',exact=True).fill('Màu lô cũ');page.get_by_label('S bao 1 dòng 2',exact=True).fill('10');page.get_by_label('Cách nhận bao 1 dòng 2',exact=True).select_option('unmatched')
 with page.expect_response(lambda r:r.url.endswith('/allocate')) as plan:page.get_by_role('button',name='Tự động cộng dồn — xem phân bổ',exact=True).click()
 assert plan.value.status==200,plan.value.text();r=plan.value.json();assert r['allocated']==150 and r['remaining']==118
 expect(page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True)).to_be_disabled()
 page.get_by_label('Đồng ý lưu hàng chưa đối chiếu lệnh',exact=True).check();page.get_by_text('Tôi đã kiểm tra ảnh, số lượng và phân bổ',exact=False).click()
 with page.expect_response(lambda r:r.url.endswith('/confirm')) as saved:page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True).click()
 assert saved.value.status==200,saved.value.text();result=saved.value.json();assert result['received']==268 and result['matchedReceived']==150 and result['unmatchedReceived']==118
 def kpi(label,value):expect(dashboard.locator('.receiving-kpis > div').filter(has=page.get_by_text(label,exact=True)).locator('strong')).to_have_text(value)
 kpi('Tổng thực nhận','268');kpi('Đã đối chiếu lệnh','150');kpi('Chưa đối chiếu lệnh','118');kpi('Còn thiếu hiện tại','100')
 actual=page.request.get('http://localhost:5175/api/orders').json();assert next(x for x in actual if x['id']==a['id'])['items'][0]['received']==150;assert next(x for x in actual if x['id']==o['id'])['items'][0]['received']==0
 skus=page.request.get('http://localhost:5175/api/skus').json();assert len(skus)==2 and all(s['stock']==30 and s['inbound']==10 for s in skus)
 dashboard.locator('.receiving-product summary').filter(has_text='MIU37').click();expect(dashboard.get_by_role('img',name='Tổng 268 sản phẩm nhận theo mã',exact=True)).to_be_visible();page.screenshot(path='/tmp/comsflow-unmatched-dashboard.png',full_page=True)
 page.get_by_label('Phân loại hàng về',exact=True).select_option('unmatched');page.get_by_label('Size báo cáo',exact=True).select_option('XL');page.get_by_role('button',name='Áp dụng báo cáo',exact=True).click();kpi('Tổng thực nhận','54');kpi('Đã đối chiếu lệnh','0')
 link=page.get_by_role('link',name='Xuất CSV hàng về',exact=True);csv=page.request.get('http://localhost:5175'+link.get_attribute('href')).text();assert 'Chưa đối chiếu lệnh' in csv and '"XL"' in csv and '"M"' not in csv
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/comsflow-unmatched-mobile.png',full_page=True)
 assert not errors,errors
 print('PASS unmatched UI: all4 sizes open ->204M +54XL +10 old-code S ->preview150matched/118unknown ->ack ->atomic268 receipt ->no invented SKU/order/stock ->dashboard/donut/debt ->classification+size filters/CSV ->mobile.')
 b.close()
