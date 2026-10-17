"""Only synthetic _test database on serve-smoke + Vite5175. Lark read mocked locally."""
import json, subprocess, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
fixture='''
import './tests/setup.ts';
const {pool,transaction}=await import('./server/db.ts');
const {inventorySource,previewInventory}=await import('./server/lark-inventory.ts');
const {normalizeInventory}=await import('./shared/lark-inventory.ts');
if(!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw Error('Unsafe database');
const actor=(await pool.query("SELECT id,name,role FROM users WHERE open_id='developer' AND tenant_key='local-development'")).rows[0];
const {version,updatedAt,...source}=await inventorySource(pool);
if(!source.url.includes('synthetic.larksuite.com')) throw Error('Only synthetic source allowed');
const result=normalizeInventory([{record_id:'synthetic-warehouse',fields:{'Mã sản phẩm':'SYNTHETIC-FLOW','Màu':'Cam','Ngày kiểm':'2026-10-16','S':99,'M':30}}],source);
const value=await transaction(db=>previewInventory(db,actor,source,version,result,JSON.parse(process.argv[1])));
console.log(JSON.stringify(value));await pool.end();
'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(locale='vi-VN',viewport={'width':1440,'height':1000});page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:5175',wait_until='networkidle')
 page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click()
 expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development']
 headers={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 def post(path,body,extra=None):
  r=page.request.post('http://localhost:5175'+path,data=body,headers={**headers,**(extra or {})});assert r.ok,r.text();return r.json()
 m=post('/api/skus',{'sku':'SYNTHETIC-FLOW','color':'Cam','size':'M','stock':None,'inbound':999,'day1':20,'day2':20,'health':'Tăng trưởng'})['id']
 s=post('/api/skus',{'sku':'SYNTHETIC-FLOW','color':'Cam','size':'S','stock':25,'inbound':77,'day1':5,'day2':5,'health':'Tăng trưởng'})['id']
 o=post('/api/orders',{'time':'2026-10-17T10:00:00+07:00','supplier':'SYNTHETIC Factory','delivery':'2026-10-20','requestedBy':'Synthetic Planner','notes':'Synthetic only','status':'Đã xác nhận','items':[{'variantId':m,'qty':30,'priority':'THƯỜNG'}]})
 post('/api/orders/'+o['id']+'/receipts',{'expectedVersion':o['version'],'date':'2026-10-17','note':'Synthetic receipt','lines':[{'itemId':o['items'][0]['id'],'qty':10}]},{'Idempotency-Key':str(uuid.uuid4())})
 post('/api/orders',{'time':'2026-10-17T10:00:00+07:00','supplier':'SYNTHETIC Draft','delivery':None,'requestedBy':'Synthetic Planner','notes':'Do not count draft by default','status':'Nháp','items':[{'variantId':m,'qty':100,'priority':'THƯỜNG'}]})
 source={'url':'https://synthetic.larksuite.com/wiki/SyntheticNode123?table=tblSynthetic&view=vewSynthetic','mapping':{'sku':'Mã sản phẩm','color':'Màu','date':'Ngày kiểm','sizes':{'XS':'','S':'S','M':'M','L':'','XL':'','2XL':''}},'blankAsZero':True,'createMissing':False}
 post('/api/lark/inventory/source',{'source':source,'version':0})
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click()
 page.get_by_role('button',name='Dự kiến sản xuất',exact=True).click()
 quick=page.get_by_role('button',name='Lên lệnh nhanh SYNTHETIC-FLOW Cam M',exact=True)
 expect(quick).to_be_disabled()
 page.get_by_label('Chọn SYNTHETIC-FLOW Cam M',exact=True).check()
 def mock_read(route):
  ids=route.request.post_data_json['ids'];assert ids==[m]
  value=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',fixture,json.dumps(ids)],cwd=root,text=True))
  assert len(value['rows'])==1 and value['rows'][0]['stock']==30
  route.fulfill(json=value)
 page.route('**/api/lark/inventory/preview',mock_read)
 page.get_by_role('button',name='Cập nhật tồn từ Lark',exact=True).click()
 d=page.get_by_role('dialog');expect(d.get_by_role('cell',name='30',exact=True)).to_be_visible()
 assert next(v for v in page.request.get('http://localhost:5175/api/skus').json() if v['id']==m)['stock'] is None
 with page.expect_response(lambda r:r.url.endswith('/confirm') and r.request.method=='POST') as confirmed:d.get_by_role('button',name='Xác nhận cập nhật tồn kho',exact=True).click()
 assert confirmed.value.status==200;d.wait_for(state='hidden')
 values=page.request.get('http://localhost:5175/api/skus').json();assert next(v for v in values if v['id']==m)['stock']==30;assert next(v for v in values if v['id']==s)['stock']==25
 page.get_by_role('button',name='Đối soát hàng đang về',exact=True).click()
 d=page.get_by_role('dialog');expect(d.get_by_text('30 − 10 =',exact=False)).to_be_visible()
 expect(d.get_by_role('cell',name='20',exact=True)).to_be_visible()
 d.get_by_label('Tính cả lệnh nháp',exact=False).check()
 expect(d.get_by_role('button',name='Cập nhật hàng đang về',exact=True)).to_be_disabled()
 d.get_by_label('Tính cả lệnh nháp',exact=False).uncheck()
 d.get_by_role('button',name='Đối soát lại',exact=True).click()
 expect(d.get_by_role('button',name='Cập nhật hàng đang về',exact=True)).to_be_enabled()
 with page.expect_response(lambda r:'/inbound/' in r.url and r.url.endswith('/confirm')) as confirmed:d.get_by_role('button',name='Cập nhật hàng đang về',exact=True).click()
 assert confirmed.value.status==200;d.wait_for(state='hidden')
 values=page.request.get('http://localhost:5175/api/skus').json();mrow=next(v for v in values if v['id']==m);assert mrow['inbound']==20 and mrow['stock']==30 and mrow['health']=='Tăng trưởng'
 assert next(v for v in values if v['id']==s)['inbound']==77
 expect(quick).to_be_enabled()
 before=len(page.request.get('http://localhost:5175/api/orders').json())
 quick.click();d=page.get_by_role('dialog')
 expect(d.get_by_label('SYNTHETIC-FLOW Cam M',exact=True)).to_have_value('50')
 assert len(page.request.get('http://localhost:5175/api/orders').json())==before,'Quick order opens draft; must not silently save/send'
 d.get_by_label('Nhà xưởng',exact=True).fill('SYNTHETIC Quick Factory')
 d.get_by_label('Ngày yêu cầu giao',exact=True).fill('2026-10-20')
 with page.expect_response(lambda r:r.url.endswith('/api/orders/compose') and r.request.method=='POST') as saved:d.get_by_role('button',name='Lưu lệnh vào lịch sử',exact=True).click()
 assert saved.value.status==201,saved.value.text();assert saved.value.json()['items'][0]['qty']==50;assert saved.value.json()['status']=='Nháp';d.wait_for(state='hidden')
 page.get_by_role('button',name='Dự kiến sản xuất',exact=True).click()
 page.screenshot(path='/tmp/comsflow-planning-flow-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});expect(page.locator('aside')).to_have_css('transform','matrix(1, 0, 0, 1, -250, 0)')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/comsflow-planning-flow-mobile.png',full_page=True)
 assert not errors,errors
 print('PASS planning: scoped Lark preview -> real stock confirm, preserves other size -> receipt 30-10 -> inbound 20 excludes draft -> versioned confirm -> 20*5-30-20=50 -> quick draft -> explicit real save -> desktop/mobile without JS errors. Synthetic only.')
 b.close()
