#!/bin/bash
# run-tests.sh
#
# CLI 测试运行脚本
# 支持并行和串行测试模式、标签过滤

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
TAGS=""
EXCLUDE_TAGS=""

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
    -t, --tags TAGS       按标签过滤（例如: unit,fast,"unit && fast"）
    -e, --exclude-tags TAGS  排除标签（例如: slow,integration）
    -h, --help            显示帮助信息

示例:
    # 串行执行（默认）
    $0

    # 并行执行（推荐）
    $0 --parallel

    # 并行执行 + 测试报告
    $0 -p -r

    # 运行特定标签的测试
    $0 --tags unit
    $0 -t "unit && fast"
    $0 -t smoke

    # 排除慢速测试
    $0 --exclude-tags slow

    # 组合使用：并行 + 单元测试标签
    $0 -p -t unit

环境变量:
    IFAI_PARALLEL_TESTS=1  等同于 --parallel

标签说明:
    • unit: 单元测试（快速、隔离）
    • integration: 集成测试（较慢、依赖外部）
    • fast: 快速测试（< 1 秒）
    • slow: 慢速测试（> 1 秒）
    • smoke: 冒烟测试（核心功能）
    • regression: 回归测试（已知问题）

标签逻辑:
    • tag1,tag2: OR 逻辑（匹配任一标签）
    • "tag1 && tag2": AND 逻辑（同时匹配）
    • "!tag": 排除标签
    • "tag1 && !tag2": 复杂表达式

注意事项:
    • 并行模式要求测试之间完全隔离（无共享状态）
    • 串行模式使用 serial_test 确保测试顺序执行
    • Mock 服务器会自动分配不同端口，支持并发
    • 每个 TestEnv 使用独立的临时目录

EOF
}

# 解析标签表达式（支持 AND, OR, NOT）
parse_tags() {
    local tags_expr="$1"
    local test_tags="$2"

    # 如果没有标签表达式，返回 true
    if [ -z "$tags_expr" ]; then
        return 0
    fi

    # 如果测试没有标签，返回 false
    if [ -z "$test_tags" ]; then
        return 1
    fi

    # 处理 AND 逻辑
    if echo "$tags_expr" | grep -q "&&"; then
        local and_tags=$(echo "$tags_expr" | sed 's/&&/ /g')
        while IFS= read -r tag; do
            tag=$(echo "$tag" | xargs)  # 去除空格
            if [ -n "$tag" ]; then
                if ! echo "$test_tags" | grep -q "$tag"; then
                    return 1
                fi
            fi
        done <<< "$and_tags"
        return 0
    fi

    # 处理 OR 逻辑（逗号分隔）
    if echo "$tags_expr" | grep -q ","; then
        local or_tags=$(echo "$tags_expr" | sed 's/,/ /g')
        while IFS= read -r tag; do
            tag=$(echo "$tag" | xargs)
            if [ -n "$tag" ]; then
                if echo "$test_tags" | grep -q "$tag"; then
                    return 0
                fi
            fi
        done <<< "$or_tags"
        return 1
    fi

    # 单个标签
    if echo "$test_tags" | grep -q "$tags_expr"; then
        return 0
    fi

    return 1
}

# 从生成的测试文件中提取测试名称和标签
extract_tests_by_tags() {
    local generated_dir="$1"
    local include_tags="$2"
    local exclude_tags="$3"
    local test_names=()

    # 遍历所有生成的测试文件
    for test_file in "$generated_dir"/*.rs; do
        [ -f "$test_file" ] || continue

        local current_test=""
        local current_tags=""

        # 逐行解析测试文件
        while IFS= read -r line; do
            # 检测测试函数开始
            if echo "$line" | grep -q "^async fn test_"; then
                current_test=$(echo "$line" | sed 's/async fn test_\([a-z0-9_]*\)(.*/\1/')
                current_tags=""
            fi

            # 提取标签
            if echo "$line" | grep -q "// tags:"; then
                current_tags=$(echo "$line" | sed 's/.*\/\/ tags: \(.*\)/\1/')
            fi

            # 测试函数结束，检查是否匹配
            if echo "$line" | grep -q "^}$" && [ -n "$current_test" ]; then
                local include=true
                local exclude=false

                # 检查包含标签
                if [ -n "$include_tags" ]; then
                    if ! parse_tags "$include_tags" "$current_tags"; then
                        include=false
                    fi
                fi

                # 检查排除标签
                if [ -n "$exclude_tags" ] && [ "$include" = true ]; then
                    if parse_tags "$exclude_tags" "$current_tags"; then
                        exclude=true
                    fi
                fi

                # 如果匹配，添加到列表
                if [ "$include" = true ] && [ "$exclude" = false ]; then
                    test_names+=("$current_test")
                fi

                current_test=""
                current_tags=""
            fi
        done < "$test_file"
    done

    # 输出测试名称（用 | 分隔，供 cargo test --filter 使用）
    local IFS="|"
    echo "${test_names[*]}"
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
        -t|--tags)
            TAGS="$2"
            shift 2
            ;;
        -e|--exclude-tags)
            EXCLUDE_TAGS="$2"
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
if [ -n "$TAGS" ]; then
    echo -e "标签过滤: ${GREEN}${TAGS}${NC}"
fi
if [ -n "$EXCLUDE_TAGS" ]; then
    echo -e "排除标签: ${RED}${EXCLUDE_TAGS}${NC}"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 如果指定了标签，提取匹配的测试名称
if [ -n "$TAGS" ] || [ -n "$EXCLUDE_TAGS" ]; then
    echo -e "${BLUE}🏷️  正在按标签过滤测试...${NC}"
    GENERATED_DIR="src/bin/ifai/tests/generated"
    TAG_FILTER=$(extract_tests_by_tags "$GENERATED_DIR" "$TAGS" "$EXCLUDE_TAGS")

    if [ -z "$TAG_FILTER" ]; then
        echo -e "${RED}❌ 没有找到匹配的测试${NC}"
        echo -e "${YELLOW}提示: 使用 --help 查看标签语法${NC}"
        exit 1
    fi

    # 将 | 分隔的测试名称转换为正则表达式
    FILTER_REGEX=$(echo "$TAG_FILTER" | sed 's/|/|/g')
    MATCH_COUNT=$(echo "$TAG_FILTER" | tr '|' '\n' | wc -l | tr -d ' ')

    echo -e "${GREEN}✓ 找到 ${MATCH_COUNT} 个匹配的测试${NC}"
    echo ""

    # 如果已经指定了 --filter，组合两个过滤器
    if [ -n "$FILTER" ]; then
        FILTER="(${FILTER})|(${FILTER_REGEX})"
    else
        FILTER="$FILTER_REGEX"
    fi
fi

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
