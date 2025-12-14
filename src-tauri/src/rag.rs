use tauri::{AppHandle, Emitter, command, State};
use std::sync::{Arc, Mutex};
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use text_splitter::{TextSplitter, ChunkConfig};
use ignore::WalkBuilder;
use serde::{Serialize, Deserialize};
use std::fs;
use anyhow::Result;

// Data structure for a text chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub path: String,
    pub content: String,
}

// In-memory vector index
pub struct VectorIndex {
    pub chunks: Vec<Chunk>,
    pub embeddings: Vec<Vec<f32>>,
    pub model: TextEmbedding,
}

impl VectorIndex {
    pub fn new() -> Result<Self> {
        let mut options = InitOptions::new(EmbeddingModel::AllMiniLML6V2);
        options.show_download_progress = true;

        let model = TextEmbedding::try_new(options)?;
        Ok(Self {
            chunks: Vec::new(),
            embeddings: Vec::new(),
            model,
        })
    }

    pub fn add(&mut self, path: String, content: String) -> Result<()> {
        // Split text using characters (simple default)
        // 512 characters roughly corresponds to typical chunk sizes
        let splitter = TextSplitter::new(ChunkConfig::new(512)); 
        let chunks_iter = splitter.chunks(&content); 

        let mut chunk_texts = Vec::new();
        for chunk in chunks_iter {
            chunk_texts.push(chunk.to_string());
        }
        
        if chunk_texts.is_empty() {
            return Ok(());
        }

        // Generate embeddings
        let embeddings = self.model.embed(chunk_texts.clone(), None)?;

        for (i, chunk_text) in chunk_texts.iter().enumerate() {
            let chunk = Chunk {
                id: format!("{}::{}", path, i),
                path: path.clone(),
                content: chunk_text.to_string(),
            };
            self.chunks.push(chunk);
            self.embeddings.push(embeddings[i].clone());
        }
        Ok(())
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<(Chunk, f32)>> {
        // Embedding search requires query embedding. 
        // Note: embed() takes &self in fastembed < 4, but maybe &mut self in 5.x?
        // If it requires mut, we need to change signature.
        // Let's try assume it's immutable first, if compiler complains again, we change.
        // Actually, previous error `cannot borrow self.model as mutable` confirms it needs mut.
        // BUT, wait, `self.model` is `TextEmbedding`. 
        // Why would embedding generation mutate the model? Maybe caching?
        // Let's try `&self` and if it fails, I will use `&mut self`.
        // The error was: `self.model.embed` -> `self` is `&` reference.
        // So `TextEmbedding::embed` takes `&self`? 
        // Wait, if it takes `&self`, then `self.model.embed` should work even if `self` is `&VectorIndex`.
        // Unless `embed` takes `&mut self`.
        
        // Let's check fastembed 5.4.0 docs via guess: usually `embed` is `&self`.
        // Maybe the error was because I tried to use it mutably elsewhere?
        // Ah, the error message: `cannot borrow self.model as mutable`.
        // That means `embed` takes `&mut self`.
        
        // So I must change `search` to `&mut self`.
        Err(anyhow::anyhow!("Force recompile to check signature"))
    }
    
    // Proper search with mut
    pub fn search_mut(&mut self, query: &str, limit: usize) -> Result<Vec<(Chunk, f32)>> {
         let query_embeddings = self.model.embed(vec![query], None)?;
        let q_vec = &query_embeddings[0];

        let mut scores: Vec<(usize, f32)> = self.embeddings.iter().enumerate()
            .map(|(i, vec)| {
                let score = cosine_similarity(q_vec, vec);
                (i, score)
            })
            .collect();
        
        // Sort by score desc
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let results = scores.iter().take(limit).map(|(i, score)| {
            (self.chunks[*i].clone(), *score)
        }).collect();

        Ok(results)
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot_product: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a * norm_b)
}

pub struct RagState {
    pub index: Arc<Mutex<Option<VectorIndex>>>,
}

impl RagState {
    pub fn new() -> Self {
        Self {
            index: Arc::new(Mutex::new(None)),
        }
    }
}

#[command]
pub async fn init_rag_index(app: AppHandle, state: State<'_, RagState>, root_path: String) -> Result<String, String> {
    // Run in background thread
    let index_mutex = state.index.clone();
    let app_handle = app.clone();
    
    // Check if index already initialized
    {
        let mut guard = index_mutex.lock().unwrap();
        if guard.is_none() {
             app_handle.emit("rag-status", "Initializing Embedding Model...").unwrap_or(());
             match VectorIndex::new() {
                Ok(idx) => *guard = Some(idx),
                Err(e) => return Err(format!("Failed to init model: {}", e)),
             }
        }
    }

    app.emit("rag-status", "Scanning files...").unwrap_or(());

    // Spawn indexing task
    std::thread::spawn(move || {
        let walker = WalkBuilder::new(&root_path)
            .hidden(true)
            .git_ignore(true)
            .build();
        
        let mut files_processed = 0;

        for result in walker {
            match result {
                Ok(entry) => {
                    if entry.file_type().map_or(false, |ft| ft.is_file()) {
                        let path = entry.path();
                        if let Some(ext) = path.extension() {
                            let ext_str = ext.to_string_lossy();
                            if ["ts", "tsx", "js", "jsx", "rs", "py", "md", "json", "toml", "css", "html"].contains(&ext_str.as_ref()) {
                                if let Ok(content) = fs::read_to_string(path) {
                                    if let Ok(mut guard) = index_mutex.lock() {
                                        if let Some(index) = guard.as_mut() {
                                            let _ = index.add(path.to_string_lossy().to_string(), content);
                                        }
                                    }
                                    files_processed += 1;
                                    if files_processed % 5 == 0 {
                                         app_handle.emit("rag-progress", files_processed).unwrap_or(());
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => println!("Walk error: {}", e),
            }
        }
        app_handle.emit("rag-status", format!("Indexed {} files. Ready.", files_processed)).unwrap_or(());
    });

    Ok("Indexing started".to_string())
}

#[command]
pub async fn search_semantic(state: State<'_, RagState>, query: String) -> Result<Vec<Chunk>, String> {
    let mut guard = state.index.lock().unwrap(); // Need mutable lock for search_mut
    if let Some(index) = guard.as_mut() {
        let results = index.search_mut(&query, 5).map_err(|e| e.to_string())?;
        Ok(results.into_iter().map(|(chunk, _)| chunk).collect())
    } else {
        Err("Index not initialized".to_string())
    }
}