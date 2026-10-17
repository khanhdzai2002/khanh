"""Synthetic XLSX with fragmented rows; run only against serve-smoke _test + Vite 5175."""
import csv,io,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
subprocess.run(['node','--import','tsx','--input-type=module','-e',"import fs from 'node:fs/promises';import {fragmentedWorkbook} from './tests/fixtures/tiktok-fragments.ts';await fs.writeFile('/tmp/comsflow-synthetic-fragmented.xlsx',await fragmentedWorkbook());"],cwd=root,check=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=b.new_page(locale='vi-VN',viewport={'width':1440,'height':1000});page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:5175',wait_until='networkidle')
    page.get_by_role('button',name='Đăng nhập DEV (dữ liệu thử nghiệm)').click()
    expect(page.get_by_text('MÔI TRƯỜNG PHÁT TRIỂN',exact=False)).to_be_visible()
    assert page.request.get('http://localhost:5175/api/me').json()['development'] is True
    page.get_by_role('button',name='Phân tích bán hàng',exact=True).click()
    before=page.request.get('http://localhost:5175/api/sales').json()
    page.get_by_role('button',name='Nhập đơn hàng Excel / CSV',exact=True).click()
    d=page.get_by_role('dialog')
    d.get_by_label('File đơn hàng CSV hoặc XLSX (tối đa 10 MB)',exact=True).set_input_files({'name':'synthetic-2026-10-15-10_41.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':Path('/tmp/comsflow-synthetic-fragmented.xlsx').read_bytes()})
    expect(d.get_by_text('Đã nhận diện 4 dòng đơn hàng · 10 cột',exact=True)).to_be_visible()
    expect(d.get_by_role('button',name='Phân tích và xem trước',exact=True)).to_be_enabled()
    expect(d.get_by_label('Kỳ báo cáo từ',exact=True)).to_have_value('2026-10-14')
    expect(d.get_by_label('Kỳ báo cáo đến',exact=True)).to_have_value('2026-10-15')
    expect(d.get_by_label('Thời điểm xuất báo cáo (Việt Nam)',exact=True)).to_have_value('2026-10-15T10:41')
    assert page.request.get('http://localhost:5175/api/sales').json()['variants']==before['variants']
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/sales/preview')) as preview:
        d.get_by_role('button',name='Phân tích và xem trước',exact=True).click()
    assert preview.value.status==200
    assert preview.value.json()['errors']==[]
    assert preview.value.json()['summary']=={'single':30,'excluded':5,'combo':3}
    d.locator('summary').filter(has_text='Xem tổng hợp 1 mã').click()
    matrix=d.get_by_role('table',name='Số lượng theo màu và size MIU66',exact=True)
    expect(matrix.locator('tfoot')).to_contain_text('30')
    assert matrix.get_by_role('button').count()==0,'Preview heat values must not pretend to navigate'
    assert page.request.get('http://localhost:5175/api/sales').json()['variants']==before['variants']
    with page.expect_response(lambda r:r.request.method=='POST' and '/sales/' in r.url and r.url.endswith('/confirm')) as confirmed:
        d.get_by_role('button',name='Xác nhận ghi báo cáo',exact=True).click()
    assert confirmed.value.status==200
    d.wait_for(state='hidden')
    expect(page.get_by_label('Từ ngày',exact=True)).to_have_value('2026-10-14')
    expect(page.get_by_label('Đến ngày',exact=True)).to_have_value('2026-10-15')
    matrix=page.get_by_role('table',name='Số lượng theo màu và size MIU66',exact=True)
    expect(matrix.locator('tfoot')).to_contain_text('30')
    expect(page.get_by_role('button',name='Xem MIU66 Trắng (phối tay đen) M: 10 sản phẩm',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Xem MIU66 Trắng (phối tay đen) L: 20 sản phẩm',exact=True)).to_be_visible()
    report=page.request.get('http://localhost:5175/api/sales').json()
    assert report['lastFullDay']=='2026-10-14'
    assert sum(v['r2'] for v in report['variants'])==5
    with page.expect_download() as export:page.get_by_role('link',name='CSV',exact=True).click()
    records=list(csv.reader(io.StringIO(Path(export.value.path()).read_text(encoding='utf-8-sig'))))
    assert records[0][2:8]==['XS','S','M','L','XL','2XL']
    assert records[1][4:6]==['10','20'] and records[1][8]=='30'
    page.get_by_role('button',name='Biểu đồ',exact=True).click()
    expect(page.get_by_role('heading',name='Top mã sản phẩm',exact=True)).to_be_visible()
    expect(page.get_by_role('img',name='Sản lượng sản phẩm lẻ theo ngày',exact=True)).to_be_visible()
    page.get_by_role('button',name='Combo & loại trừ',exact=True).click()
    page.get_by_label('Loại dữ liệu đối soát',exact=True).select_option('excluded')
    expect(page.get_by_role('cell',name='Đã hủy /',exact=True)).to_be_visible()
    with page.expect_download() as export:page.get_by_role('link',name='CSV',exact=True).click()
    text=Path(export.value.path()).read_text(encoding='utf-8-sig')
    assert 'excluded' in text and 'Đã hủy' in text and 'COMBO 2 ÁO' not in text
    page.get_by_role('button',name='Theo mã · màu · size',exact=True).click()
    page.screenshot(path='/tmp/comsflow-sales-matrix-xlsx.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    expect(page.locator('aside')).to_have_css('transform','matrix(1, 0, 0, 1, -250, 0)')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    expect(matrix).to_be_visible()
    page.screenshot(path='/tmp/comsflow-sales-matrix-mobile.png',full_page=True)
    assert not errors,errors
    print('PASS XLSX browser: fragmented rows -> auto dates/export timestamp -> complete read-only preview matrix -> explicit confirmation -> colour/size totals -> incomplete day excluded -> matrix CSV -> charts -> excluded-only export -> 390px. Synthetic fixture only.')
    b.close()
