"""Actual image upload/gallery flow on the isolated, seeded E2E environment only."""
from pathlib import Path
from datetime import datetime
import json,os,subprocess
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[2];env=dict(line.split('=',1) for line in (root/'.env.e2e').read_text(encoding='utf-8').splitlines() if '=' in line and not line.startswith('#'))
base='http://127.0.0.1:5187';private=env['ADMIN_PANEL_PATH'].strip('"');assets=root/'api/storage/e2e/media';name='TEST Gallery '+datetime.now().strftime('%H%M%S%f')
assert '/ekraf_manual_e2e_test' in env['DATABASE_URL']
assets.mkdir(parents=True,exist_ok=True)
subprocess.run(['node','--input-type=module','-'],cwd=root,input="import sharp from 'sharp';for(const [name,color] of [['green','#00552e'],['blue','#315d75'],['maroon','#7c3e32']])await sharp({create:{width:640,height:480,channels:3,background:color}}).png().toFile(`api/storage/e2e/media/${name}.png`);",text=True,check=True)
with sync_playwright() as p:
 browser=p.chromium.launch();context=browser.new_context(viewport={'width':1440,'height':1000},has_touch=True,is_mobile=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)));product_id=None;method_id=None
 try:
  page.goto(base+'/'+private+'/products/new');page.locator('[name=email]').fill(env['E2E_ADMIN_EMAIL'].strip('"'));page.locator('[name=password]').fill(env['E2E_PASSWORD'].strip('"'));page.get_by_role('button',name='Sign in to admin').click()
  page.get_by_label('Product name',exact=True).fill(name);page.get_by_label('Price (IDR)',exact=True).fill('12345.67')
  assert not page.locator('input[type=url]').count()
  upload=page.get_by_label('Product images',exact=True);upload.set_input_files([str(assets/'green.png'),str(assets/'blue.png')]);expect(page.locator('.image-upload-list li')).to_have_count(2)
  page.get_by_role('button',name='Make cover',exact=True).click()
  upload.set_input_files({'name':'invalid.txt','mimeType':'text/plain','buffer':b'not an image'});expect(page.locator('.image-upload .field-error')).to_contain_text('Choose JPG, PNG, or WebP');assert upload.evaluate('el=>el.files.length')==2
  # Pick valid files again to clear the local invalid-file message, keeping their order.
  page.get_by_role('button',name='Remove photo 2',exact=True).click();upload.set_input_files(str(assets/'green.png'))
  upload.set_input_files({'name':'corrupt.png','mimeType':'image/png','buffer':b'not a real PNG image'})
  page.get_by_role('button',name='Create product',exact=True).click();expect(page.locator('.image-upload .field-error')).to_contain_text('could not be read')
  assert upload.evaluate('el=>el.files.length')==3
  page.get_by_role('button',name='Remove photo 3',exact=True).click()
  with page.expect_response(lambda response:response.url.endswith('/api/admin/products') and response.request.method=='POST') as saved:page.get_by_role('button',name='Create product',exact=True).click()
  response=saved.value;assert response.status==201,response.text();product=response.json()['product'];product_id=product['id'];assert len(product['imageKeys'])==2 and product['imageKey']==product['imageKeys'][0]
  page.wait_for_url('**/products/'+product_id);expect(page.locator('.image-upload-list li')).to_have_count(2)
  upload=page.get_by_label('Product images',exact=True);upload.set_input_files(str(assets/'maroon.png'));expect(page.locator('.image-upload-list li')).to_have_count(3)
  page.get_by_role('button',name='Remove photo 2',exact=True).click();expect(page.locator('.image-upload-list li')).to_have_count(2)
  page.get_by_label('Status',exact=True).first.select_option('PUBLISHED')
  with page.expect_response(lambda response:response.url.endswith('/api/admin/products/'+product_id) and response.request.method=='PATCH') as edited:page.get_by_role('button',name='Save product',exact=True).click()
  assert edited.value.status==200;product=edited.value.json()['product'];assert len(product['imageKeys'])==2
  page.goto(base+'/?search='+name);card=page.locator('.product-tile');expect(card).to_have_count(1)
  expect(card.locator('.product-gallery')).to_have_count(0);expect(card.locator('.tile-image img')).to_have_count(1)
  card.locator('.tile-image').click();page.wait_for_url('**/products/'+product_id)
  gallery=page.locator('.product-detail-grid .product-gallery');expect(gallery.locator('.gallery-thumbnail')).to_have_count(2)
  gallery.get_by_role('button',name='Show photo 2 of '+name,exact=True).click();expect(gallery.locator('.gallery-count')).to_have_text('2 / 2')
  gallery.locator('.gallery-track').focus();page.keyboard.press('Home');expect(gallery.locator('.gallery-count')).to_have_text('1 / 2')
  gallery.get_by_role('button',name='Next photo of '+name,exact=True).click();expect(gallery.locator('.gallery-count')).to_have_text('2 / 2')
  page.set_viewport_size({'width':390,'height':844});gallery.locator('.gallery-track').focus();page.keyboard.press('Home');expect(gallery.locator('.gallery-count')).to_have_text('1 / 2');page.wait_for_timeout(400)
  track=gallery.locator('.gallery-track');track.scroll_into_view_if_needed();box=track.bounding_box();cdp=context.new_cdp_session(page);x=int(box['x']+box['width']-10);y=int(box['y']+25)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
  for point in range(x-12,int(box['x']+4),-12):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':point,'y':y}]});page.wait_for_timeout(20)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});expect(gallery.locator('.gallery-count')).to_have_text('2 / 2')
  page.screenshot(path=str(assets/'detail-gallery-390.png'))
  for width in [320,768,1440]:
   page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(assets/f'detail-gallery-{width}.png'))
  page.goto(base+'/'+private+'/settings');page.get_by_label('Display name',exact=True).fill(name+' QRIS NOT PAYABLE');page.get_by_label('QRIS image',exact=True).set_input_files(str(assets/'green.png'))
  with page.expect_response(lambda response:response.url.endswith('/api/admin/payment-methods') and response.request.method=='POST') as saved:page.get_by_role('button',name='Add payment method',exact=True).click()
  response=saved.value;assert response.status==201,response.text();method=response.json()['method'];method_id=method['id'];assert '/api/media/qris-' in method['qrImageKey']
  expect(page.get_by_alt_text(name+' QRIS NOT PAYABLE QRIS code')).to_be_visible()
  assert not errors,errors
  print('Real product multi-upload, cover change, saved/new image removal, invalid file retention, publication, static shop covers, detail thumbnails/arrows, touch swipe, keyboard, resizing and QRIS upload passed.')
 finally:
  token=context.request.get(base+'/api/csrf').json()['token'];headers={'X-CSRF-Token':token,'Origin':base}
  if method_id:assert context.request.patch(base+'/api/admin/payment-methods/'+method_id,data={'enabled':False},headers=headers).ok
  if product_id:
   assert context.request.patch(base+'/api/admin/products/'+product_id,data={'status':'DRAFT'},headers=headers).ok
   assert context.request.delete(base+'/api/admin/products/'+product_id,headers=headers).status==204
  browser.close()
