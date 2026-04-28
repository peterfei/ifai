#!/bin/bash
# run-tests.sh
#
# CLI 测试运行脚本
# 支持并行和串行测试模式

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 默认参数
PARALLEL=false
VERBOSE=false
GENERATE_REPORT=false
RUN_CLI_TESTS=true
RUN_UNIT_TESTS=false
FILTER=""

# 帮助信息
show_help() {
    cat << EOF
${BLUE}CLI 测试运行脚本${NC}

用法: $0 [选项]

选项:
    -p, --parallel        启用并行测试执行（显著提升速度）
    -s, --serial          串行测试执行（默认，使用 serial_test）
    -v, --verbose         详细输出
    -r, --report          生成测试报告（HTML + JSON）
    -u, --unit            运行单元测试（而非 CLI 集成测试）
    -f, --filter PATTERN  过滤测试（例如: test_simple）
    -h, --help            显示帮助信息

示例:
    # 串行执行（默认）
    $0

    # 并行执行（推荐）
    $0 --parallel

    # 并行执行 + 测试报告
    $0 -p -r

    # 运行特定测试
    $0 --filter test_simple

环境变量:
    IFAI_PARALLEL_TESTS=1  等同于 --parallel

注意事项:
    • 并行模式要求测试之间完全隔离（无共享状态）
    • 串行模式使用 serial_test 确保测试顺序执行
    • Mock 服务器会自动分配不同端口，支持并发
    • 每个 TestEnv 使用独立的临时目录

EOF
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--parallel)
            PARALLEL=true
            shift
            ;;
        -s|--serial)
            PARALLEL=false
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -r|--report)
            GENERATE_REPORT=true
            shift
            ;;
        -u|--unit)
            RUN_CLI_TESTS=false
            RUN_UNIT_TESTS=true
            shift
            ;;
        -f|--filter)
            FILTER="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}未知选项: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# 检测环境变量
if [ "$IFAI_PARALLEL_TESTS" = "1" ] || [ "$IFAI_PARALLEL_TESTS" = "true" ]; then
    PARALLEL=true
fi

# 进入 src-tauri 目录
cd "$PROJECT_DIR/src-tauri" || exit 1

# 显示配置
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}CLI 测试运行配置${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "执行模式: $([ "$PARALLEL" = true ] && echo -e "${GREEN}并行${NC} ⚡️" || echo -e "${YELLOW}串行${NC} 🔄")"
echo -e "测试类型: $([ "$RUN_CLI_TESTS" = true ] && echo "CLI 集成测试" || echo "单元测试")"
echo -e "详细输出: $([ "$VERBOSE" = true ] && echo "是" || echo "否")"
echo -e "测试报告: $([ "$GENERATE_REPORT" = true ] && echo "是" || echo "否")"
if [ -n "$FILTER" ]; then
    echo -e "过滤测试: ${FILTER}"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 构建 Cargo 参数
CARGO_ARGS=("test")

if [ "$RUN_CLI_TESTS" = true ]; then
    CARGO_ARGS+=("--test" "integration")
fi

if [ "$VERBOSE" = true ]; then
    CARGO_ARGS+=("--" "--nocapture")
fi

if [ -n "$FILTER" ]; then
    CARGO_ARGS+=("--" "$FILTER")
fi

# 设置环境变量
if [ "$PARALLEL" = true ]; then
    export IFAI_PARALLEL_TESTS=1
    echo -e "${GREEN}⚡️  并行测试模式已启用${NC}"
    echo -e "${GREEN}   测试将并发执行，预期速度提升 3-5x${NC}"
else
    unset IFAI_PARALLEL_TESTS
    echo -e "${YELLOW}🔄 串行测试模式${NC}"
    echo -e "${YELLOW}   测试将顺序执行，确保最大隔离性${NC}"
fi

echo ""

# 记录开始时间
START_TIME=$(date +%s)

# 运行测试
echo -e "${BLUE}🚀 开始运行测试...${NC}"
echo ""

if cargo "${CARGO_ARGS[@]}"; then
    # 测试成功
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ 测试全部通过！${NC}"
    echo -e "${GREEN}   耗时: ${DURATION} 秒${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"

    # 生成测试报告
    if [ "$GENERATE_REPORT" = true ]; then
        echo ""
        echo -e "${BLUE}📊 正在生成测试报告...${NC}"

        REPORT_SCRIPT="$SCRIPT_DIR/generate-test-report.sh"
        if [ -f "$REPORT_SCRIPT" ]; then
            bash "$REPORT_SCRIPT"
        else
            echo -e "${YELLOW}⚠️  测试报告脚本不存在: $REPORT_SCRIPT${NC}"
        fi
    fi

    exit 0
else
    # 测试失败
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}❌ 测试失败${NC}"
    echo -e "${RED}   耗时: ${DURATION} 秒${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"

    exit 1
fi
