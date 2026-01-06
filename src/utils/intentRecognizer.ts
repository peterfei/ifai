export type IntentType = '/explore' | '/review' | '/test' | '/doc' | '/refactor' | '/proposal';

interface IntentResult {
    type: IntentType;
    confidence: number;
    args: string;
}

interface IntentPattern {
    type: IntentType;
    keywords: string[];
    regex: RegExp;
    minConfidence?: number;
}

const PATTERNS: IntentPattern[] = [
    {
        type: '/explore',
        keywords: ['浏览', '查看', '项目', '结构', '文件', 'explore', 'scan', 'list', 'tree'],
        // 只有当包含明确的浏览意图或者提到了路径/结构时才触发
        regex: /(?:帮我|给我)?(?:浏览|查看|扫描|列出|list|scan|explore)(?:项目|目录|结构|文件)?(?:\s+)?([\w\.\-\/]+)?/i
    },
    {
        type: '/explore',
        keywords: ['文件', '目录', '结构', '项目'],
        // 匹配纯路径或明确的目录查看请求
        regex: /^(?:ls|dir|tree|scan)\s+([\w\.\-\/]+)$|^(?:查看|扫描)(?:项目|目录|结构)$/i
    },
    {
        type: '/review',
        keywords: ['审查', '检查', '看下', 'review', 'check'],
        regex: /(?:帮我|给我)?(?:审查|检查|review|看(?:一)?下)(?:代码|这段代码)?/i
    },
    {
        type: '/test',
        keywords: ['测试', '单元测试', 'test', 'unittest'],
        regex: /(?:帮我|给我)?(?:生成|创建|写(?:个|一份)?)(?:测试|单元测试|test|unittest)/i
    },
    {
        type: '/doc',
        keywords: ['文档', '注释', '说明', 'doc', 'comment'],
        regex: /(?:帮我|给我)?(?:生成|创建|写(?:个|一份)?|添加)(?:文档|注释|说明|doc|comment)/i
    },
    {
        type: '/refactor',
        keywords: ['重构', '优化', '改进', 'refactor', 'optimize'],
        regex: /(?:帮我|给我)?(?:重构|优化|改进|refactor|optimize)(?:代码|这段代码)?/i
    },
    {
        type: '/proposal',
        keywords: ['实现', '功能', '系统', '模块', '架构', '添加', '设计', '方案'],
        // 修复：使用贪婪匹配，并确保匹配到功能关键词
        regex: /(?:实现|添加|创建|开发)(?:新的)?(.+?)(?=功能|系统|模块|架构|$)/i,
        minConfidence: 0.7
    },
    {
        type: '/proposal',
        keywords: ['重构', '优化', '升级'],
        // 修复：使用前瞻断言确保正确匹配
        regex: /(?:重构|优化|升级)(.+?)(?=架构|系统|模块|$)/i,
        minConfidence: 0.65
    }
];

export function recognizeIntent(input: string): IntentResult | null {
    const text = input.trim();
    if (!text) return null;

    // 跳过带有特殊标记的消息（如 [CHAT]），这些消息应该直接发送给 AI
    if (text.startsWith('[CHAT]') || text.startsWith('[SKIP-INTENT]') || text.startsWith('[NO-AGENT]')) {
        return null;
    }

    let bestMatch: IntentResult | null = null;
    let maxScore = 0;

    for (const pattern of PATTERNS) {
        let score = 0;
        let hasKeywordMatch = false;
        let hasRegexMatch = false;

        // 1. Keyword match (优化权重)
        const keywordMatches = pattern.keywords.filter(k => text.includes(k)).length;
        if (keywordMatches > 0) {
            hasKeywordMatch = true;
            // 匹配1个关键词: 0.3分
            // 匹配2个关键词: 0.5分
            // 匹配3+个关键词: 0.7分
            if (keywordMatches >= 3) {
                score += 0.7;
            } else if (keywordMatches >= 2) {
                score += 0.5;
            } else {
                score += 0.3;
            }
        }

        // 2. Regex match
        const match = text.match(pattern.regex);
        if (match) {
            hasRegexMatch = true;
            score += 0.4;

            // 3. 组合加成：同时匹配关键词和正则表达式
            if (hasKeywordMatch) {
                score += 0.2;
            }

            // Extract args if possible (e.g., filename from explore)
            const args = match[1] || text;

            if (score > maxScore) {
                maxScore = score;
                bestMatch = {
                    type: pattern.type,
                    confidence: Math.min(score, 1.0), // 限制最大值为1.0
                    args: args.trim()
                };
            }
        } else if (hasKeywordMatch && keywordMatches >= 2) {
            // 即使没有regex匹配，但有2+个关键词也可能是有效意图
            if (score > maxScore) {
                maxScore = score;
                bestMatch = {
                    type: pattern.type,
                    confidence: Math.min(score, 1.0),
                    args: text
                };
            }
        }
    }

    // Only return if confidence is high enough (caller will also check threshold)
    return bestMatch;
}

/**
 * 检查是否应该触发Agent
 * @param result 意图识别结果
 * @param threshold 置信度阈值(默认0.7)
 * @returns 是否应该触发
 */
export function shouldTriggerAgent(
    result: IntentResult | null,
    threshold: number = 0.7
): boolean {
    return result !== null && result.confidence >= threshold;
}

/**
 * 格式化Agent名称为显示名称
 * @param agentType Agent类型(如 '/explore')
 * @returns 显示名称(如 'Explore')
 */
export function formatAgentName(agentType: IntentType): string {
    const nameMap: Record<IntentType, string> = {
        '/explore': 'Explore',
        '/review': 'Review',
        '/test': 'Test',
        '/doc': 'Doc',
        '/refactor': 'Refactor',
        '/proposal': 'Proposal',
    };
    return nameMap[agentType] || agentType;
}