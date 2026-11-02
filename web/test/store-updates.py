"""Live checks against the isolated manual environment; temporary news is removed."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
settings={key:json.loads(value) for key,value in (line.split('=',1) for line in Path('.env.e2e').read_text().splitlines() if '=' in line)}
base='http://127.0.0.1:5187'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 admin=browser.new_page(viewport={"width":1440,"height":1000})
 admin.goto(base+'/ekraf-test-admin-panel')
 admin.locator('input[name=email]').fill(settings['E2E_ADMIN_EMAIL'])
 admin.locator('input[name=password]').fill(settings['E2E_PASSWORD'])
 admin.get_by_role('button',name='Show password',exact=True).click()
 expect(admin.locator('input[name=password]')).to_have_attribute('type','text')
 admin.get_by_role('button',name='Hide password',exact=True).click()
 expect(admin.locator('input[name=password]')).to_have_attribute('type','password')
 admin.get_by_role('button',name='Sign in to admin',exact=True).click()
 expect(admin.locator('.admin-main')).to_be_visible()
 def api(path,method='GET',data=None):
  return admin.evaluate("""async ({path,method,data})=>{const {token}=await (await fetch('/api/csrf')).json();const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':token},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error(await r.text());return r.status===204?null:r.json();}""",{'path':path,'method':method,'data':data})
 admin.goto(base+'/ekraf-test-admin-panel/products/new')
 admin.get_by_label('Selling type',exact=True).select_option('BATCH')
 expect(admin.locator('input[name=onHand]')).to_be_disabled()
 expect(admin.get_by_label('Require an embroidery name for each item')).to_be_checked()
 admin.goto(base+'/ekraf-test-admin-panel/announcements')
 expect(admin.get_by_role('heading',name='Announcements',exact=True)).to_be_visible()
 ids=[]
 try:
  for title in ['TEST browser first','TEST browser second']:
   ids.append(api('/admin/announcements','POST',{'title':title,'body':'TEST pickup details, no real collection.','published':True})['announcement']['id'])
  guest=browser.new_page(viewport={'width':390,'height':844})
  guest.goto(base+'/sign-in')
  guest.locator('input[name=password]').fill('preview-password')
  guest.get_by_role('button',name='Show password',exact=True).click()
  expect(guest.locator('input[name=password]')).to_have_attribute('type','text')
  guest.get_by_role('button',name='Hide password',exact=True).click()
  expect(guest.locator('input[name=password]')).to_have_attribute('type','password')
  guest.goto(base)
  expect(guest.locator('.announcement')).to_contain_text('TEST browser second')
  expect(guest.locator('.announcement')).to_contain_text('TEST browser first',timeout=10000)
  api('/admin/announcements/'+ids[0],'PATCH',{'title':'TEST edited news','body':'Updated from admin','published':True})
  guest.evaluate("window.dispatchEvent(new Event('focus'))")
  expect(guest.locator('.announcement')).to_contain_text('TEST edited news',timeout=10000)
  guest.goto(base+'/announcements')
  expect(guest.get_by_role('heading',name='TEST edited news',exact=True)).to_be_visible()
  for width in [390,768,1440]:
   guest.set_viewport_size({'width':width,'height':1000})
   assert guest.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),width
  print('Live password controls, batch stock, personalization control, announcement publish/update/rotation/page and responsive layout passed.')
 finally:
  for id in ids:api('/admin/announcements/'+id,'DELETE')
  browser.close()
