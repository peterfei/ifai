#!/usr/bin/env python3
"""
Local Model Download Server
============================

用于测试本地模型下载功能的 HTTP 服务器。

启动后提供真实的模型文件下载：
- URL: http://localhost:8080/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf
- 文件: tests/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf
"""

import http.server
import socketserver
import os
from pathlib import Path

# 配置
PORT = 8080
MODELS_DIR = Path(__file__).parent / "models"
MODEL_FILE = MODELS_DIR / "qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf"


class ModelFileHandler(http.server.SimpleHTTPRequestHandler):
    """处理模型文件下载"""

    def do_GET(self):
        # 处理模型文件下载
        if self.path == '/' or self.path == '/model.gguf':
            self.serve_model_file()
        elif self.path == '/health':
            self.serve_health()
        else:
            self.send_error(404, "File not found")

    def serve_model_file(self):
        """提供模型文件下载"""
        if not MODEL_FILE.exists():
            self.send_error(404, f"Model file not found: {MODEL_FILE}")
            return

        file_size = MODEL_FILE.stat().st_size

        self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Disposition', f'attachment; filename="{MODEL_FILE.name}"')
        self.send_header('Content-Length', str(file_size))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()

        # 流式传输文件
        chunk_size = 64 * 1024  # 64KB
        sent = 0

        with open(MODEL_FILE, 'rb') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                    sent += len(chunk)
                except BrokenPipeError:
                    print(f"\n[Server] Client disconnected at {sent} bytes")
                    break

                # 每 1MB 打印进度
                if sent % (1024 * 1024) == 0:
                    print(f"\r[Server] Progress: {sent / file_size * 100:.1f}% ({sent}/{file_size} bytes)", end='')

        print(f"\n[Server] Transfer complete: {sent} bytes")

    def serve_health(self):
        """健康检查"""
        if MODEL_FILE.exists():
            file_size = MODEL_FILE.stat().st_size
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok","file_size":' + str(file_size).encode() + b'}')
        else:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"error","message":"Model file not found"}')

    def log_message(self, format, *args):
        """自定义日志"""
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    # 确保模型目录存在
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    if not MODEL_FILE.exists():
        print(f"⚠️  模型文件不存在: {MODEL_FILE}")
        print(f"请先运行: dd if=/dev/zero of={MODEL_FILE} bs=1m count=10")
        return

    file_size_mb = MODEL_FILE.stat().st_size / (1024 * 1024)

    print(f"""
╔════════════════════════════════════════════════════════════╗
║          Local Model Download Server                        ║
╠════════════════════════════════════════════════════════════╣
║  URL:         http://localhost:{PORT}/model.gguf              ║
║  文件:        {MODEL_FILE.name:20s}                    ║
║  大小:        {file_size_mb:.1f} MB                              ║
║  位置:        {MODELS_DIR}                       ║
╚════════════════════════════════════════════════════════════╝

准备就绪，等待下载请求...
按 Ctrl+C 停止服务器
""")

    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), ModelFileHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Server] 服务器已停止")


if __name__ == '__main__':
    main()
