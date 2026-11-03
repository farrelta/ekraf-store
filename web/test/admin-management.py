"""Product and batch admin checks. All API requests use intercepted fixtures."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
root = Path(__file__).resolve().parents[2]
private = os.environ.get("ADMIN_PANEL_PATH") or next(line.split("=",1)[1].strip().strip("\"'") for line in (root/".env").read_text(encoding="utf-8").splitlines() if line.startswith("ADMIN_PANEL_PATH="))
base = os.environ.get("TEST_BASE_URL","http://localhost:5173")+"/"+private
variant = dict(id="v",sku="EKR-FIXTURE",size="M",color="BLACK",type="PHYSICS",price="85000.50",onHand=3,reserved=0,active=True,hasOrderHistory=False)
product = dict(id="p",name="Older Jacket",description="Fixture only",category="Faculty Jacket",sellingType="BATCH",status="PUBLISHED",featured=False,imageKey=None,createdAt="2020-01-01T00:00:00Z",updatedAt="2020-01-01T00:00:00Z",variants=[variant],batches=[])
batch = dict(id="b",name="Expired Batch",status="OPEN",opensAt="2020-01-01T00:00:00Z",closesAt="2020-02-01T00:00:00Z",productionWeeks=4,announcement="",createdAt="2020-01-01T00:00:00Z",updatedAt="2020-01-01T00:00:00Z",product=product,actions=[dict(status="CLOSED",blockedReason=None),dict(status="CANCELLED",blockedReason="Resolve existing orders before cancelling this batch.")])
patches = []
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={"width":1440,"height":1000})
    errors=[];page.on("pageerror",lambda error:errors.append(str(error)))
    def mock(route):
        path=route.request.url.split("/api/")[-1]
        if path=="csrf": data={"token":"fixture"}
        elif path=="auth/me": data={"user":{"id":"fixture","role":"ADMIN","name":"Review Admin","email":"admin@example.test"}}
        elif path=="admin/catalog-options": data={"categories":["Faculty Jacket","Other"],"sizes":["STANDARD","S","M","L"],"colors":[]}
        elif path=="admin/products/p": data={"product":product}
        elif path.startswith("admin/products?"):
            assert "scope=catalog" in path
            data={"products":[product],"pagination":{"total":1}}
        elif path=="admin/variants/v":
            variant.update(route.request.post_data_json);data={"variant":variant}
        elif path=="admin/batches/b":
            if route.request.method=="PATCH":
                patch=route.request.post_data_json;patches.append(patch);batch.update(patch)
                batch["actions"]=[dict(status="IN_PRODUCTION",blockedReason=None),dict(status="CANCELLED",blockedReason="Resolve existing orders before cancelling this batch.")]
            data={"batch":batch}
        else:data={"products":[],"batches":[]}
        route.fulfill(json=data)
    page.route("**/api/**",mock)
    page.goto(base+"/products/p")
    price=page.locator('[name="price"]').first
    expect(price).to_have_value("85000.50")
    assert price.evaluate("el=>el.checkValidity()")
    price.fill("85000.75");page.get_by_role("button",name="Save variant",exact=True).click()
    expect(page.locator(".notice")).to_contain_text("Saved")
    assert variant["price"]=="85000.75"
    details=page.get_by_role("heading",name="Product details",exact=True)
    danger=page.get_by_role("heading",name="Permanent deletion",exact=True)
    assert details.evaluate("el=>el.getBoundingClientRect().top") < danger.evaluate("el=>el.getBoundingClientRect().top")
    if os.environ.get("TEST_SCREENSHOT_DIR"):
        page.screenshot(path=str(Path(os.environ["TEST_SCREENSHOT_DIR"])/"admin-product-fixed.png"),full_page=True)
    page.goto(base+"/batches/new")
    expect(page.get_by_label("Product",exact=True).locator("option")).to_have_count(2)
    page.get_by_label("Find batch product",exact=True).fill("Older")
    page.get_by_label("Product",exact=True).select_option("p")
    page.goto(base+"/batches/b")
    status=page.get_by_label("Status",exact=True)
    expect(status.locator("option")).to_have_count(3)
    assert status.locator('option[value="CANCELLED"]').evaluate("el=>el.disabled")
    expect(page.get_by_text("Resolve existing orders before cancelling this batch.",exact=True)).to_be_visible()
    status.select_option("CLOSED");page.get_by_role("button",name="Save batch",exact=True).click()
    expect(page.get_by_role("heading",name="Receive production stock",exact=True)).to_be_visible()
    assert patches[0]["status"]=="CLOSED"
    assert "opensAt" not in patches[0] and "closesAt" not in patches[0]
    expect(page.get_by_label("M / BLACK / PHYSICS · EKR-FIXTURE",exact=True)).to_be_visible()
    expect(page.get_by_label("Status",exact=True).locator('option[value="IN_PRODUCTION"]')).to_have_text("Start production")
    for width in [390,768,1440]:
        page.set_viewport_size({"width":width,"height":1000})
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth")
        if os.environ.get("TEST_SCREENSHOT_DIR"):
            page.screenshot(path=str(Path(os.environ["TEST_SCREENSHOT_DIR"])/f"admin-batch-fixed-{width}.png"),full_page=True)
    variant['hasOrderHistory']=True
    product['variants'].append({**variant,'id':'unused','sku':'EKR-UNUSED','hasOrderHistory':False})
    page.goto(base+'/products/p')
    delete=page.get_by_role('button',name='Delete variant permanently',exact=True)
    expect(delete.nth(0)).to_be_disabled();expect(delete.nth(1)).to_be_enabled()
    assert not errors, errors
    browser.close()
    print("Admin management checks passed: decimal edits, older catalog, valid transitions, unchanged dates, receipt labels, deletion placement and responsive forms.")
