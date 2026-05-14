//! 使用 #[derive(Tool)] 宏的新工具
//!
//! 这个模块包含使用新的元编程工具系统创建的工具。
//! 它们与传统的手动实现工具（如 ShellToolsExecutor）并存，
//! 作为新架构的演示和验证。

pub mod ping;
pub mod read_file;
pub mod write_file;
pub mod edit_file;
pub mod web_search;
pub mod cache;
pub mod cached_adapter;
pub mod adapter;

#[cfg(test)]
mod integration_test;

#[cfg(test)]
mod read_file_comparison_test;

#[cfg(test)]
mod write_file_comparison_test;

#[cfg(test)]
mod edit_file_comparison_test;

pub use ping::{PingTool, PingResult, PingError};
pub use read_file::{ReadFileTool, ReadFileResult, ReadFileError};
pub use write_file::{WriteFileTool, WriteFileResult, WriteFileError};
pub use edit_file::{EditFileTool, EditFileResult, EditFileError};
pub use web_search::{WebSearchTool, WebSearchResult, WebSearchError, SearchResult, BochaConfig};
pub use cache::{SearchCache, CacheStats};
pub use cached_adapter::CachedWebSearchAdapter;
pub use adapter::{ToolLike, MacroToolAdapter, PingToolAdapter, ReadFileAdapter, WriteFileAdapter, EditFileAdapter, WebSearchAdapter};
