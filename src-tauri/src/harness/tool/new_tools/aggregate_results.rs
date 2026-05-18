//! aggregate_results 工具 - 结果聚合工具（Phase 3）
//!
//! 用于聚合多个 Agent 的执行结果

use serde_json::{json, Value};
use crate::harness::tool::ToolError;
use super::adapter::ToolLike;

/// 结果聚合工具
///
/// 支持多种聚合策略：
/// - merge: 合并所有结果
/// - vote: 多数投票
/// - first: 返回第一个成功结果
#[derive(Debug, Clone)]
pub struct AggregateResultsTool;

impl ToolLike for AggregateResultsTool {
    fn schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "results": {
                    "type": "array",
                    "description": "要聚合的结果列表",
                    "items": {
                        "type": "object"
                    }
                },
                "strategy": {
                    "type": "string",
                    "enum": ["merge", "vote", "first"],
                    "description": "聚合策略：merge-合并所有结果，vote-多数投票，first-返回第一个成功结果"
                }
            },
            "required": ["results", "strategy"]
        })
    }

    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        // 解析参数
        let results = args.get("results")
            .and_then(|v| v.as_array())
            .ok_or_else(|| ToolError::InvalidInput(
                "aggregate_results: 缺少或无效的 'results' 参数".to_string()
            ))?;

        let strategy = args.get("strategy")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "aggregate_results: 缺少或无效的 'strategy' 参数".to_string()
            ))?;

        // 根据策略执行聚合
        let result = match strategy {
            "merge" => self.merge_results(results),
            "vote" => self.vote_results(results),
            "first" => self.first_success_result(results),
            _ => return Err(ToolError::InvalidInput(
                format!("aggregate_results: 未知的聚合策略: {}", strategy)
            )),
        };

        result
    }
}

impl AggregateResultsTool {
    /// 合并所有结果
    fn merge_results(&self, results: &[Value]) -> Result<String, ToolError> {
        let merged: Vec<String> = results.iter()
            .enumerate()
            .map(|(i, r)| format!("结果 {}:\n{}", i + 1, r.as_str().unwrap_or("")))
            .collect();

        Ok(merged.join("\n\n---\n\n"))
    }

    /// 多数投票
    fn vote_results(&self, results: &[Value]) -> Result<String, ToolError> {
        if results.is_empty() {
            return Ok("没有结果可供投票".to_string());
        }

        // 统计每个结果的出现次数
        use std::collections::HashMap;
        let mut counts: HashMap<String, usize> = HashMap::new();

        for result in results {
            let key = result.as_str().unwrap_or("").to_string();
            *counts.entry(key).or_insert(0) += 1;
        }

        // 找出出现次数最多的结果
        let most_common = counts.into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(result, _)| result)
            .unwrap_or_else(|| "没有有效结果".to_string());

        Ok(format!("投票结果（多数）:\n{}", most_common))
    }

    /// 返回第一个成功结果
    fn first_success_result(&self, results: &[Value]) -> Result<String, ToolError> {
        for result in results {
            if let Some(s) = result.as_str() {
                if !s.is_empty() && !s.contains("错误") && !s.contains("失败") {
                    return Ok(format!("第一个成功结果:\n{}", s));
                }
            }
        }

        // 如果没有成功结果，返回第一个结果（如果有的话）
        if let Some(first) = results.first() {
            Ok(format!("第一个结果（可能包含错误）:\n{}", first.as_str().unwrap_or("")))
        } else {
            Ok("没有结果".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_results() {
        let tool = AggregateResultsTool;

        let results = json!(["结果1", "结果2", "结果3"]);
        let args = json!({
            "results": results,
            "strategy": "merge"
        });

        let result = tool.execute_tool(&args).unwrap();
        assert!(result.contains("结果 1"));
        assert!(result.contains("结果 2"));
        assert!(result.contains("结果 3"));
    }

    #[test]
    fn test_vote_results() {
        let tool = AggregateResultsTool;

        let results = json!(["选项A", "选项A", "选项B"]);
        let args = json!({
            "results": results,
            "strategy": "vote"
        });

        let result = tool.execute_tool(&args).unwrap();
        assert!(result.contains("选项A"));
        assert!(result.contains("投票结果"));
    }

    #[test]
    fn test_first_success_result() {
        let tool = AggregateResultsTool;

        let results = json!(["错误", "成功结果", "其他结果"]);
        let args = json!({
            "results": results,
            "strategy": "first"
        });

        let result = tool.execute_tool(&args).unwrap();
        assert!(result.contains("成功结果"));
    }
}
