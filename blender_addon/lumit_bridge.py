bl_info = {
    "name": "Lumit Bridge",
    "author": "Lumit",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "View3D",
    "description": "TCP bridge for Lumit Blender agent",
    "category": "Development",
}

import bpy
import json
import socket
import threading
import traceback

HOST = "127.0.0.1"
PORT = 8766
_server_thread = None
_server_running = False


def _handle_client(conn):
    try:
        conn.settimeout(1.5)
        data = b""
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data += chunk

        payload = json.loads(data.decode("utf-8") or "{}")
        code = payload.get("code", "")

        ns = {
            "bpy": bpy,
            "__name__": "__lumit_exec__",
        }

        exec(code, ns, ns)
        response = {"success": True}
    except Exception as exc:
        response = {
            "success": False,
            "error": str(exc),
            "type": exc.__class__.__name__,
            "traceback": traceback.format_exc()[-2000:],
        }

    try:
        conn.sendall(json.dumps(response).encode("utf-8"))
    except Exception:
        pass
    finally:
        conn.close()


def _serve_loop():
    global _server_running
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, PORT))
    sock.listen(5)
    _server_running = True
    print("[Lumit] Blender bridge ready on port 8766")

    while _server_running:
        try:
            conn, _addr = sock.accept()
            _handle_client(conn)
        except Exception:
            continue

    sock.close()


def register():
    global _server_thread
    if _server_thread is not None:
        return

    _server_thread = threading.Thread(target=_serve_loop, daemon=True)
    _server_thread.start()


def unregister():
    # Daemon thread exits when Blender closes.
    pass
