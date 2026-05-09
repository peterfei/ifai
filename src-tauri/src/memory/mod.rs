//! 持久化记忆系统
//!
//! 轻量极简 + MemGPT 融合 + 实用主义元编程：
//! - 零新依赖（仅使用 dirs, chrono, serde_json）
//! - 纯 Markdown 文件存储
//! - 3 层空间隐喻（Wing/Hall/Room 或 Hall/Room）
//! - 元数据追踪（跨会话学习）

pub mod categories;
pub mod extractor;
pub mod io;
pub mod meta;
pub mod session;
pub mod tool;

// 导出核心类型
pub use categories::{MemoryHall, MemoryPath, Wing, path_schema};
pub use extractor::{ExtractedMemory, build_extraction_prompt, parse_extraction_result, save_extracted_memories, extract_and_save_memories, on_session_end, extract_memories_with_llm, extract_memories_simple};
pub use io::{ifai_dir, memories_file, load_memories, save_memories, append_to_section, format_initial_memories};
pub use meta::{MemoryMetadata, MetadataStore, metadata_file, content_fingerprint};
pub use session::{load_memories_for_injection, inject_memories_into_system_prompt};
pub use tool::{memory_save_schema, handle_memory_save};
