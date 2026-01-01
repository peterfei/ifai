#!/usr/bin/env python3
"""
Mock HTTP Server for Model Download Testing
=============================================

用于测试本地模型下载功能的模拟 HTTP 服务器。

启动方式:
    python mock_server.py

默认地址: http://localhost:8080/model.gguf

功能:
- 生成指定大小的测试文件
- 支持断点续传测试
- 可配置下载速度
"""

import http.server
import socketserver
import time
import argparse
import sys

# 配置
PORT = 8080
FILE_SIZE = 10 * 1024 * 1024  # 默认 10MB 测试文件
SPEED_DELAY = 0.001  # 每块延迟（秒），模拟限速


class SlowFileHandler(http.server.SimpleHTTPRequestHandler):
    """支持限速的文件处理器"""

    def do_GET(self):
        if self.path == '/model.gguf':
            self.send_model_file()
        elif self.path == '/health':
            self.send_health()
        else:
            self.send_error(404, "File not found")

    def send_model_file(self):
        """发送模型文件（分块流式传输）"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Disposition', 'attachment; filename="model.gguf"')
        self.send_header('Content-Length', str(FILE_SIZE))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()

        # 分块发送数据
        chunk_size = 64 * 1024  # 64KB per chunk
        sent = 0

        # 生成模拟数据块
        chunk = b'\x00' * chunk_size

        while sent < FILE_SIZE:
            remaining = FILE_SIZE - sent
            current_chunk = min(chunk_size, remaining)

            # 调整块大小
            if current_chunk < chunk_size:
                chunk = b'\x00' * current_chunk

            try:
                self.wfile.write(chunk)
                sent += current_chunk

                # 打印进度
                progress = (sent / FILE_SIZE) * 100
                print(f"\r[Server] Sending: {progress:.1f}% ({sent}/{FILE_SIZE} bytes)", end='')

                # 限速延迟
                time.sleep(SPEED_DELAY)

            except BrokenPipeError:
                print(f"\n[Server] Client disconnected at {sent} bytes")
                break

        print(f"\n[Server] Transfer complete: {sent} bytes")

    def send_health(self):
        """健康检查"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok","file_size":%d}' % FILE_SIZE)

    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    global PORT, FILE_SIZE, SPEED_DELAY

    parser = argparse.ArgumentParser(description='Mock HTTP server for model download testing')
    parser.add_argument('--port', type=int, default=PORT, help='Server port')
    parser.add_argument('--size', type=int, default=FILE_SIZE, help='File size in bytes')
    parser.add_argument('--delay', type=float, default=SPEED_DELAY, help='Delay per chunk (seconds)')

    args = parser.parse_args()

    # 更新全局配置
    PORT = args.port
    FILE_SIZE = args.size
    SPEED_DELAY = args.delay

    size_mb = FILE_SIZE / 1024 / 1024
    speed_mb = (64 * 1024) / (SPEED_DELAY * 1024 * 1024) if SPEED_DELAY > 0 else 999

    print(f"""
╔════════════════════════════════════════════════════════════╗
║           Mock Model Download Server                       ║
╠════════════════════════════════════════════════════════════╣
║  URL:        http://localhost:{PORT}                        ║
║  File:       /model.gguf                                   ║
║  Size:       {size_mb:.1f} MB                              ║
║  Speed:      ~{speed_mb:.1f} MB/s                          ║
╚════════════════════════════════════════════════════════════╝

Press Ctrl+C to stop
""")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SlowFileHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[Server] Shutting down...")
            httpd.shutdown()


if __name__ == '__main__':
    main()
