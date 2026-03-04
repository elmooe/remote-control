#!/usr/bin/env python3

import ctypes
import ctypes.util
import logging
import socket as sock

from flask import Flask, render_template, request
from flask_socketio import SocketIO

logging.getLogger("werkzeug").setLevel(logging.ERROR)

app = Flask(__name__)
app.config["SECRET_KEY"] = "remote-control-2026"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

_cg = ctypes.cdll.LoadLibrary(
    ctypes.util.find_library("ApplicationServices") # type: ignore
)

CGFloat    = ctypes.c_double
CGEventRef = ctypes.c_void_p

kCGEventMouseMoved      = 5
kCGEventLeftMouseDown   = 1
kCGEventLeftMouseUp     = 2
kCGEventRightMouseDown  = 3
kCGEventRightMouseUp    = 4
kCGEventLeftMouseDragged = 6
kCGMouseButtonLeft      = 0
kCGMouseButtonRight     = 1
kCGScrollEventUnitPixel = 0
kCGHIDEventTap          = 0

_left_button_held = False

class CGPoint(ctypes.Structure):
    _fields_ = [("x", CGFloat), ("y", CGFloat)]

_cg.CGEventCreate.restype  = CGEventRef
_cg.CGEventCreate.argtypes = [ctypes.c_void_p]

_cg.CGEventCreateMouseEvent.restype  = CGEventRef
_cg.CGEventCreateMouseEvent.argtypes = [
    ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32
]
_cg.CGEventPost.restype  = None
_cg.CGEventPost.argtypes = [ctypes.c_uint32, CGEventRef]
_cg.CFRelease.restype    = None
_cg.CFRelease.argtypes   = [ctypes.c_void_p]
_cg.CGEventGetLocation.restype  = CGPoint
_cg.CGEventGetLocation.argtypes = [CGEventRef]
_cg.CGEventCreateScrollWheelEvent.restype  = CGEventRef
_cg.CGEventCreateScrollWheelEvent.argtypes = [
    ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32,
    ctypes.c_int32, ctypes.c_int32,
]
_cg.CGEventSetIntegerValueField.restype  = None
_cg.CGEventSetIntegerValueField.argtypes = [
    CGEventRef, ctypes.c_uint32, ctypes.c_int64
]

_kCGMouseEventClickState = 1

_cg.CGEventCreateKeyboardEvent.restype  = CGEventRef
_cg.CGEventCreateKeyboardEvent.argtypes = [
    ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool
]
_cg.CGEventKeyboardSetUnicodeString.restype  = None
_cg.CGEventKeyboardSetUnicodeString.argtypes = [
    CGEventRef, ctypes.c_ulong, ctypes.POINTER(ctypes.c_uint16)
]

def _get_pos():
    ev = _cg.CGEventCreate(None)
    pos = _cg.CGEventGetLocation(ev)
    _cg.CFRelease(ev)
    return pos.x, pos.y

def _post_click(event_down, event_up, x, y, button, click_count=1):
    """Post a mouse-down + mouse-up pair with the correct clickCount field."""
    for ev_type in (event_down, event_up):
        ev = _cg.CGEventCreateMouseEvent(None, ev_type, CGPoint(x, y), button)
        _cg.CGEventSetIntegerValueField(ev, _kCGMouseEventClickState, click_count)
        _cg.CGEventPost(kCGHIDEventTap, ev)
        _cg.CFRelease(ev)

def mouse_move_relative(dx, dy):
    global _left_button_held
    ev = _cg.CGEventCreate(None)
    pos = _cg.CGEventGetLocation(ev)
    _cg.CFRelease(ev)
    x, y = pos.x + dx, pos.y + dy
    ev_type = kCGEventLeftMouseDragged if _left_button_held else kCGEventMouseMoved
    mv = _cg.CGEventCreateMouseEvent(None, ev_type, CGPoint(x, y), kCGMouseButtonLeft)
    _cg.CGEventPost(kCGHIDEventTap, mv)
    _cg.CFRelease(mv)

def mouse_click(button="left"):
    x, y = _get_pos()
    if button == "left":
        _post_click(kCGEventLeftMouseDown, kCGEventLeftMouseUp, x, y, kCGMouseButtonLeft, 1)
    else:
        _post_click(kCGEventRightMouseDown, kCGEventRightMouseUp, x, y, kCGMouseButtonRight, 1)

def mouse_double_click():
    """Send the second half of a double-click (clickCount=2).
    The first tap's mouse_click() already sent the clickCount=1 pair."""
    x, y = _get_pos()
    _post_click(kCGEventLeftMouseDown, kCGEventLeftMouseUp, x, y, kCGMouseButtonLeft, 2)

def mouse_scroll(dx, dy):
    ev = _cg.CGEventCreateScrollWheelEvent(
        None, kCGScrollEventUnitPixel, 2, int(dy), int(dx)
    )
    _cg.CGEventPost(kCGHIDEventTap, ev)
    _cg.CFRelease(ev)

def _post_key(virtual_key: int, key_down: bool):
    ev = _cg.CGEventCreateKeyboardEvent(None, virtual_key, key_down)
    _cg.CGEventPost(kCGHIDEventTap, ev)
    _cg.CFRelease(ev)

def key_type(text: str):
    for char in text:
        uni = (ctypes.c_uint16 * 1)(ord(char))
        down = _cg.CGEventCreateKeyboardEvent(None, 0, True)
        _cg.CGEventKeyboardSetUnicodeString(down, 1, uni)
        _cg.CGEventPost(kCGHIDEventTap, down)
        _cg.CFRelease(down)
        up = _cg.CGEventCreateKeyboardEvent(None, 0, False)
        _cg.CGEventKeyboardSetUnicodeString(up, 1, uni)
        _cg.CGEventPost(kCGHIDEventTap, up)
        _cg.CFRelease(up)

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("connect")
def on_connect():
    print(f"  Phone connected   ({request.remote_addr})")

@socketio.on("disconnect")
def on_disconnect():
    print("  Phone disconnected")

@socketio.on("mouse_move")
def on_mouse_move(data):
    mouse_move_relative(data.get("dx", 0), data.get("dy", 0))

@socketio.on("mouse_click")
def on_click(data):
    mouse_click(data.get("button", "left"))

@socketio.on("mouse_double_click")
def on_double_click(_data):
    mouse_double_click()

@socketio.on("mouse_button_down")
def on_mouse_button_down(data):
    global _left_button_held
    _left_button_held = True
    x, y = _get_pos()
    click_count = int(data.get("click_count", 1))
    ev = _cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, CGPoint(x, y), kCGMouseButtonLeft)
    _cg.CGEventSetIntegerValueField(ev, _kCGMouseEventClickState, click_count)
    _cg.CGEventPost(kCGHIDEventTap, ev)
    _cg.CFRelease(ev)

@socketio.on("mouse_button_up")
def on_mouse_button_up(data):
    global _left_button_held
    _left_button_held = False
    x, y = _get_pos()
    click_count = int(data.get("click_count", 1))
    ev = _cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, CGPoint(x, y), kCGMouseButtonLeft)
    _cg.CGEventSetIntegerValueField(ev, _kCGMouseEventClickState, click_count)
    _cg.CGEventPost(kCGHIDEventTap, ev)
    _cg.CFRelease(ev)

@socketio.on("mouse_scroll")
def on_scroll(data):
    mouse_scroll(data.get("dx", 0), data.get("dy", 0))

@socketio.on("key_type")
def on_key_type(data):
    text = data.get("text", "")
    if text:
        key_type(text)

@socketio.on("key_backspace")
def on_key_backspace(data):
    count = max(1, int(data.get("count", 1)))
    for _ in range(count):
        _post_key(51, True)
        _post_key(51, False)

def get_local_ip() -> str:
    s = sock.socket(sock.AF_INET, sock.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()

if __name__ == "__main__":
    ip = get_local_ip()
    url = f"http://{ip}:5001"

    print()
    print("  " + "─" * 30)
    print("    Remote Control Server")
    print()
    print(f"   Open on your phone: {url}")
    print()
    print("  " + "─" * 30)
    print()

    socketio.run(app, host="0.0.0.0", port=5001, debug=False)
