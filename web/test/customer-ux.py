"""Read-only UX regression checks. Run against a local dev server; API data is intercepted."""
import base64
import os
from playwright.sync_api import sync_playwright, expect

base = os.environ.get("TEST_BASE_URL", "http://localhost:5173")
variants = [
    dict(id="black-m", size="M", color="BLACK", type="STANDARD", price="12000", onHand=3, reserved=0, active=True),
    dict(id="white-l", size="L", color="WHITE", type="STANDARD", price="14000", onHand=2, reserved=0, active=True),
]
product = dict(id="review", name="Review options", description="Test combinations", category="Accessories", sellingType="CONTINUOUS", variants=variants, batches=[], imageKey=None)
order = dict(id="review-order", customerName="Test", customerPhone="0800000000", createdAt="2026-11-02T00:00:00Z", expiresAt="2099-01-01T00:00:00Z", paymentStatus="PENDING", pickupStatus="PROCESSING", paymentPlan="FULL", phase="INITIAL", amountDue="12000", initialAmount="12000", total="12000", paidAmount="0", remainingBalance="12000", items=[], paymentSubmissions=[])
methods = [
    dict(id="qr", name="QRIS", type="QRIS", qrImageKey=base+"/test-qr.png", instructions="", enabled=True),
    dict(id="bank", name="Bank transfer", type="BANK_TRANSFER", bankName="Test bank", accountName="Test account", accountNumber="123456789", instructions="", enabled=True),
]
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width":390,"height":844}, permissions=["clipboard-read","clipboard-write"])
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    def mock(route):
        path = route.request.url.split("/api/")[-1]
        if route.request.url.endswith("test-qr.png"):
            route.fulfill(body=png, content_type="image/png")
            return
        assert route.request.method == "GET", "Checks must not write to the API"
        if path == "csrf": value = {"token":"test"}
        elif path == "auth/me": value = {"user":{"id":"test","name":"Test","phone":"081234567890","email":"test@example.test","role":"CUSTOMER"}}
        elif path.startswith("products/review"): value = {"product":product}
        elif path.startswith("cart/variants"): value = {"variants":[{**v,"product":product} for v in variants]}
        elif path == "payment-methods": value = {"methods":methods}
        elif path == "orders/review-order": value = {"order":order}
        else: value = {"products":[], "batches":[], "categories":[]}
        route.fulfill(json=value)
    page.route("**/api/**", mock)
    page.route("**/test-qr.png", mock)
    page.goto(base+"/products/review")
    page.get_by_role("button",name="WHITE",exact=True).click()
    expect(page.get_by_role("button",name="M",exact=True)).to_have_attribute("aria-pressed","true")
    expect(page.get_by_text("This combination is not offered.",exact=False)).to_be_visible()
    page.get_by_role("button",name="L",exact=True).click()
    page.get_by_role("button",name="Add to cart",exact=True).click()
    page.wait_for_url("**/cart")
    quantity = page.get_by_label("Quantity",exact=True)
    expect(quantity).to_have_attribute("max","2")
    quantity.fill("3"); quantity.blur()
    expect(page.get_by_role("button",name="Continue to payment")).to_be_disabled()
    quantity.fill("1"); quantity.blur()
    expect(page.get_by_role("button",name="Continue to payment")).to_be_enabled()
    page.goto(base+"/orders/review-order/payment")
    with page.expect_download() as download:
        page.get_by_role("button",name="Save QR image").click()
    assert download.value.suggested_filename == "ekraf-qris.png"
    page.get_by_role("radio",name="Bank transfer").check()
    for label, value in [("Copy account number","123456789"),("Copy payment amount","12000")]:
        page.get_by_role("button",name=label).click()
        assert page.evaluate("navigator.clipboard.readText()") == value
    order.update(paymentStatus="PARTIALLY_PAID",paymentSubmissions=[dict(id="proof",status="SUBMITTED",phase="BALANCE",amount="6000",submittedAt="2026-11-02T00:00:00Z",methodSnapshot={"name":"QRIS"},transactionReference=None,reviewReason=None)])
    page.reload()
    expect(page.get_by_text("Deposit verified",exact=True)).to_be_visible()
    expect(page.get_by_text("Payment proof is reviewed within 24 hours maximum.",exact=False)).to_be_visible()
    support = page.get_by_role("link",name="Contact EKRAF on WhatsApp").first
    expect(support).to_have_attribute("href", "https://wa.me/6281287845351?text=Hello%20EKRAF%2C%20I%20need%20help%20with%20order%20review-order.")
    page.get_by_role("button",name="Refresh status").click()
    for width in [390,768,1440]:
        page.set_viewport_size({"width":width,"height":1000})
        page.goto(base+"/"); page.wait_for_load_state("networkidle")
        left = page.locator(".hero-tee").bounding_box()
        right = page.locator(".hero-jacket").bounding_box()
        assert left["x"]+left["width"] <= right["x"]
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
    assert not errors, errors
    browser.close()
    print("Customer UX checks passed: variants, cart stock, QR download, clipboard, verification, WhatsApp, responsive hero.")
