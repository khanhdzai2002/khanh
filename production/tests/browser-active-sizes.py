"""Verify current size UI + backend guards, synthetic serve-smoke _test only."""
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(locale='vi-VN',viewport={'width':1440,'height':1000});page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:5175',wait_until='networkidle');page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)',exact=True).click();expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
 me=page.request.get('http://localhost:5175/api/me').json();assert me['development'];headers={'Origin':'http://localhost:5175','X-CSRF-Token':me['csrf']}
 page.get_by_role('button',name='Dự kiến sản xuất',exact=True).click();page.get_by_role('button',name='Thêm SKU / nhiều size',exact=True).click();d=page.get_by_role('dialog')
 assert d.get_by_label('XS',exact=True).count()==0 and d.get_by_label('2XL',exact=True).count()==0
 for s in ['S','M','L','XL']:expect(d.get_by_label(s,exact=True)).to_be_visible()
 d.get_by_role('button',name='Đóng',exact=True).click()
 for size in ['XS','2XL','XXL']:
  r=page.request.post('http://localhost:5175/api/skus',data={'sku':'SYNTHETIC-FORBIDDEN','color':'Cam','size':size},headers=headers);assert r.status==400,r.text()
 r=page.request.post('http://localhost:5175/api/skus',data={'sku':'SYNTHETIC-ACTIVE','color':'Cam','size':'XL'},headers=headers);assert r.ok,r.text()
 page.get_by_role('button',name='Tải lại dữ liệu',exact=True).click();page.get_by_role('button',name='Gối lệnh sản xuất',exact=True).click();page.get_by_role('button',name='Tạo lệnh sản xuất',exact=True).click();d=page.get_by_role('dialog')
 matrix=d.locator('.order-matrix');heads=matrix.get_by_role('columnheader').all_text_contents();assert 'XS' not in heads and '2XL' not in heads;assert all(s in heads for s in ['S','M','L','XL'])
 for s in ['S','M','L','XL']:expect(d.get_by_label(s,exact=True)).to_be_visible()
 assert d.get_by_label('XS',exact=True).count()==0 and d.get_by_label('2XL',exact=True).count()==0
 d.screenshot(path='/tmp/comsflow-four-size-order-editor.png');d.get_by_role('button',name='Đóng',exact=True).click()
 pending=page.get_by_role('region',name='Danh sách chờ sản xuất theo mã màu size',exact=True);options=pending.get_by_label('Size chờ sản xuất',exact=True).locator('option').all_text_contents();assert options==['Tất cả size','S','M','L','XL']
 page.get_by_role('button',name='Cấu hình & dữ liệu',exact=True).click();page.get_by_role('button',name='Tồn kho Lark Base',exact=True).click()
 for s in ['S','M','L','XL']:expect(page.get_by_label('Tồn size '+s,exact=True)).to_be_visible()
 assert page.get_by_label('Tồn size XS',exact=True).count()==0 and page.get_by_label('Tồn size 2XL',exact=True).count()==0
 page.set_viewport_size({'width':390,'height':844});expect(page.locator('aside')).to_have_css('transform','matrix(1, 0, 0, 1, -250, 0)');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/comsflow-four-size-lark-mobile.png',full_page=True)
 assert not errors,errors
 print('PASS active sizes: planning/order/Lark forms and pending filter show only S/M/L/XL; backend rejects XS/2XL/XXL; active XL works; mobile fits. Synthetic only.')
 b.close()
