#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_cache::FileCache;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_cache_hits() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "Initial content").unwrap();
        let path = file.path().to_path_buf();

        let cache = FileCache::new(10, 1); // 1MB limit

        // 1. 首次读取 - 应该是 Cache Miss
        let start = std::time::Instant::now();
        let content1 = cache.read_file(&path).await.unwrap();
        let elapsed1 = start.elapsed();
        assert_eq!(
            content1,
            "Initial content
"
        );

        // 2. 第二次读取 - 应该是 Cache Hit (极速)
        let start = std::time::Instant::now();
        let content2 = cache.read_file(&path).await.unwrap();
        let elapsed2 = start.elapsed();
        assert_eq!(
            content2,
            "Initial content
"
        );

        println!(
            "First read: {:?}, Second read (Cached): {:?}",
            elapsed1, elapsed2
        );

        // 验证缓存有效性
        assert!(elapsed2 < elapsed1);
    }

    #[tokio::test]
    async fn test_cache_invalidation() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "Old content").unwrap();
        let path = file.path().to_path_buf();

        let cache = FileCache::new(10, 1);

        // 读取并缓存
        cache.read_file(&path).await.unwrap();

        // 外部修改文件
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(f, "New content").unwrap();
            // 注意：某些系统上 metadata 的修改时间分辨率较低，
            // 为了让 metadata 检查生效，我们手动把文件的修改时间往后拨一点（如果需要）
        }

        // 这里的 read_file 应该能检测到 metadata 变化（即便我们还没加 notify）
        // 因为我们在 read_file 中加了 metadata 校验
        let content = cache.read_file(&path).await.unwrap();
        assert_eq!(
            content,
            "New content
"
        );
    }
}
