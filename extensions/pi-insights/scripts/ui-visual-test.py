"""Rendered-layout regression test for the pi-insights Web UI.

`verify-public-ui.mjs` reads the source; this renders it. The two are
complementary: a static gate cannot see a panel that collapses because a flex
parent shrank it, or a closed dialog that still paints over a third of the
viewport because an author `display` rule outranks the UA rule for `[hidden]`.
Both of those shipped once and are asserted against below.

Runs entirely against `public/` with `?fixture=1`, so it needs no session data
and no backend. Kept out of `npm test` because it needs Python and a browser.

    pip install playwright && playwright install chromium
    python3 scripts/ui-visual-test.py
"""

import http.server
import functools
import socket
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SHOTS = Path("/tmp")
errors: list[str] = []


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def serve() -> tuple[http.server.ThreadingHTTPServer, str]:
    port = free_port()
    handler = functools.partial(QuietHandler, directory=str(PUBLIC))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{port}"


def launch(playwright):
    """Prefer the bundled chromium; fall back to a system Chrome install."""
    try:
        return playwright.chromium.launch(headless=True)
    except Exception:
        return playwright.chromium.launch(headless=True, channel="chrome")


def watch(page, label):
    """In fixture mode the API calls are expected to 404 and fall back, so only
    a missing static asset or a real script error counts as a failure."""

    def on_console(message):
        if message.type != "error":
            return
        if "Failed to load resource" in message.text:
            return  # covered by the response watcher, which knows the URL
        errors.append(f"{label} console: {message.text}")

    def on_response(response):
        if response.status < 400:
            return
        if "/api/" in response.url:
            return  # the deliberate fixture fallback
        errors.append(f"{label} {response.status} for {response.url}")

    page.on("console", on_console)
    page.on("response", on_response)
    page.on("pageerror", lambda e: errors.append(f"{label} pageerror: {e}"))


def settle(page):
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except PlaywrightTimeout:
        pass  # the progress EventSource stays open by design
    page.wait_for_timeout(350)


def check_no_overflow(page, width, label):
    report = page.evaluate(
        """() => {
          const bad = [];
          for (const el of document.querySelectorAll('*')) {
            if (el.classList.contains('sr-only')) continue;
            const cs = getComputedStyle(el);
            if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
            if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
              bad.push(el.tagName + '.' + String(el.className).slice(0, 40));
            }
          }
          return { doc: document.documentElement.scrollWidth, bad: bad.slice(0, 5) };
        }"""
    )
    if report["doc"] > width + 2:
        errors.append(f"{label}: document scrolls horizontally ({report['doc']} > {width})")
    if report["bad"]:
        errors.append(f"{label}: elements clip their own content: {report['bad']}")


def check_no_collapsed_panels(page, label, container=".view"):
    """A card shorter than its own contents means a flex/grid parent shrank it.

    This has bitten twice — `.metric-grid` inside `.view`, then `.detail-facts`
    inside `.detail-body` — so both scroll containers are checked.
    """
    collapsed = page.evaluate(
        """(selector) => {
          const view = document.querySelector(selector);
          if (!view) return ['no ' + selector + ' element'];
          const bad = [];
          for (const child of view.children) {
            const rect = child.getBoundingClientRect();
            let contentBottom = rect.top;
            for (const node of child.querySelectorAll('*')) {
              const r = node.getBoundingClientRect();
              if (r.height > 0) contentBottom = Math.max(contentBottom, r.bottom);
            }
            const slack = rect.bottom - contentBottom;
            if (slack < -2) {
              bad.push(`${child.tagName}.${String(child.className).slice(0, 30)} clipped by ${Math.round(-slack)}px`);
            }
          }
          return bad;
        }""",
        container,
    )
    for item in collapsed:
        errors.append(f"{label}: {item}")


httpd, base = serve()
try:
    with sync_playwright() as playwright:
        browser = launch(playwright)

        page = browser.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        watch(page, "desktop")

        page.goto(f"{base}/?fixture=1#/overview", wait_until="domcontentloaded")
        settle(page)
        page.wait_for_selector(".metric", timeout=15000)

        # A closed detail dialog must take no space and paint nothing.
        closed = page.evaluate(
            """() => {
              const el = document.querySelector('#detail');
              if (!el) return 'missing #detail';
              const r = el.getBoundingClientRect();
              return (r.width || r.height) ? `closed dialog still occupies ${Math.round(r.width)}x${Math.round(r.height)}` : '';
            }"""
        )
        if closed:
            errors.append(closed)

        check_no_overflow(page, 1440, "desktop overview")
        check_no_collapsed_panels(page, "desktop overview")

        for key, view in {"1": "overview", "2": "sessions", "3": "models", "4": "tools", "5": "projects"}.items():
            page.keyboard.press(key)
            page.wait_for_timeout(350)
            if view not in page.evaluate("location.hash"):
                errors.append(f"shortcut {key} did not open the {view} view")
            check_no_overflow(page, 1440, f"desktop {view}")
            check_no_collapsed_panels(page, f"desktop {view}")

        # Session detail opens, then closes cleanly on Escape.
        page.keyboard.press("2")
        page.wait_for_timeout(400)
        rows = page.locator(".data-table tbody tr")
        if rows.count() == 0:
            errors.append("sessions view rendered no rows from the fixture")
        else:
            rows.first.click()
            page.wait_for_timeout(500)
            if page.locator("#detail").evaluate("el => el.hidden"):
                errors.append("clicking a session row did not open the detail dialog")
            check_no_collapsed_panels(page, "session detail", ".detail-body")
            facts = page.locator(".detail-facts .fact").count()
            if facts == 0:
                errors.append("session detail rendered no summary facts")
            page.screenshot(path=str(SHOTS / "pi-insights-detail.png"), full_page=True)
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            if not page.locator("#detail").evaluate("el => el.hidden"):
                errors.append("Escape did not close the detail dialog")

        page.keyboard.press("1")
        page.wait_for_timeout(300)
        for theme in ("light", "dark"):
            page.evaluate(f"document.documentElement.dataset.theme = '{theme}'")
            page.wait_for_timeout(150)
            page.screenshot(path=str(SHOTS / f"pi-insights-{theme}.png"), full_page=True)

        # Charts must actually draw geometry, not just reserve space.
        empty = page.evaluate(
            """() => [...document.querySelectorAll('svg.chart-svg')]
                 .filter(svg => svg.querySelectorAll('path,rect,line,circle,polyline').length === 0)
                 .map(svg => String(svg.getAttribute('class')))"""
        )
        if empty:
            errors.append(f"charts rendered no geometry: {empty}")

        # Mobile: one column, no horizontal scroll, charts still drawn.
        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        watch(mobile, "mobile")
        mobile.goto(f"{base}/?fixture=1#/overview", wait_until="domcontentloaded")
        settle(mobile)
        mobile.wait_for_selector(".metric", timeout=15000)
        check_no_overflow(mobile, 390, "mobile overview")
        mobile.screenshot(path=str(SHOTS / "pi-insights-mobile.png"), full_page=True)
        mobile.evaluate("location.hash = '#/sessions'")
        mobile.wait_for_timeout(500)
        check_no_overflow(mobile, 390, "mobile sessions")

        browser.close()
finally:
    httpd.shutdown()

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)

print("ui-visual-test: ok")
