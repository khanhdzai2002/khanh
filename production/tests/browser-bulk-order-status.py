"""Synthetic _test only: real bulk API, conflict rollback and priority colours."""
import uuid
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(locale='vi-VN',viewport={'width':1440,'height':1000});page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:5175',wait_until='networkidle');page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click();expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development'];headers={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 def post(path,body,extra=None):
  r=page.request.post('http://localhost:5175'+path,data=body,headers={**headers,**(extra or {})});assert r.ok,r.text();return r.json()
 def order(priority):
  vid=post('/api/skus',{'sku':'SYNTHETIC-'+priority,'color':'Cam','size':'M'})['id']
  return post('/api/orders',{'time':'2026-10-24T10:00:00+07:00','supplier':'Synthetic factory','delivery':'2026-10-28','requestedBy':'Synthetic planner','notes':'Synthetic batch test','status':'Nháp','items':[{'variantId':vid,'qty':100,'priority':priority}]})
 a=order('THƯỜNG');bb=order('ƯU TIÊN');c=order('CẤP BÁCH')
 post('/api/orders/'+c['id']+'/receipts',{'expectedVersion':c['version'],'date':'2026-10-24','note':'Synthetic received full','lines':[{'itemId':c['items'][0]['id'],'qty':100}]},{'Idempotency-Key':str(uuid.uuid4())})
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click();page.get_by_role('button',name='Gối lệnh sản xuất',exact=True).click()
 expect(page.get_by_label('Chọn lệnh '+c['code'],exact=True)).to_be_disabled()
 for label,colour in [('THƯỜNG','rgb(71, 85, 105)'),('ƯU TIÊN','rgb(154, 52, 18)'),('CẤP BÁCH','rgb(185, 28, 28)')]:expect(page.locator('.priority-legend .priority-badge').filter(has_text=label)).to_have_css('color',colour)
 page.get_by_label('Chọn các lệnh hợp lệ đang xem',exact=True).check()
 page.get_by_role('button',name='Đổi trạng thái hàng loạt',exact=True).click();d=page.get_by_role('dialog')
 expect(d.get_by_role('button',name='Xác nhận đổi trạng thái',exact=True)).to_be_disabled()
 d.get_by_label('Trạng thái nội bộ mới',exact=True).select_option('Đang sản xuất');d.get_by_label('Lý do đổi trạng thái hàng loạt',exact=True).fill('Synthetic factory started production')
 with page.expect_response(lambda r:r.url.endswith('/api/orders/bulk-status')) as changed:d.get_by_role('button',name='Xác nhận đổi trạng thái',exact=True).click()
 assert changed.value.status==200 and changed.value.json()['changed']==2;d.wait_for(state='hidden')
 orders=page.request.get('http://localhost:5175/api/orders').json();assert next(o for o in orders if o['id']==a['id'])['status']=='Đang sản xuất';assert next(o for o in orders if o['id']==c['id'])['status']=='Nháp'
 for o in [a,bb]:
  h=page.request.get('http://localhost:5175/api/orders/'+o['id']+'/history').json();assert any(r['reason']=='Synthetic factory started production' for r in h['revisions'])
 # Opening snapshots versions; another update then forces an atomic conflict.
 page.get_by_label('Chọn các lệnh hợp lệ đang xem',exact=True).check();page.get_by_role('button',name='Đổi trạng thái hàng loạt',exact=True).click();d=page.get_by_role('dialog')
 d.get_by_label('Trạng thái nội bộ mới',exact=True).select_option('Tạm dừng');d.get_by_label('Lý do đổi trạng thái hàng loạt',exact=True).fill('Synthetic pause')
 fresh=next(o for o in orders if o['id']==a['id']);post('/api/orders/bulk-status',{'orders':[{'id':a['id'],'expectedVersion':fresh['version']}],'status':'Đã xác nhận','reason':'Synthetic concurrent update'})
 with page.expect_response(lambda r:r.url.endswith('/api/orders/bulk-status')) as conflict:d.get_by_role('button',name='Xác nhận đổi trạng thái',exact=True).click()
 assert conflict.value.status==409;expect(d.get_by_role('alert')).to_contain_text('đã thay đổi')
 after=page.request.get('http://localhost:5175/api/orders').json();assert next(o for o in after if o['id']==bb['id'])['status']=='Đang sản xuất'
 d.get_by_role('button',name='Đóng',exact=True).click()
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click()
 row=page.get_by_role('row').filter(has=page.get_by_role('cell',name=bb['code'],exact=True))
 row.get_by_title('Chỉnh sửa lệnh',exact=True).click();d=page.get_by_role('dialog')
 priority=d.get_by_label('Ưu tiên SYNTHETIC-ƯU TIÊN Cam',exact=True);expect(priority).to_have_css('color','rgb(154, 52, 18)')
 priority.select_option('CẤP BÁCH');expect(priority).to_have_css('color','rgb(185, 28, 28)')
 priority.select_option('THƯỜNG');expect(priority).to_have_css('color','rgb(71, 85, 105)')
 d.get_by_role('button',name='Đóng, không lưu',exact=True).click()
 completed=page.get_by_role('row').filter(has=page.get_by_role('cell',name=c['code'],exact=True))
 completed.get_by_role('button',name='Chi tiết',exact=True).click();d=page.get_by_role('dialog');expect(d.locator('.priority-badge')).to_have_css('color','rgb(185, 28, 28)');d.get_by_role('button',name='Đóng',exact=True).click()
 page.screenshot(path='/tmp/comsflow-bulk-status-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});expect(page.locator('aside')).to_have_css('transform','matrix(1, 0, 0, 1, -250, 0)');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/comsflow-bulk-status-mobile.png',full_page=True)
 assert not errors,errors
 print('PASS bulk: select eligible only -> reason required -> real 2-order batch + revisions -> stale snapshot409/no partial write -> coloured list/priority select changes -> desktop/mobile. Synthetic only.')
 b.close()
