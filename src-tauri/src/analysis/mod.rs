pub mod symbol_stream;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SymbolProbe {
    pub name: String,
    pub kind: String,
    pub line: usize,
    pub context: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    pub size: u64,
    pub mtime: u64,
    pub fingerprint: String,
}
