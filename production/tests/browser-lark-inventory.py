"""Only serve-smoke _test + Vite5175. Lark reads synthetic; save/confirm/Postgres real."""
import json, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root = Path(__file__).resolve().parents[1]
fixture = '''
import './tests/setup.ts';
const {pool,transaction}=await import('./server/db.ts');
const {inventorySource,previewInventory}=await import('./server/lark-inventory.ts');
const {normalizeInventory}=await import('./shared/lark-inventory.ts');
if(!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw Error('Unsafe database');
const actor=(await pool.query("SELECT id,name,role FROM users WHERE open_id='developer' AND tenant_key='local-development'")).rows[0];
const {version,updatedAt,...source}=await inventorySource(pool);
if(!source.url.includes('synthetic.larksuite.com')) throw Error('Only synthetic source allowed');
const result=normalizeInventory([{record_id:'synthetic-record',fields:{'Mã sản phẩm':'SYNTHETIC-UI','Màu':'Cam','Ngày kiểm':'2026-10-16','S':11,'M':12}}],source);
const value=await transaction(db=>previewInventory(db,actor,source,version,result));
console.log(JSON.stringify(value));await pool.end();
'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(locale='vi-VN',viewport={'width':1440,'height':1000});page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:5175',wait_until='networkidle')
    page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click()
    page.get_by_role('button',name='Cấu hình & dữ liệu',exact=True).click()
    page.get_by_role('button',name='Tồn kho Lark Base',exact=True).click()
    preview_button=page.get_by_role('button',name='Đọc tồn & xem trước',exact=True)
    expect(preview_button).to_be_disabled()
    page.get_by_label('Link bảng tồn kho (có table và view)',exact=True).fill('https://synthetic.larksuite.com/wiki/SyntheticNode123?table=tblSynthetic&view=vewSynthetic')
    page.route('**/api/lark/inventory/fields',lambda route:route.fulfill(json={'fields':[{'name':n,'type':1} for n in ['Mã sản phẩm','Màu','Ngày kiểm','S','M','L','XL']]}))
    page.get_by_role('button',name='Đọc danh sách cột',exact=True).click()
    expect(page.get_by_label('Tồn size XL',exact=True)).to_have_value('XL')
    expect(page.get_by_label('Ô size để trống',exact=True)).to_have_value('zero')
    page.get_by_label('SKU chưa có trong danh mục',exact=True).select_option('create')
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/inventory/source')) as saved:
        page.get_by_role('button',name='Lưu cấu hình nguồn',exact=True).click()
    assert saved.value.status==200,saved.value.text()
    expect(preview_button).to_be_enabled()
    def mock_read(route):
        output=subprocess.check_output(['node','--import','tsx','--input-type=module','-e',fixture],cwd=root,text=True)
        value=json.loads(output)
        assert value['count']==4 and value['errors']==[],value
        route.fulfill(json=value)
    page.route('**/api/lark/inventory/preview',mock_read)
    preview_button.click()
    d=page.get_by_role('dialog')
    expect(d.get_by_role('heading',name='Kiểm tra tồn kho từ Lark',exact=True)).to_be_visible()
    assert page.request.get('http://localhost:5175/api/skus').json()==[], 'Preview must not create SKUs'
    expect(d.get_by_text('Tạo SKU',exact=True)).to_have_count(4)
    with page.expect_response(lambda r:r.request.method=='POST' and '/inventory/' in r.url and r.url.endswith('/confirm')) as confirmed:
        d.get_by_role('button',name='Xác nhận cập nhật 4 SKU',exact=True).click()
    assert confirmed.value.status==200,confirmed.value.text()
    d.wait_for(state='hidden')
    skus=page.request.get('http://localhost:5175/api/skus').json()
    assert len(skus)==4 and sum(v['stock'] for v in skus)==23
    assert all(v['health']=='Mở bán' and v['inbound']==0 for v in skus)
    page.reload(wait_until='networkidle')
    page.get_by_role('button',name='Cấu hình & dữ liệu',exact=True).click()
    page.get_by_role('button',name='Tồn kho Lark Base',exact=True).click()
    expect(page.get_by_label('Link bảng tồn kho (có table và view)',exact=True)).to_have_value('https://synthetic.larksuite.com/wiki/SyntheticNode123?table=tblSynthetic&view=vewSynthetic')
    page.screenshot(path='/tmp/comsflow-lark-inventory-desktop.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    expect(page.locator('aside')).to_have_css('transform','matrix(1, 0, 0, 1, -250, 0)')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/comsflow-lark-inventory-mobile.png',full_page=True)
    assert not errors,errors
    print('PASS inventory UI: columns/four-size mapping/blank-zero defaults -> real save -> synthetic Lark preview -> no early writes -> real confirm creates 4 SKUs -> reload persistent config -> desktop/390px; no page errors.')
    browser.close()
