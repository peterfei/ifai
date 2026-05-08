// 🔥 游戏生成断链测试套件
//
// 测试多个不同的游戏生成场景，尝试复现断链问题

use crate::tests::common::*;

/// 测试1：贪吃蛇游戏生成
#[tokio::test]
#[serial_test::serial]
async fn test_snake_game_generation() {
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    eprintln!("\n═══════════════════════════════════════════════════════════════");
    eprintln!("🐍 贪吃蛇游戏生成测试");
    eprintln!("═══════════════════════════════════════════════════════════════");

    match check_provider(&spec) {
        Some(ksrc) => {
            let tenv = make_test_env(&spec, ksrc).await;
            let user_input = "帮我生成一个贪吃蛇游戏，包括HTML、CSS和JavaScript。游戏要有分数统计、难度选择、暂停功能。";

            match call_and_check(&tenv, &[user_input], true).await {
                Ok((stdout, stderr)) => {
                    let combined = format!("{}\n{}", stdout, stderr);

                    let todowrite_count = combined.matches("Updated task list").count();
                    let write_file_count = combined.matches("Successfully wrote").count();
                    let cont_count = combined.matches("Continuing...").count();

                    eprintln!("📊 TodoWrite×{}, write_file×{}, Continuing×{}",
                        todowrite_count, write_file_count, cont_count);

                    let has_chain_break = todowrite_count >= 1 && cont_count == 0;
                    if has_chain_break {
                        eprintln!("❌ 断链确认：TodoWrite 后没有续播");
                    } else {
                        eprintln!("✅ 无断链");
                    }
                }
                Err(e) => {
                    eprintln!("[ERROR] {}", e);
                }
            }
        }
        None => {
            eprintln!("[SKIP] ZHIPU_API_KEY not set");
        }
    }
}

/// 测试2：扫雷游戏生成
#[tokio::test]
#[serial_test::serial]
async fn test_minesweeper_game_generation() {
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    eprintln!("\n═══════════════════════════════════════════════════════════════");
    eprintln!("💣 扫雷游戏生成测试");
    eprintln!("═══════════════════════════════════════════════════════════════");

    match check_provider(&spec) {
        Some(ksrc) => {
            let tenv = make_test_env(&spec, ksrc).await;
            let user_input = "帮我生成一个扫雷游戏，包括HTML、CSS和JavaScript。游戏要有初级、中级、高级难度，计时器，雷区标记功能。";

            match call_and_check(&tenv, &[user_input], true).await {
                Ok((stdout, stderr)) => {
                    let combined = format!("{}\n{}", stdout, stderr);

                    let todowrite_count = combined.matches("Updated task list").count();
                    let write_file_count = combined.matches("Successfully wrote").count();
                    let cont_count = combined.matches("Continuing...").count();

                    eprintln!("📊 TodoWrite×{}, write_file×{}, Continuing×{}",
                        todowrite_count, write_file_count, cont_count);

                    let has_chain_break = todowrite_count >= 1 && cont_count == 0;
                    if has_chain_break {
                        eprintln!("❌ 断链确认：TodoWrite 后没有续播");
                    } else {
                        eprintln!("✅ 无断链");
                    }
                }
                Err(e) => {
                    eprintln!("[ERROR] {}", e);
                }
            }
        }
        None => {
            eprintln!("[SKIP] ZHIPU_API_KEY not set");
        }
    }
}

/// 测试3：Flappy Bird游戏生成
#[tokio::test]
#[serial_test::serial]
async fn test_flappy_bird_game_generation() {
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    eprintln!("\n═══════════════════════════════════════════════════════════════");
    eprintln!("🐦 Flappy Bird游戏生成测试");
    eprintln!("═══════════════════════════════════════════════════════════════");

    match check_provider(&spec) {
        Some(ksrc) => {
            let tenv = make_test_env(&spec, ksrc).await;
            let user_input = "帮我生成一个Flappy Bird游戏，包括HTML、CSS和JavaScript。游戏要有物理引擎、碰撞检测、分数统计、开始界面和结束界面。";

            match call_and_check(&tenv, &[user_input], true).await {
                Ok((stdout, stderr)) => {
                    let combined = format!("{}\n{}", stdout, stderr);

                    let todowrite_count = combined.matches("Updated task list").count();
                    let write_file_count = combined.matches("Successfully wrote").count();
                    let cont_count = combined.matches("Continuing...").count();

                    eprintln!("📊 TodoWrite×{}, write_file×{}, Continuing×{}",
                        todowrite_count, write_file_count, cont_count);

                    let has_chain_break = todowrite_count >= 1 && cont_count == 0;
                    if has_chain_break {
                        eprintln!("❌ 断链确认：TodoWrite 后没有续播");
                    } else {
                        eprintln!("✅ 无断链");
                    }
                }
                Err(e) => {
                    eprintln!("[ERROR] {}", e);
                }
            }
        }
        None => {
            eprintln!("[SKIP] ZHIPU_API_KEY not set");
        }
    }
}

/// 测试4：俄罗斯方块游戏生成
#[tokio::test]
#[serial_test::serial]
async fn test_tetris_game_generation() {
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    eprintln!("\n═══════════════════════════════════════════════════════════════");
    eprintln!("🧱 俄罗斯方块游戏生成测试");
    eprintln!("═══════════════════════════════════════════════════════════════");

    match check_provider(&spec) {
        Some(ksrc) => {
            let tenv = make_test_env(&spec, ksrc).await;
            let user_input = "帮我生成一个俄罗斯方块游戏，包括HTML、CSS和JavaScript。游戏要有7种方块、旋转功能、消除行数统计、等级系统、下一个方块预览。";

            match call_and_check(&tenv, &[user_input], true).await {
                Ok((stdout, stderr)) => {
                    let combined = format!("{}\n{}", stdout, stderr);

                    let todowrite_count = combined.matches("Updated task list").count();
                    let write_file_count = combined.matches("Successfully wrote").count();
                    let cont_count = combined.matches("Continuing...").count();

                    eprintln!("📊 TodoWrite×{}, write_file×{}, Continuing×{}",
                        todowrite_count, write_file_count, cont_count);

                    let has_chain_break = todowrite_count >= 1 && cont_count == 0;
                    if has_chain_break {
                        eprintln!("❌ 断链确认：TodoWrite 后没有续播");
                    } else {
                        eprintln!("✅ 无断链");
                    }
                }
                Err(e) => {
                    eprintln!("[ERROR] {}", e);
                }
            }
        }
        None => {
            eprintln!("[SKIP] ZHIPU_API_KEY not set");
        }
    }
}

/// 测试5：打地鼠游戏生成
#[tokio::test]
#[serial_test::serial]
async fn test_whack_a_mole_game_generation() {
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    eprintln!("\n═══════════════════════════════════════════════════════════════");
    eprintln!("🔨 打地鼠游戏生成测试");
    eprintln!("═══════════════════════════════════════════════════════════════");

    match check_provider(&spec) {
        Some(ksrc) => {
            let tenv = make_test_env(&spec, ksrc).await;
            let user_input = "帮我生成一个打地鼠游戏，包括HTML、CSS和JavaScript。游戏要有多个地鼠洞、随机出现、倒计时、连击系统、最高分记录。";

            match call_and_check(&tenv, &[user_input], true).await {
                Ok((stdout, stderr)) => {
                    let combined = format!("{}\n{}", stdout, stderr);

                    let todowrite_count = combined.matches("Updated task list").count();
                    let write_file_count = combined.matches("Successfully wrote").count();
                    let cont_count = combined.matches("Continuing...").count();

                    eprintln!("📊 TodoWrite×{}, write_file×{}, Continuing×{}",
                        todowrite_count, write_file_count, cont_count);

                    let has_chain_break = todowrite_count >= 1 && cont_count == 0;
                    if has_chain_break {
                        eprintln!("❌ 断链确认：TodoWrite 后没有续播");
                        eprintln!("🚨 复现成功！断链问题已确认！");
                        panic!("断链问题已复现");
                    } else {
                        eprintln!("✅ 无断链");
                    }
                }
                Err(e) => {
                    eprintln!("[ERROR] {}", e);
                }
            }
        }
        None => {
            eprintln!("[SKIP] ZHIPU_API_KEY not set");
        }
    }
}
