//! Preview Server — 内置浏览器预览
//!
//! 基于 Tauri 2 `register_uri_scheme_protocol` 实现自定义 `preview://` 协议，
//! 将本地文件系统路径映射为 URI，供 WebviewWindow 加载渲染。
//! 零 HTTP 服务器、零端口、零生命周期管理。
//!
//! # 安全
//! `sanitize_path` 拒绝所有路径遍历攻击（`../`、`%2e%2e`、绝对路径等）。

use std::path::{Component, Path, PathBuf};

/// 安全化路径：拒绝所有超出 root_dir 的路径访问
///
/// 返回 `root_dir` 下的安全绝对路径。
/// 如果路径尝试逃逸到 `root_dir` 之外，返回 `None`。
pub fn sanitize_path(root_dir: &Path, request_path: &str) -> Option<PathBuf> {
    // 1. URL decode（处理 %2e%2e 等编码攻击）
    let decoded = url_decode(request_path);

    // 2. 拒绝绝对路径
    if decoded.starts_with('/') {
        return None;
    }

    // 3. 解析为 PathBuf 并规范化
    let joined = root_dir.join(&decoded);
    let normalized = normalize_path(&joined);

    // 4. 检查是否仍在 root_dir 下
    if normalized.starts_with(root_dir) {
        Some(normalized)
    } else {
        None
    }
}

/// 简单的 URL 解码（仅处理 %XX 序列）
fn url_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();

    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2 {
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                    continue;
                }
            }
            // 无效的 % 序列，原样保留
            result.push('%');
            result.push_str(&hex);
        } else {
            result.push(c);
        }
    }

    result
}

/// 标准化路径：解析 `.` 和 `..` 组件
fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();

    for component in path.components() {
        match component {
            Component::Normal(_) => components.push(component),
            Component::CurDir => {} // 跳过 `.`
            Component::ParentDir => {
                components.pop(); // 回退 `..`
            }
            c => components.push(c), // 保留 RootDir, Prefix 等
        }
    }

    components.iter().collect()
}

/// 根据文件扩展名推导 MIME 类型
pub fn mime_from_path(path: &Path) -> &'static str {
    const MIME_MAP: &[(&str, &str)] = &[
        ("html", "text/html"),
        ("htm", "text/html"),
        ("js", "application/javascript"),
        ("mjs", "application/javascript"),
        ("css", "text/css"),
        ("png", "image/png"),
        ("jpg", "image/jpeg"),
        ("jpeg", "image/jpeg"),
        ("gif", "image/gif"),
        ("svg", "image/svg+xml"),
        ("ico", "image/x-icon"),
        ("json", "application/json"),
        ("wasm", "application/wasm"),
        ("woff2", "font/woff2"),
        ("woff", "font/woff"),
        ("ttf", "font/ttf"),
        ("otf", "font/otf"),
        ("pdf", "application/pdf"),
        ("txt", "text/plain"),
        ("xml", "application/xml"),
        ("map", "application/json"),
    ];

    path.extension()
        .and_then(|ext| ext.to_str())
        .and_then(|ext| {
            MIME_MAP
                .iter()
                .find(|(k, _)| *k == ext)
                .map(|(_, v)| *v)
        })
        .unwrap_or("application/octet-stream")
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================
    // sanitize_path 表驱动测试
    // =========================================================
    // 每行: (input_path, expected_suffix) or (input_path, None)
    // 添加新攻击向量 = 在数组中加一行

    const ROOT: &str = "/home/user/project";

    #[test]
    fn test_sanitize_normal_paths() {
        let root = Path::new(ROOT);

        let cases = &[
            ("index.html", Some("index.html")),
            ("sub/page.html", Some("sub/page.html")),
            ("a/b/c/style.css", Some("a/b/c/style.css")),
            ("deeply/nested/file.js", Some("deeply/nested/file.js")),
        ];

        for (input, expected) in cases {
            let result = sanitize_path(root, input);
            match expected {
                Some(suffix) => {
                    let expected_path = root.join(suffix);
                    assert_eq!(
                        result,
                        Some(expected_path.clone()),
                        "sanitize_path({:?}, {:?}) 应该返回 {:?}，但得到 {:?}",
                        root,
                        input,
                        expected_path,
                        result
                    );
                }
                None => {
                    assert!(
                        result.is_none(),
                        "sanitize_path({:?}, {:?}) 应该返回 None，但得到 {:?}",
                        root,
                        input,
                        result
                    );
                }
            }
        }
    }

    #[test]
    fn test_sanitize_path_traversal_attacks() {
        let root = Path::new(ROOT);

        let cases = &[
            // 直接路径遍历
            "../etc/passwd",
            "../../etc/passwd",
            "foo/../../../etc/passwd",
            // 多层
            "a/b/../../../../etc/passwd",
            // 不存在的上级
            "safe/../..",
            // 混合正常 + 逃逸
            "valid/../../malicious",
        ];

        for input in cases {
            let result = sanitize_path(root, input);
            assert!(
                result.is_none(),
                "sanitize_path({:?}, {:?}) 应该拒绝路径遍历，但返回 {:?}",
                root,
                input,
                result
            );
        }
    }

    #[test]
    fn test_sanitize_url_encoded_attacks() {
        let root = Path::new(ROOT);

        let cases: &[(&str, Option<&str>)] = &[
            ("%2E%2E/etc/passwd", None),
            // 混合编码 + 正常路径（不逃逸 root_dir，应允许）
            ("safe/%2e%2e/etc/passwd", Some("etc/passwd")),
            // 路径中的编码（不逃逸 root_dir，应允许）
            ("images/%2e%2e/config.json", Some("config.json")),
        ];

        for (input, expected) in cases {
            let result = sanitize_path(root, input);
            match expected {
                Some(suffix) => {
                    let expected_path = root.join(suffix);
                    assert_eq!(result, Some(expected_path.clone()));
                }
                None => {
                    assert!(
                        result.is_none(),
                        "sanitize_path({:?}, {:?}) 应该拒绝编码攻击，但返回 {:?}",
                        root,
                        input,
                        result
                    );
                }
            }
        }
    }

    #[test]
    fn test_sanitize_absolute_paths() {
        let root = Path::new(ROOT);

        let cases = &["/etc/passwd", "/bin/sh", "//etc/hosts"];

        for input in cases {
            let result = sanitize_path(root, input);
            assert!(
                result.is_none(),
                "sanitize_path({:?}, {:?}) 应该拒绝绝对路径，但返回 {:?}",
                root,
                input,
                result
            );
        }
    }

    #[test]
    fn test_sanitize_edge_cases() {
        let root = Path::new(ROOT);

        // 同目录下的 . 和 .. 应正确处理
        assert_eq!(
            sanitize_path(root, "."),
            Some(root.to_path_buf()),
            "当前目录应该解析为 root_dir"
        );
        assert_eq!(
            sanitize_path(root, "./index.html"),
            Some(root.join("index.html")),
            "./ 前缀应该正常工作"
        );
        assert_eq!(
            sanitize_path(root, "sub/./file.html"),
            Some(root.join("sub/file.html")),
            "路径中间的 . 应该被去除"
        );
    }

    // =========================================================
    // mime_from_path 表驱动测试
    // =========================================================

    #[test]
    fn test_mime_from_path() {
        let cases = &[
            ("index.html", "text/html"),
            ("page.htm", "text/html"),
            ("app.js", "application/javascript"),
            ("module.mjs", "application/javascript"),
            ("style.css", "text/css"),
            ("image.png", "image/png"),
            ("photo.jpg", "image/jpeg"),
            ("photo.jpeg", "image/jpeg"),
            ("animation.gif", "image/gif"),
            ("icon.svg", "image/svg+xml"),
            ("favicon.ico", "image/x-icon"),
            ("data.json", "application/json"),
            ("module.wasm", "application/wasm"),
            ("font.woff2", "font/woff2"),
            ("font.woff", "font/woff"),
            ("font.ttf", "font/ttf"),
            ("font.otf", "font/otf"),
            ("doc.pdf", "application/pdf"),
            ("readme.txt", "text/plain"),
            ("data.xml", "application/xml"),
            ("source.js.map", "application/json"),
            // 未知扩展名 -> 默认
            ("file.xyz", "application/octet-stream"),
            ("file", "application/octet-stream"),
        ];

        for (path_str, expected_mime) in cases {
            let path = Path::new(path_str);
            assert_eq!(
                mime_from_path(path),
                *expected_mime,
                "mime_from_path({:?}) 应该返回 {:?}",
                path_str,
                expected_mime
            );
        }
    }
}
