"""Responsive layouts and synthesized touch/keyboard checks against the isolated E2E store.
Only login requests are written to the server; carts stay in this browser context.
"""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[2]
base=os.environ.get('TEST_BASE_URL','http://127.0.0.1:5187')
env=dict(line.split('=',1) for line in (root/'.env.e2e').read_text(encoding='utf-8').splitlines() if '=' in line and not line.startswith('#'))
private=env['ADMIN_PANEL_PATH'].strip('"')
shots=root/'api/storage/e2e/adapt';shots.mkdir(parents=True,exist_ok=True)
sizes=[(320,800),(390,844),(768,1024),(844,390),(1024,768),(1440,1000),(2560,1440)]
with sync_playwright() as p:
 browser=p.chromium.launch()
 context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 products=context.request.get(base+'/api/products').json()['products']
 product=next(x for x in products if x['sellingType']=='CONTINUOUS' and any(v['active'] and v['onHand']>v['reserved'] for v in x['variants']))
 jacket=next(x for x in products if x['sellingType']=='BATCH' and x['batches'])
 def customer_auth(route):route.fulfill(json={'user':{'id':'fixture','name':'Campus Shopper','email':'shopper@example.test','phone':'081234567890','role':'CUSTOMER'}})
 page.route('**/api/auth/me',customer_auth)
 def check(path,label):
  page.goto(base+path);page.wait_for_timeout(180)
  for width,height in sizes:
   page.set_viewport_size({'width':width,'height':height})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(label,width)
   if width in [390,768,1440]:page.screenshot(path=str(shots/f'{label}-{width}.png'))
 check('/','home')
 page.set_viewport_size({'width':390,'height':844})
 expect(page.get_by_label('Search collection')).to_be_visible()
 for selector in ['.announcement-nav-icon','.cart-icon']:
  box=page.locator(selector).bounding_box();assert box['width']>=44 and box['height']>=44,(selector,box)
 page.get_by_label('Search collection').fill('Department');page.get_by_label('Search collection').press('Enter');expect(page).to_have_url(__import__('re').compile('search=Department'))
 for path,label in [('/products/'+product['id'],'product'),('/products/'+jacket['id'],'batch'),('/about','about'),('/account','account'),('/register','register')]:check(path,label)
 page.set_viewport_size({'width':390,'height':844});page.goto(base+'/products/'+product['id']);page.locator('.variant-choice').wait_for()
 for selector in ['.choice','.quantity-control button']:
  for control in page.locator(selector).all():
   box=control.bounding_box();assert box['width']>=44 and box['height']>=44,(selector,box)
 page.get_by_label('Increase quantity').tap();expect(page.get_by_role('spinbutton',name='Quantity',exact=True)).to_have_value('2')
 page.get_by_role('button',name='Add to cart',exact=True).tap();check('/cart','cart');expect(page.locator('.cart-item')).to_have_count(1)
 page.reload();expect(page.locator('.cart-item')).to_have_count(1)
 page.set_viewport_size({'width':390,'height':844});page.locator('.cart-quantity input').fill('1');page.locator('.cart-quantity input').blur()
 expect(page.locator('.cart-quantity input')).to_have_value('1')
 # Payment layout fixtures do not create a transaction or upload a receipt.
 order=dict(id='adapt',customerName='Campus Shopper',customerPhone='081234567890',createdAt='2026-01-01T00:00:00Z',expiresAt='2099-01-01T00:00:00Z',paymentStatus='PENDING',pickupStatus='PENDING',paymentPlan='FULL',phase='INITIAL',amountDue='85000',initialAmount='85000',total='85000',paidAmount='0',remainingBalance='85000',items=[],paymentSubmissions=[])
 methods=[dict(id='qris',name='Fixture QRIS',type='QRIS',qrImageKey=base+'/test-fixtures/non-payable-qris.svg',instructions='Fixture only',enabled=True),dict(id='bank',name='Fixture bank transfer',type='BANK_TRANSFER',bankName='Test bank',accountName='EKRAF TEST',accountNumber='000000000000',instructions='Fixture only',enabled=True)]
 page.route('**/api/orders/adapt',lambda route:route.fulfill(json={'order':order}))
 page.route('**/api/payment-methods',lambda route:route.fulfill(json={'methods':methods}))
 check('/orders/adapt/payment','payment');page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('radio',name='Fixture bank transfer',exact=True).tap();expect(page.locator('.account-number')).to_contain_text('000000000000')
 page.get_by_role('radio',name='Fixture QRIS',exact=True).tap();expect(page.get_by_alt_text('Fixture QRIS QRIS code')).to_be_visible()
 # Long optional variant values must wrap even on the smallest supported screen.
 detail=context.request.get(base+'/api/products/'+product['id']).json()['product']
 detail['name']='Campus merchandise with a very long product name for narrow screens'
 for v in detail['variants']:v['type']='PhysicsDepartment'+('X'*50)
 page.route('**/api/products/'+product['id'],lambda route:route.fulfill(json={'product':detail}))
 page.set_viewport_size({'width':320,'height':800});page.goto(base+'/products/'+product['id']);page.locator('.choice').first.wait_for()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # Admin navigation uses a genuine test admin session, with no catalog writes.
 admin=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
 a=admin.new_page();a.on('pageerror',lambda e:errors.append(str(e)))
 a.goto(base+'/'+private);a.locator('[name=email]').fill(env['E2E_ADMIN_EMAIL'].strip('"'));a.locator('[name=password]').fill(env['E2E_PASSWORD'].strip('"'));a.get_by_role('button',name='Sign in to admin').tap();a.locator('.admin-main').wait_for()
 for route,label in [('products','admin-products'),('products/'+product['id'],'admin-variant'),('batches','admin-batches'),('announcements','admin-announcements'),('orders','admin-orders'),('settings','admin-settings')]:
  a.goto(base+'/'+private+'/'+route);a.wait_for_timeout(180)
  for width,height in sizes:
   a.set_viewport_size({'width':width,'height':height});assert a.evaluate('document.documentElement.scrollWidth<=innerWidth'),(label,width)
   if width in [390,768,1440]:a.screenshot(path=str(shots/f'{label}-{width}.png'))
 a.goto(base+'/'+private);a.set_viewport_size({'width':390,'height':844})
 nav=a.get_by_role('navigation',name='Admin navigation',exact=True);expect(nav.get_by_role('link')).to_have_count(8)
 assert nav.evaluate('el=>el.scrollWidth>el.clientWidth')
 expect(a.get_by_role('button',name='Admin menu',exact=True)).to_have_count(0)
 a.locator('.admin-main').wait_for();a.wait_for_timeout(100)
 scroll=nav.evaluate('el=>el.scrollLeft');box=nav.bounding_box();top=a.evaluate('scrollY')
 cdp=admin.new_cdp_session(a)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':330,'y':int(box['y']+25)}]})
 for x in range(300,59,-30):
  cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':int(box['y']+25)}]});a.wait_for_timeout(20)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 a.wait_for_function('(previous)=>document.querySelector(".admin-bottom").scrollLeft>previous',arg=scroll,timeout=3000)
 assert a.evaluate('scrollY')==top
 settings=nav.get_by_role('link',name='Payment Settings',exact=True);settings.focus();a.keyboard.press('Enter');expect(a).to_have_url(base+'/'+private+'/settings')
 expect(settings).to_have_attribute('aria-current','page')
 assert settings.evaluate('el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right}')
 a.set_viewport_size({'width':1024,'height':768});expect(nav).not_to_be_visible();expect(a.get_by_role('navigation',name='Administration',exact=True)).to_be_visible()
 a.set_viewport_size({'width':390,'height':844});expect(nav).to_be_visible()
 a.screenshot(path=str(shots/'admin-bottom-scrolled-390.png'))
 assert not errors,errors
 browser.close();print('Adaptation checks passed: 320–2560px, portrait/landscape, mobile search, 44px targets, touch quantity/cart, cart persistence, horizontal touch scrolling, keyboard navigation, active tab visibility and desktop sidebar.')
