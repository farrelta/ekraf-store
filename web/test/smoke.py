"""Run with the webapp-testing server helper against the migrated integration DB."""
import os
import tempfile
import json
from uuid import uuid4
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

assert urlparse(os.environ['TEST_DATABASE_URL']).path.endswith('_test'), 'Use the isolated integration database'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    pending = set()
    page.on('request', lambda request: pending.add(request.url))
    page.on('requestfinished', lambda request: pending.discard(request.url))
    page.on('requestfailed', lambda request: pending.discard(request.url))
    page.goto(os.environ.get('TEST_BASE_URL', 'http://localhost:5187'))
    try:
        page.wait_for_load_state('networkidle')
    except Exception:
        print(json.dumps({'pending': list(pending), 'errors': errors, 'text': page.locator('body').inner_text()[:2500]}))
        raise
    expect(page.get_by_role('heading', name='Shop the collection')).to_be_visible()
    expect(page.get_by_role('button', name='Admin', exact=True)).to_have_count(0)
    bad = page.goto(os.environ.get('TEST_BASE_URL', 'http://localhost:5187') + '/unknown-admin-panel-path')
    assert bad.status == 404
    page.goto(os.environ.get('TEST_BASE_URL', 'http://localhost:5187') + '/' + os.environ['ADMIN_PANEL_PATH'])
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='Admin sign in')).to_be_visible()
    page.get_by_label('Email', exact=True).fill('admin@example.test')
    page.get_by_label('Password', exact=True).fill('test-password-12345')
    page.get_by_role('button', name='Sign in to admin', exact=True).click()
    expect(page.get_by_role('heading', name='Manage the store')).to_be_visible()
    product_name = 'Browser Tee ' + uuid4().hex[:8]
    form = page.locator('form').filter(has=page.get_by_role('heading', name='Add product', exact=True))
    form.get_by_label('Product name', exact=True).fill(product_name)
    form.get_by_label('SKU', exact=True).fill('BROWSER-' + uuid4().hex[:8])
    form.get_by_label('Price (IDR)', exact=True).fill('85000')
    form.get_by_label('Initial stock (zero for batches)', exact=True).fill('4')
    form.locator('select[name=status]').select_option('PUBLISHED')
    form.get_by_role('button', name='Create product', exact=True).click()
    expect(page.get_by_role('heading', name=product_name + ' CONTINUOUS')).to_be_visible()
    page.get_by_role('button', name='payments', exact=True).click()
    expect(page.get_by_role('heading', name='Add payment method')).to_be_visible()
    if page.get_by_role('button', name='Enable', exact=True).count():
        page.get_by_role('button', name='Enable', exact=True).first.click()
    expect(page.get_by_role('button', name='Disable', exact=True).first).to_be_visible()
    page.get_by_role('button', name='batches', exact=True).click()
    expect(page.get_by_role('heading', name='Create batch')).to_be_visible()
    page.goto(os.environ.get('TEST_BASE_URL', 'http://localhost:5187'))
    page.wait_for_load_state('networkidle')
    card = page.locator('article.product').filter(has=page.get_by_role('heading', name=product_name, exact=True))
    expect(card).to_be_visible()
    card.get_by_role('button', name='Add to bag', exact=True).click()
    jacket = page.locator('article.product').filter(has=page.get_by_role('heading', name='Faculty Jacket', exact=True))
    jacket.get_by_label('Name for embroidery').fill('BROWSER NAME')
    jacket.get_by_role('button', name='Add to bag', exact=True).click()
    page.locator('.bag-group select').select_option('BATCH_DEPOSIT')
    page.get_by_label('Phone number for campus pickup').fill('081234567890')
    page.get_by_role('button', name='Place order', exact=True).click()
    expect(page.get_by_role('heading', name='My orders', exact=True)).to_be_visible()
    expect(page.locator('article.order-card').get_by_text('Pay Rp', exact=False).first).to_be_visible()
    expect(page.get_by_label('Payment proof (JPG/PNG, max 5 MB)').first).to_be_visible()
    page.screenshot(path=os.path.join(tempfile.gettempdir(), 'ekraf-order-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(os.environ.get('TEST_BASE_URL', 'http://localhost:5187'))
    page.wait_for_load_state('networkidle')
    page.wait_for_load_state('networkidle')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile layout overflows'
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=os.path.join(tempfile.gettempdir(), 'ekraf-shop-mobile.png'), full_page=True)
    assert not errors, errors
    print('Browser checks passed: hidden admin login, no public admin link, product creation, mixed DP checkout, receipt UI, mobile layout, no page errors.')
    browser.close()
