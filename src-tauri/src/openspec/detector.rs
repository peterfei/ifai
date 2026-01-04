/**
 * OpenSpec CLI 检测
 * v0.2.6 新增
 *
 * 检测 OpenSpec CLI 是否安装并返回状态信息
 */

use serde::{Deserialize, Serialize};
use std::process::Command;

/// OpenSpec 状态信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenspecStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

impl Default for OpenspecStatus {
    fn default() -> Self {
        Self {
            installed: false,
            version: None,
            path: None,
        }
    }
}

/// 检测 OpenSpec CLI 是否安装
pub fn detect_openspec() -> OpenspecStatus {
    // 尝试运行 openspec --version
    match Command::new("openspec").arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                // 解析版本信息
                let version_output = String::from_utf8_lossy(&output.stdout);
                let version = version_output.trim().to_string();

                // 获取 openspec 路径
                let path = get_openspec_path();

                OpenspecStatus {
                    installed: true,
                    version: Some(version),
                    path,
                }
            } else {
                // 命令执行失败
                OpenspecStatus::default()
            }
        }
        Err(_) => {
            // openspec 命令不存在
            OpenspecStatus::default()
        }
    }
}

/// 获取 openspec 可执行文件路径
fn get_openspec_path() -> Option<String> {
    // 在 Unix 系统上使用 which 命令
    #[cfg(unix)]
    {
        match Command::new("which").arg("openspec").output() {
            Ok(output) if output.status.success() => {
                let path = String::from_utf8_lossy(&output.stdout);
                Some(path.trim().to_string())
            }
            _ => None,
        }
    }

    // 在 Windows 系统上使用 where 命令
    #[cfg(windows)]
    {
        match Command::new("where").arg("openspec").output() {
            Ok(output) if output.status.success() => {
                let path = String::from_utf8_lossy(&output.stdout);
                Some(path.trim().to_string())
            }
            _ => None,
        }
    }
}

/// 检测 OpenSpec CLI（用于 Tauri 命令）
#[tauri::command]
pub async fn detect_openspec_cli() -> Result<OpenspecStatus, String> {
    Ok(detect_openspec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_openspec() {
        let status = detect_openspec();
        println!("OpenSpec Status: {:?}", status);
        // 这个测试会根据系统是否安装 openspec 而有不同的结果
    }
}
