#!/usr/bin/env python3
"""Screenshot a local file:// page via Chrome DevTools Protocol.

Usage: cdp-shot.py <url> <out.png> <width> <height> [--light] [--full]
"""
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = "/opt/meta-chromium/chrome"
POLICY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webgl-policy.txt")


def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    url, out, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    light = "--light" in sys.argv
    dark = "--dark" in sys.argv
    full = "--full" in sys.argv
    # Optional JS to run after load, before the shot:
    #   --eval "SSN_DEMO.playTake('take-1')"
    eval_expr = None
    if "--eval" in sys.argv:
        eval_expr = sys.argv[sys.argv.index("--eval") + 1]
    wait_s = 3
    if "--wait" in sys.argv:
        wait_s = float(sys.argv[sys.argv.index("--wait") + 1])
    port = 9333
    # Fresh profile per run: a reused profile can restore another project's
    # tabs, and the "first page target" would then be the wrong page.
    # /tmp on this VM flickers (mkdtemp sometimes finds no usable dir), so
    # retry, then fall back to a profile dir inside the project.
    profile = None
    for _attempt in range(10):
        try:
            profile = tempfile.mkdtemp(prefix="cdp-profile-pilot-")
            break
        except FileNotFoundError:
            time.sleep(1)
    if profile is None:
        profile = os.path.join(os.getcwd(), ".cdp-profile-pilot")
        os.makedirs(profile, exist_ok=True)
    # The URL goes on Chrome's command line, not via a later CDP navigate:
    # starting at about:blank and then navigating to a local URL trips this
    # build's Local Network Access checks (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
    cmd = [
        CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
        "--disable-dev-shm-usage",  # /dev/shm is tiny in this VM; without this the renderer crashes
        "--allow-file-access-from-files",
        "--no-proxy-server",
        "--user-data-dir=" + profile,
        "--remote-debugging-port=%d" % port,
        "--hatch-webgl-allowed-domains-file=" + POLICY,
        "--hatch-webgl-allowed-domains-sha256=" + sha256(POLICY),
        "--hide-scrollbars",
        url,
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        # Wait for the DevTools HTTP endpoint.
        ws_url = None
        for _ in range(60):
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=2) as r:
                    targets = json.load(r)
                page = next(t for t in targets if t.get("type") == "page")
                ws_url = page["webSocketDebuggerUrl"]
                break
            except Exception:
                time.sleep(0.5)
        if not ws_url:
            raise SystemExit("DevTools endpoint never came up")
        ws = websocket.create_connection(ws_url, timeout=30)
        mid = [0]

        def send(method, params=None):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get("id") == mid[0]:
                    if "error" in msg:
                        raise SystemExit("CDP error %s: %s" % (method, msg["error"]))
                    return msg.get("result", {})

        def drain_until(event_name, timeout_s=30):
            ws.settimeout(timeout_s)
            end = time.time() + timeout_s
            while time.time() < end:
                try:
                    msg = json.loads(ws.recv())
                except Exception:
                    break
                if msg.get("method") == event_name:
                    return True
            return False

        send("Page.enable")
        send("Runtime.enable")
        if dark:
            # Headless Chrome defaults to a light OS preference; emulate dark
            # so the <head> theme script picks the dark theme.
            send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": "dark"}]})
        send("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": height, "deviceScaleFactor": 1, "mobile": width < 500,
        })
        # The page was loaded from Chrome's command line; wait for it to be
        # fully loaded (it may already be) instead of navigating again.
        for _ in range(60):
            state = send("Runtime.evaluate", {
                "expression": "document.readyState + '|' + location.href",
                "returnByValue": True,
            })
            if state.get("result", {}).get("value", "").startswith("complete|"):
                break
            time.sleep(0.5)
        time.sleep(wait_s)  # let fonts/CDN attempts settle; page is offline-safe
        if light:
            send("Runtime.evaluate", {"expression": "document.documentElement.setAttribute('data-theme','light')"})
            time.sleep(0.5)
        if eval_expr:
            send("Runtime.evaluate", {"expression": eval_expr})
            time.sleep(0.5)
        # Overflow probe: horizontal overflow is the failure we care about.
        # Also print the real URL so a chrome-error page cannot pass silently.
        loc = send("Runtime.evaluate", {
            "expression": "location.href", "returnByValue": True,
        })
        print("url:", loc.get("result", {}).get("value"))
        metrics = send("Runtime.evaluate", {
            "expression": "JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight})",
            "returnByValue": True,
        })
        print("metrics:", metrics["result"]["value"])
        params = {"format": "png"}
        if full:
            params["captureBeyondViewport"] = True
        shot = send("Page.captureScreenshot", params)
        data = base64.b64decode(shot["data"])
        open(out, "wb").write(data)
        print("wrote", out, len(data), "bytes")
        ws.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
