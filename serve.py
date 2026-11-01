# OhMyHome 로컬 서버 — 정적 파일을 내보낸다.
# 앱을 고친 뒤 브라우저가 예전 JS를 캐시에서 섞어 쓰면 모듈 import가 깨지므로 no-cache 헤더를 붙인다.
import http.server
import os
import socket
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


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
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f'OhMyHome: http://localhost:{port}  (끄려면 Ctrl+C)')
    if host == '0.0.0.0' and lan_ip():
        print(f'          http://{lan_ip()}:{port}  (같은 네트워크의 다른 기기에서)')
    http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
