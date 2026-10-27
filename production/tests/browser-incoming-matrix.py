"""Isolated _test only: legacy bag rows -> editable size matrix -> real receipts."""
import uuid
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(locale='vi-VN',viewport={'width':1600,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:5175',wait_until='networkidle');page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click();expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development'];h={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 def post(path,body):
  r=page.request.post('http://localhost:5175'+path,data=body,headers=h);assert r.ok,r.text();return r.json()
 variants={};legacy=[];orders=[]
 for code,color,sizes,qtys,bag in [('MIU37','Cam cháy (phối đen)',['S'],[125],'14'),('MIU15','Xám tiêu đậm',['S','M','L','XL'],[3,1,2,4],'14'),('MIU01','Xanh Tiffany',['M'],[224],'15'),('MIU01','Trắng',['M','L'],[7,5],'15')]:
  items=[]
  for size,qty in zip(sizes,qtys):
   vid=post('/api/skus',{'sku':code,'color':color,'size':size,'stock':30,'inbound':10})['id'];variants[(code,color,size)]=vid
   items.append({'variantId':vid,'qty':300,'priority':'THƯỜNG'})
   legacy.append({'id':str(uuid.uuid4()),'sku':code,'color':color,'bag':bag,'size':size,'qty':qty,'variantId':vid,'orderId':None,'remember':False,'allocationMode':'auto','excessOrderId':None})
  orders.append(post('/api/orders',{'time':'2026-10-27T10:00:00+07:00','supplier':'Synthetic matrix factory','delivery':'2026-10-30','requestedBy':'Synthetic receiver','notes':'SYNTHETIC ONLY','status':'Đang sản xuất','items':items}))
 draft=post('/api/incoming',{'images':[]})['id'];r=page.request.put('http://localhost:5175/api/incoming/'+draft,data={'expectedVersion':1,'form':{'date':'2026-10-27','note':'Legacy flat rows','rows':legacy}},headers=h);assert r.ok,r.text()
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click();page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click();page.get_by_role('button',name='Mở phiếu',exact=True).click()
 expect(page.locator('.incoming-bag-header')).to_have_count(2);expect(page.locator('.incoming-matrix-line')).to_have_count(4)
 assert page.locator('.incoming-matrix thead th').all_text_contents()==['Mã trên phiếu','Màu trên phiếu','S','M','L','XL','Tổng','Lệnh nhận','Thao tác']
 for size,qty in [('S','3'),('M','1'),('L','2'),('XL','4')]:expect(page.get_by_label(size+' bao 14 dòng 2',exact=True)).to_have_value(qty)
 expect(page.get_by_label('M bao 15 dòng 1',exact=True)).to_have_value('224');expect(page.get_by_label('L bao 15 dòng 2',exact=True)).to_have_value('5')
 page.get_by_label('Số bao nhóm 1',exact=True).fill('1');expect(page.get_by_label('M bao 1 dòng 2',exact=True)).to_have_value('1')
 page.get_by_role('button',name='Thêm bao',exact=True).click();page.get_by_label('Số bao nhóm 3',exact=True).fill('20')
 page.get_by_label('Mã bao 20 dòng 1',exact=True).select_option('MIU15');page.get_by_label('Màu bao 20 dòng 1',exact=True).select_option('Xám tiêu đậm');page.get_by_label('S bao 20 dòng 1',exact=True).fill('5');page.get_by_label('M bao 20 dòng 1',exact=True).fill('6')
 page.locator('.incoming-matrix-line').last.get_by_role('button',name='Thêm màu cùng mã',exact=True).click();expect(page.get_by_label('Mã bao 20 dòng 2',exact=True)).to_have_value('MIU15');page.get_by_label('Màu bao 20 dòng 2',exact=True).select_option('Xám tiêu đậm');page.get_by_label('S bao 20 dòng 2',exact=True).fill('9')
 expect(page.locator('.incoming-bag-header')).to_have_count(3);expect(page.locator('.incoming-matrix-line')).to_have_count(6)
 with page.expect_response(lambda r:r.request.method=='PUT' and r.url.endswith('/api/incoming/'+draft)) as saved:page.get_by_role('button',name='Lưu nháp',exact=True).click()
 assert saved.value.status==200,saved.value.text()
 stored=page.request.get('http://localhost:5175/api/incoming/'+draft).json()['form']['rows'];assert len(stored)==16 and sum(r['qty'] or 0 for r in stored)==391
 assert {r['id'] for r in legacy}.issubset({r['id'] for r in stored});assert all(r.get('bagGroupId') and r.get('lineGroupId') for r in stored)
 assert {r['bag'] for r in stored if r['id'] in {x['id'] for x in legacy[:5]}}=={'1'}
 page.reload(wait_until='networkidle');page.get_by_role('button',name='Nhập liệu hàng về',exact=True).click();page.get_by_role('button',name='Mở phiếu',exact=True).click();expect(page.locator('.incoming-matrix-line')).to_have_count(6)
 expect(page.get_by_label('S bao 20 dòng 1',exact=True)).to_have_value('5');expect(page.get_by_label('S bao 20 dòng 2',exact=True)).to_have_value('9')
 page.screenshot(path='/tmp/comsflow-bag-size-matrix.png',full_page=True)
 with page.expect_response(lambda r:r.url.endswith('/allocate')) as plan:page.get_by_role('button',name='Tự động cộng dồn — xem phân bổ',exact=True).click()
 assert plan.value.status==200,plan.value.text();assert plan.value.json()['allocated']==391 and plan.value.json()['remaining']==0
 page.get_by_text('Tôi đã kiểm tra ảnh, số lượng và phân bổ',exact=False).click()
 with page.expect_response(lambda r:r.url.endswith('/confirm')) as received:page.get_by_role('button',name='Xác nhận ghi nhận hàng',exact=True).click()
 assert received.value.status==200,received.value.text();assert received.value.json()['received']==391
 actual=page.request.get('http://localhost:5175/api/orders').json();lines=[i for o in actual for i in o['items']];assert sum(i['received'] for i in lines)==391
 assert next(i for i in lines if i['variantId']==variants[('MIU15','Xám tiêu đậm','S')])['received']==17
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/comsflow-bag-size-mobile.png',full_page=True)
 assert not errors,errors
 print('PASS bag matrix: legacy8 SKU rows ->2 bags/4 colour lines ->4 fixed size columns ->rename bag once ->new bag inherits number ->same-colour duplicate lines kept ->save/reload16 backing rows ->atomic391 receipt ->mobile.')
 b.close()
