# OhMyHome 로컬 서버 — 정적 파일을 내보낸다.
# 앱을 고친 뒤 브라우저가 예전 JS를 캐시에서 섞어 쓰면 모듈 import가 깨지므로 no-cache 헤더를 붙인다.
# /api/project: 작업 내용을 이 폴더의 ohmyhome-project.json으로 읽고 쓴다 — localhost·IP 어느 주소로 열어도 같은 작업이 보인다.
import http.server
import json
import os
import socket
import sys
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_FILE = os.path.join(ROOT, 'ohmyhome-project.json')
MAX_BYTES = 64 * 1024 * 1024   # 도면 이미지·가구 사진이 들어가도 넉넉하게


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_body(self, code, body=b'', ctype='application/json; charset=utf-8'):
        self.send_response(code)
        self.send_header('X-OhMyHome', '1')   # 앱이 '저장 가능한 서버'인지 알아보는 표시
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] != '/api/project':
            return super().do_GET()
        if not os.path.exists(PROJECT_FILE):
            return self.send_body(200, b'null')   # 아직 저장한 적 없음
        with open(PROJECT_FILE, 'rb') as f:
            self.send_body(200, f.read())

    def do_PUT(self):
        if self.path.split('?')[0] != '/api/project':
            return self.send_body(404, b'{"error":"not found"}')
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n <= MAX_BYTES:
            return self.send_body(413, b'{"error":"too large"}')
        body = self.rfile.read(n)
        try:
            data = json.loads(body)
            assert isinstance(data, dict) and data.get('app') == 'OhMyHome' and isinstance(data.get('plan'), dict)
        except Exception:
            return self.send_body(400, b'{"error":"not an OhMyHome project"}')
        tmp = f'{PROJECT_FILE}.{threading.get_ident()}.tmp'   # 요청마다 따로 (동시에 두 기기에서 저장해도 섞이지 않게)
        with open(tmp, 'wb') as f:
            f.write(body)
        os.replace(tmp, PROJECT_FILE)   # 쓰는 도중 꺼져도 예전 파일이 깨지지 않게
        self.send_body(204)

    def log_message(self, fmt, *args):
        if '/api/project' not in (args[0] if args else ''):   # 자동 저장 요청은 로그에 남기지 않는다
            super().log_message(fmt, *args)


def lan_ip():
    # 바깥으로 나갈 때 쓰는 내 PC 주소 (UDP connect는 패킷을 보내지 않는다)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == '__main__':
    # 기본은 이 PC에서만 열린다. 같은 네트워크의 다른 기기(폰 등)에서 열려면 HOST=0.0.0.0
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8190
    host = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('HOST', '127.0.0.1')
    os.chdir(ROOT)
    print(f'OhMyHome: http://localhost:{port}  (끄려면 Ctrl+C)')
    print(f'          작업 내용 저장: {PROJECT_FILE}')
    if host == '0.0.0.0' and lan_ip():
        print(f'          http://{lan_ip()}:{port}  (같은 네트워크의 다른 기기에서)')
    http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
