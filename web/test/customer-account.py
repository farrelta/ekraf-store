"""Account page regression checks; all API responses are intercepted."""
import os
from playwright.sync_api import sync_playwright, expect
base = os.environ.get("TEST_BASE_URL", "http://localhost:5173")
state = {"user":{"id":"fixture","name":"Campus Shopper","email":"shopper@example.test","phone":"081234567890","role":"CUSTOMER"}}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width":390,"height":844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    def mock(route):
        path = route.request.url.split("/api/")[-1]
        if path == "csrf": value = {"token":"fixture"}
        elif path == "auth/me":
            if route.request.method == "PATCH":
                data = route.request.post_data_json
                if data["email"] != state["user"]["email"] and data.get("currentPassword") != "test-password-12345":
                    route.fulfill(status=400,json={"error":"Enter your current password to change your email address."}); return
                if data["email"] == "taken@example.test":
                    route.fulfill(status=409,json={"error":"This email address is already in use."}); return
                state["user"].update({key:data[key] for key in ["name","email","phone"]})
            value = {"user":state["user"]}
        elif path == "auth/logout": state["user"] = None; value = {}
        else: value = {"products":[],"batches":[],"categories":[]}
        route.fulfill(json=value)
    page.route("**/api/**",mock)
    page.goto(base+"/account")
    expect(page.get_by_label("Name",exact=True)).to_have_value("Campus Shopper")
    page.get_by_label("Name",exact=True).fill("Updated Shopper")
    page.get_by_label("WhatsApp / phone number",exact=True).fill("081111111111")
    page.get_by_role("button",name="Save account details").click()
    expect(page.locator(".notice")).to_contain_text("Account details saved")
    expect(page.get_by_label("Name",exact=True)).to_have_value("Updated Shopper")
    page.get_by_label("Email",exact=True).fill("taken@example.test")
    page.get_by_label("Current password",exact=True).fill("test-password-12345")
    page.get_by_role("button",name="Save account details").click()
    expect(page.locator(".account-page").get_by_role("alert")).to_contain_text("already in use")
    page.get_by_label("Email",exact=True).fill("updated@example.test")
    page.get_by_role("button",name="Save account details").click()
    expect(page.get_by_label("Email",exact=True)).to_have_value("updated@example.test")
    expect(page.get_by_label("Current password",exact=True)).to_have_count(0)
    page.reload()
    expect(page.get_by_label("Email",exact=True)).to_have_value("updated@example.test")
    expect(page.get_by_label("WhatsApp / phone number",exact=True)).to_have_value("081111111111")
    for width in [390,768,1440]:
        page.set_viewport_size({"width":width,"height":1000})
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
        expect(page.get_by_role("navigation",name="Store navigation").get_by_role("link",name="Account",exact=True) if width < 768 else page.get_by_role("link",name="My account",exact=True)).to_be_visible()
    page.get_by_role("button",name="Sign out",exact=True).last.click()
    expect(page.get_by_text("Sign in to view and edit your account.")).to_be_visible()
    expect(page.locator('.account-page').get_by_role('link',name='Sign in',exact=True)).to_have_attribute('href','/sign-in?next=/account')
    assert not errors, errors
    browser.close()
    print("Account editing, validation, persistence, navigation and sign-out checks passed.")
