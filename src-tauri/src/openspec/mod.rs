/**
 * OpenSpec 集成模块
 * v0.2.6 新增
 *
 * 提供 OpenSpec CLI 检测、验证和集成功能
 */

pub mod detector;

pub use detector::{detect_openspec, detect_openspec_cli, OpenspecStatus};
