"""Hardening regressions. API mutations are intercepted; no store data is written."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('TEST_BASE_URL','http://127.0.0.1:5187')
private=os.environ.get('ADMIN_PANEL_PATH','ekraf-test-admin-panel')
variant=dict(id='v',sku='EKR-HARDEN',size='M',color='STANDARD',type='STANDARD',price='1000',onHand=3,reserved=0,active=True)
windows=[dict(id='expired',name='Expired',status='OPEN',opensAt='2019-01-01T00:00:00Z',closesAt='2020-02-01T00:00:00Z'),dict(id='active',name='Current',status='OPEN',opensAt='2020-01-01T00:00:00Z',closesAt='2099-01-01T00:00:00Z'),dict(id='future',name='Future',status='OPEN',opensAt='2100-01-01T00:00:00Z',closesAt='2101-01-01T00:00:00Z')]
product=dict(id='p',name='Physics 🎓 商品',description='Fixture only',category='Faculty Jacket',sellingType='BATCH',embroideryRequired=False,status='PUBLISHED',featured=False,imageKey=None,createdAt='2026-01-01T00:00:00Z',updatedAt='2026-01-01T00:00:00Z',fromPrice='1000',availableStock=3,variants=[variant],batches=windows)
state={'mode':'fields','posts':0}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 def mock(route):
  path=route.request.url.split('/api/')[-1]
  if route.request.method=='POST':assert route.request.headers.get('x-csrf-token')==state.get('token'), 'Mutation must use the latest session token'
  if path=='csrf':
   if state.get('sessionFail'):route.abort('failed');return
   state['token']='fixture-'+str(state.get('tokenVersion',0)+1);state['tokenVersion']=state.get('tokenVersion',0)+1
   data={'token':state['token']}
  elif path=='auth/login':route.fulfill(status=400,json={'error':'Fixture confirms the refreshed session token.'});return
  elif path=='auth/me':data={'user':{'id':'admin','role':'ADMIN','name':'Fixture','email':'a@example.test'}}
  elif path=='admin/catalog-options':data={'categories':['T-shirt','Faculty Jacket','Other'],'sizes':['STANDARD','M','L'],'colors':[]}
  elif path=='admin/products' and route.request.method=='POST':
   state['posts']+=1
   if state['mode']=='fields':route.fulfill(status=400,json={'error':'Invalid input','details':[{'path':'name','message':'Choose a shorter product name.'},{'path':'variants.0.price','message':'Enter a valid price.'}]});return
   if state['mode']=='offline':route.abort('failed');return
   if state['mode']=='hang':state['pending']=route;return
   if state['mode']=='rate':route.fulfill(status=429,body='Too many requests',headers={'Retry-After':'60'});return
   if state['mode']=='server':route.fulfill(status=500,json={'error':'private database detail'});return
   if state['mode']=='auth':route.fulfill(status=401,json={});return
   data={'product':product}
  elif path=='orders/harden':data={'order':dict(id='harden',customerName='Fixture',customerPhone='0800000000',createdAt='2026-01-01T00:00:00Z',expiresAt='2099-01-01T00:00:00Z',paymentStatus='PENDING',pickupStatus='PENDING',paymentPlan='FULL',phase='INITIAL',amountDue='1000',initialAmount='1000',total='1000',paidAmount='0',remainingBalance='1000',items=[],paymentSubmissions=[])}
  elif path=='payment-methods':data={'methods':[dict(id='bank',name='Fixture bank',type='BANK_TRANSFER',bankName='Test',accountName='Test',accountNumber='0000',instructions='',enabled=True)]}
  elif path=='orders/harden/proof':route.fulfill(status=429,json={},headers={'Retry-After':'60'});return
  elif path.startswith('admin/products/p'):data={'product':product}
  elif path.startswith('admin/products?'):data={'products':[product],'pagination':{'page':1,'pageSize':20,'total':1,'pageCount':1},'summary':{},'categories':[]}
  elif path.startswith('products/p'):data={'product':{**product,'sellingType':'CONTINUOUS','imageKey':base+'/broken-photo.png'}}
  else:data={'products':[],'batches':[],'announcements':[]}
  route.fulfill(json=data)
 page.route('**/api/**',mock)
 page.goto(base+'/'+private+'/products/new')
 name=page.locator('input[name=name]');price=page.locator('input[name=price]')
 expect(name).to_have_attribute('maxlength','160')
 name.fill('x'*200);assert len(name.input_value())==160
 name.fill('Physics 🎓 商品');price.fill('1000')
 page.get_by_role('button',name='Create product',exact=True).click()
 expect(name).to_have_attribute('aria-invalid','true');expect(price).to_have_attribute('aria-invalid','true')
 for field in [name,price]:
  id=field.get_attribute('aria-describedby');assert id and page.locator('[id="'+id+'"]').inner_text()
 assert page.evaluate('document.activeElement.name')=='name'
 page.wait_for_timeout(5300);expect(page.locator('.form-error-summary')).to_be_visible()
 expect(name).to_have_value('Physics 🎓 商品');expect(price).to_have_value('1000')
 expect(page.locator('.notice')).to_have_count(0)
 screenshots=Path('api/storage/e2e/hardening');screenshots.mkdir(parents=True,exist_ok=True)
 for width in [390,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.screenshot(path=str(screenshots/f'validation-{width}.png'),full_page=True)
 for mode,message in [('offline','Check your connection'),('rate','60 seconds'),('server','try again shortly'),('auth','Sign in again')]:
  state['mode']=mode;page.get_by_role('button',name='Create product',exact=True).click()
  expect(page.locator('.form-error-summary')).to_contain_text(message)
  expect(name).to_have_value('Physics 🎓 商品');expect(name).not_to_have_attribute('aria-invalid','true')
  expect(page.locator('.form-error-summary')).not_to_contain_text('private database detail')
 page.clock.install();state['mode']='hang';before=state['posts']
 page.get_by_role('button',name='Create product',exact=True).click()
 page.wait_for_timeout(100)
 page.evaluate("document.querySelector('.editor-form').requestSubmit(); document.querySelector('.editor-form').requestSubmit()")
 assert state['posts']==before+1
 page.clock.fast_forward(31000)
 expect(page.locator('.form-error-summary')).to_contain_text('timed out')
 expect(name).to_have_value('Physics 🎓 商品')
 state.pop('pending').abort('aborted')
 state['mode']='success';page.get_by_role('button',name='Create product',exact=True).click();page.wait_for_url('**/products/p')
 expect(page.locator('.notice')).to_contain_text('Saved successfully')
 page.goto(base+'/'+private+'/products')
 expect(page.locator('tbody tr td').nth(3)).to_contain_text('2099')
 expect(page.locator('tbody tr td').nth(3)).not_to_contain_text('2020')
 page.route('**/broken-photo.png',lambda route:route.fulfill(status=404,body='missing'))
 page.goto(base+'/products/p');expect(page.locator('.image-placeholder').first).to_contain_text(product['name'])
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 page.goto(base+'/orders/harden/payment')
 proof=page.locator('input[name=proof]')
 proof.focus();assert page.locator('.upload-zone').evaluate('el=>getComputedStyle(el).outlineWidth')=='2px'
 page.evaluate('window.scrollTo(0,500)')
 assert page.locator('.order-summary').bounding_box()['y']>=page.locator('.store-header').bounding_box()['height']
 proof.set_input_files({'name':'fixture.png','mimeType':'image/png','buffer':b'fixture'})
 page.get_by_role('button',name='Submit initial payment proof',exact=True).click()
 expect(page.locator('.form-error-summary')).to_contain_text('60 seconds')
 assert proof.evaluate('el=>el.files[0].name')=='fixture.png'
 proof.set_input_files({'name':'fixture.txt','mimeType':'text/plain','buffer':b'fixture'})
 page.get_by_role('button',name='Submit initial payment proof',exact=True).click()
 expect(proof).to_have_attribute('aria-invalid','true')
 assert page.locator('.upload-zone').evaluate('el=>getComputedStyle(el).borderTopColor')=='rgb(155, 48, 39)'
 expect(page.locator('.field-error')).to_contain_text('Choose a JPG or PNG image')
 state['sessionFail']=True
 page.goto(base+'/sign-in');expect(page.locator('.session-feedback')).to_contain_text('Check your connection')
 page.locator('input[name=email]').fill('preserved@example.test')
 state['sessionFail']=False;page.get_by_role('button',name='Retry session',exact=True).click()
 expect(page.locator('.session-feedback')).to_have_count(0)
 expect(page.locator('input[name=email]')).to_have_value('preserved@example.test')
 page.locator('input[name=password]').fill('fixture-password')
 page.get_by_role('button',name='Sign in',exact=True).click()
 expect(page.locator('.form-error-summary')).to_contain_text('Fixture confirms the refreshed session token.')
 assert not errors,errors
 browser.close()
 print('Hardening passed: persistent linked field errors, input preservation, network/rate-limit/server/auth/timeout failures, duplicate-submit guard, batch windows, broken-image fallback and responsive Unicode.')
