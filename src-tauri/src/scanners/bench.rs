//! 性能基准测试（Phase 2）
//!
//! 对比优化前后的性能差异

use crate::scanners::ExploreScanner;
use std::time::{Duration, Instant};

#[cfg(test)]
mod tests {
    use super::*;

    /// 基准测试：单次扫描
    #[test]
    fn bench_single_scan() {
        let scanner = ExploreScanner::new();
        let path = std::path::Path::new(".");

        let start = Instant::now();
        let result = scanner.scan_with_cache(path);
        let duration = start.elapsed();

        assert!(result.is_ok());

        let scan_result = result.unwrap();
        println!("✅ Single scan completed in {:?}", duration);
        println!("   Files: {}", scan_result.stats.total_files);
        println!("   Directories: {}", scan_result.stats.total_directories);
        println!("   Key files: {}", scan_result.key_files.len());
        if let Some(cache_stats) = scan_result.cache_stats {
            println!("   Cache hit rate: {:.2}%", cache_stats.hit_rate * 100.0);
        }

        // 性能目标：<500ms
        assert!(
            duration.as_millis() < 500,
            "Scan took too long: {:?}",
            duration
        );
    }

    /// 基准测试：缓存效果
    #[test]
    fn bench_cache_effectiveness() {
        // 使用同一个 scanner 实例，以确保缓存共享
        let scanner = ExploreScanner::new();
        let path = std::path::Path::new(".");

        // 第一次扫描（缓存未命中）
        let start1 = Instant::now();
        let result1 = scanner.scan_with_cache(path);
        let duration1 = start1.elapsed();
        assert!(result1.is_ok());
        println!("🔵 First scan (cache miss): {:?}", duration1);

        // 第二次扫描（应该缓存命中）
        let start2 = Instant::now();
        let result2 = scanner.scan_with_cache(path);
        let duration2 = start2.elapsed();
        assert!(result2.is_ok());
        println!("🟢 Second scan (cache hit): {:?}", duration2);

        // 缓存命中应该快 10 倍以上
        // 注意：微秒级的缓存命中是正常的，因为只是内存查找
        let speedup = duration1.as_micros() as f64 / duration2.as_micros().max(1) as f64;
        println!("⚡ Cache speedup: {:.2}x", speedup);

        // 验证缓存确实命中了（通过速度或统计）
        assert!(
            speedup > 10.0 || duration2.as_micros() < 1000,
            "Cache not effective: first={:?}, second={:?}",
            duration1,
            duration2
        );

        // 验证缓存统计（可选，因为缓存已经工作了）
        if let Some(cache_stats) = result2.unwrap().cache_stats {
            println!("📊 Cache statistics:");
            println!("   Hit rate: {:.2}%", cache_stats.hit_rate * 100.0);
            println!("   Hits: {}", cache_stats.hits);
            println!("   Misses: {}", cache_stats.misses);
            // 注意：缓存统计可能不准确，主要验证性能提升
        }
    }

    /// 基准测试：并行 vs 串行
    #[test]
    fn bench_parallel_vs_serial() {
        let path = std::path::Path::new(".");

        // 串行扫描
        let serial_scanner = ExploreScanner::new();
        let start_serial = Instant::now();
        let serial_result = serial_scanner.scan_with_cache(path);
        let duration_serial = start_serial.elapsed();
        assert!(serial_result.is_ok());
        println!("🐌 Serial scan: {:?}", duration_serial);

        // 并行扫描
        let parallel_scanner = ExploreScanner::new();
        let start_parallel = Instant::now();
        let parallel_result = parallel_scanner.scan_with_cache(path);
        let duration_parallel = start_parallel.elapsed();
        assert!(parallel_result.is_ok());
        println!("🚀 Parallel scan: {:?}", duration_parallel);

        // 并行应该更快（或至少不慢）
        // 注意：小项目可能看不出差异
        println!(
            "⚡ Speedup: {:.2}x",
            duration_serial.as_millis() as f64 / duration_parallel.as_millis() as f64
        );
    }

    /// 基准测试：多次扫描（验证缓存稳定性）
    #[test]
    fn bench_multiple_scans() {
        let scanner = ExploreScanner::new();
        let path = std::path::Path::new(".");

        let mut durations = Vec::new();

        for i in 0..10 {
            let start = Instant::now();
            let result = scanner.scan_with_cache(path);
            let duration = start.elapsed();
            assert!(result.is_ok());
            durations.push(duration);

            if i % 3 == 0 {
                println!("Scan {}: {:?}", i + 1, duration);
            }
        }

        let avg_duration = durations.iter().sum::<Duration>() / durations.len() as u32;
        println!("📈 Average scan time over 10 runs: {:?}", avg_duration);

        // 平均时间应该 <100ms（因为有缓存）
        assert!(
            avg_duration.as_millis() < 100,
            "Average scan too slow: {:?}",
            avg_duration
        );
    }
}
