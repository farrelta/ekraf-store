"""Registration and checkout identity checks with intercepted API responses."""
from playwright.sync_api import sync_playwright, expect
import os

base = os.environ.get("TEST_BASE_URL", "http://localhost:5173")
state = {"user": None, "updates": 0}
product = dict(id="p", name="Keychain", description="", category="Accessories", sellingType="CONTINUOUS", imageKey=None, batches=[])
variant = dict(id="v", price="12000", onHand=5, reserved=0, size="STANDARD", color="STANDARD", type="PHYSICS", active=True, product=product)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width":390,"height":844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    def mock(route):
        path = route.request.url.split("/api/")[-1]
        if path == "csrf": value = {"token":"fixture"}
        elif path == "auth/register":
            data = route.request.post_data_json
            assert data["name"] == "Campus Shopper"
            assert data["phone"] == "+62 812 3456 7890"
            state["user"] = {**data, "id":"fixture", "role":"CUSTOMER"}
            value = {"user":state["user"]}
        elif path == "auth/me":
            if route.request.method == "PATCH":
                state["updates"] += 1
                state["user"]["phone"] = route.request.post_data_json["phone"]
            value = {"user":state["user"]}
        elif path.startswith("cart/variants"): value = {"variants":[variant]}
        elif path == "orders":
            data = route.request.post_data_json
            assert data["customerName"] == "Campus Shopper"
            assert data["customerPhone"] == state["user"]["phone"]
            route.fulfill(status=409, json={"error":"Fixture stops before a real order"})
            return
        else: value = {"products":[], "batches":[], "categories":[]}
        route.fulfill(json=value)
    page.route("**/api/**", mock)
    page.goto(base+"/register?next=/cart")
    page.get_by_label("Name",exact=True).fill("Campus Shopper")
    phone = page.get_by_label("WhatsApp / phone number",exact=True)
    phone.fill("bad phone"); assert not phone.evaluate("el=>el.checkValidity()")
    phone.fill("+62 812 3456 7890"); assert phone.evaluate("el=>el.checkValidity()")
    page.get_by_label("Email",exact=True).fill("shopper@example.test")
    page.get_by_label("Password",exact=True).fill("test-password-12345")
    page.evaluate('localStorage.setItem("ekraf:cart:v3",JSON.stringify([{id:"line",variantId:"v",batchId:null,quantity:1}]))')
    page.get_by_role("button",name="Create account",exact=True).click()
    page.wait_for_url("**/cart")
    page.get_by_role("heading",name="Your cart",exact=True).wait_for()
    page.evaluate('localStorage.setItem("ekraf:cart:v3",JSON.stringify([{id:"line",variantId:"v",batchId:null,quantity:1}]))')
    page.reload()
    expect(page.locator(".contact-summary")).to_contain_text("Campus Shopper")
    expect(page.locator(".contact-summary")).to_contain_text("+62 812 3456 7890")
    page.get_by_role("button",name="Continue to payment").click()
    expect(page.locator(".form-error-summary")).to_contain_text("Fixture stops")
    assert state["updates"] == 0
    state["user"]["phone"] = None
    page.reload()
    expect(page.get_by_role("button",name="Continue to payment")).to_be_disabled()
    page.get_by_role("link",name="Account page",exact=True).click()
    page.get_by_label("WhatsApp / phone number",exact=True).fill("081234567890")
    page.get_by_role("button",name="Save account details").click()
    expect(page.locator(".notice")).to_contain_text("Account details saved")
    page.goto(base+"/cart")
    expect(page.locator(".contact-summary")).to_contain_text("081234567890")
    assert state["updates"] == 1
    assert not errors, errors
    browser.close()
    print("Registration, saved checkout identity, and legacy account-page contact save passed.")
