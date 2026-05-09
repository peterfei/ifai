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
pub use categories::{path_schema, MemoryHall, MemoryPath, Wing};
pub use extractor::{
    build_extraction_prompt, extract_and_save_memories, extract_memories_simple,
    extract_memories_with_llm, on_session_end, parse_extraction_result, save_extracted_memories,
    ExtractedMemory,
};
pub use io::{
    append_to_section, format_initial_memories, ifai_dir, load_memories, memories_file,
    save_memories,
};
pub use meta::{content_fingerprint, metadata_file, MemoryMetadata, MetadataStore};
pub use session::{inject_memories_into_system_prompt, load_memories_for_injection};
pub use tool::{handle_memory_save, memory_save_schema};
