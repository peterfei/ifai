//! 欢迎页动画帧生成工具
//!
//! 使用 Metaball 场 + Lissajous 轨迹算法生成 36 帧有机变形 ASCII 动画。
//! 运行一次生成所有帧文件到 src/bin/ifai/welcome_frames/ 目录。
//!
//! 用法: cargo run --bin gen_welcome_frames

use std::f32::consts::PI;
use std::fs;

const ROWS: usize = 12;
const COLS: usize = 39;
const FRAMES: usize = 36;
const TAU: f32 = 2.0 * PI;

/// Metaball 定义
struct Blob {
    cx: fn(f32) -> f32,
    cy: fn(f32) -> f32,
    radius: f32,
}

/// 字符密度映射：场强阈值 → ASCII 字符
/// 使用阈值映射（非线性），让边缘过渡更自然
struct DensityLevel {
    threshold: f32,
    ch: char,
}

const DENSITY_LEVELS: &[DensityLevel] = &[
    DensityLevel { threshold: 0.40, ch: '.' },
    DensityLevel { threshold: 0.70, ch: ':' },
    DensityLevel { threshold: 1.10, ch: '+' },
    DensityLevel { threshold: 1.60, ch: '*' },
    DensityLevel { threshold: 2.50, ch: '=' },
    DensityLevel { threshold: 4.00, ch: '#' },
];

fn field_to_char(field: f32) -> char {
    for level in DENSITY_LEVELS.iter().rev() {
        if field >= level.threshold {
            return level.ch;
        }
    }
    ' '
}

fn main() {
    let out_dir = "src/bin/ifai/welcome_frames";
    fs::create_dir_all(out_dir).expect("无法创建输出目录");

    // 4 个 Metaball：小半径 + 大范围运动 = 有机不规则形态
    let blobs = [
        // Blob A：水平大范围慢速
        Blob {
            cx: |t| 19.5 + 13.0 * (TAU * t / 36.0).sin(),
            cy: |t| 5.5 + 3.5 * (2.0 * TAU * t / 36.0 + PI / 3.0).sin(),
            radius: 3.8,
        },
        // Blob B：反相水平 + 不同垂直频率
        Blob {
            cx: |t| 19.5 + 10.0 * (TAU * t / 36.0 + PI * 0.8).cos(),
            cy: |t| 5.5 + 4.5 * (1.5 * TAU * t / 36.0 + PI / 4.0).sin(),
            radius: 3.2,
        },
        // Blob C：快速运动，产生触须效果
        Blob {
            cx: |t| 19.5 + 8.0 * (1.5 * TAU * t / 36.0 + PI / 2.0).sin(),
            cy: |t| 5.5 + 3.0 * (TAU * t / 36.0 + PI / 6.0).cos(),
            radius: 2.8,
        },
        // Blob D：对角运动，增加复杂度
        Blob {
            cx: |t| 19.5 + 6.0 * (2.0 * TAU * t / 36.0 + PI).sin(),
            cy: |t| 5.5 + 2.5 * (2.0 * TAU * t / 36.0 + PI * 0.6).cos(),
            radius: 2.5,
        },
    ];

    for frame in 0..FRAMES {
        let t = frame as f32;
        let mut grid = [[0.0f32; COLS]; ROWS];

        for blob in &blobs {
            let bx = (blob.cx)(t);
            let by = (blob.cy)(t);
            for y in 0..ROWS {
                for x in 0..COLS {
                    let dx = x as f32 - bx;
                    let dy = y as f32 - by;
                    let dist_sq = dx * dx + dy * dy;
                    // Metaball: r² / (d² + 1)，但使用 1/√d 衰减使边缘更不规则
                    let field = blob.radius * blob.radius / (dist_sq + 2.0);
                    grid[y][x] += field;
                }
            }
        }

        // 阈值映射为字符
        let mut output = String::new();
        for y in 0..ROWS {
            for x in 0..COLS {
                output.push(field_to_char(grid[y][x]));
            }
            output.push('\n');
        }

        let path = format!("{}/frame_{}.txt", out_dir, frame);
        fs::write(&path, &output).unwrap_or_else(|e| {
            eprintln!("写入 {} 失败: {}", path, e);
            std::process::exit(1);
        });
    }

    // 统计信息
    let mut min_density = 100.0f32;
    let mut max_density = 0.0f32;
    for i in 0..FRAMES {
        let content = fs::read_to_string(format!("{}/frame_{}.txt", out_dir, i)).unwrap();
        let density = content.chars().filter(|c| !c.is_whitespace()).count() as f32
            / content.len() as f32
            * 100.0;
        min_density = min_density.min(density);
        max_density = max_density.max(density);
    }
    println!("✓ 已生成 {} 帧到 {}", FRAMES, out_dir);
    println!("  密度范围: {:.1}% ~ {:.1}%", min_density, max_density);
}
