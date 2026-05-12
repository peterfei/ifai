//! 全局配置共享
//!
//! 用于在工具执行器中访问 Session 配置

use crate::agent_system::workflow::runner::ProgressEvent;
use crate::core_traits::ai::AIProviderConfig;
use std::sync::{Arc, RwLock};

/// 全局 Provider Config（用于 Agent 工具访问）
pub static GLOBAL_PROVIDER_CONFIG: RwLock<Option<AIProviderConfig>> = RwLock::new(None);

/// 设置全局 provider_config
pub fn set_global_provider_config(config: AIProviderConfig) {
    *GLOBAL_PROVIDER_CONFIG.write().unwrap() = Some(config);
}

/// 获取全局 provider_config
pub fn get_global_provider_config() -> Option<AIProviderConfig> {
    GLOBAL_PROVIDER_CONFIG.read().unwrap().clone()
}

/// 清除全局 provider_config
pub fn clear_global_provider_config() {
    *GLOBAL_PROVIDER_CONFIG.write().unwrap() = None;
}

/// 全局进度回调（用于 Agent 工具向 TUI 传递进度）
///
/// 使用 Arc<RwLock<Box<dyn Fn>>> 包装，因为 Box<dyn Fn> 不能 clone
pub static GLOBAL_PROGRESS_CALLBACK: RwLock<Option<Arc<RwLock<Box<dyn Fn(ProgressEvent) + Send + Sync>>>>> = RwLock::new(None);

/// 设置全局进度回调
pub fn set_global_progress_callback<F>(callback: F)
where
    F: Fn(ProgressEvent) + Send + Sync + 'static,
{
    *GLOBAL_PROGRESS_CALLBACK.write().unwrap() = Some(Arc::new(RwLock::new(Box::new(callback))));
}

/// 尝试获取全局进度回调的包装版本
///
/// 返回一个可移动的 Box，适合传递给 WorkflowRunner::with_progress_callback
pub fn try_get_progress_callback_wrapper() -> Option<Box<dyn Fn(ProgressEvent) + Send + Sync>> {
    let guard = GLOBAL_PROGRESS_CALLBACK.read().ok()?;
    let callback_arc = guard.as_ref()?.clone();

    // 从 Arc<RwLock<Box>> 中提取一个可移动的包装
    // 注意：这里创建一个新 Box，内部调用 Arc 内的回调
    let wrapper = Box::new(move |event: ProgressEvent| {
        if let Ok(callback) = callback_arc.read() {
            callback(event);
        }
    }) as Box<dyn Fn(ProgressEvent) + Send + Sync>;

    Some(wrapper)
}

/// 清除全局进度回调
pub fn clear_global_progress_callback() {
    *GLOBAL_PROGRESS_CALLBACK.write().unwrap() = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_and_get_provider_config() {
        // 清理初始状态
        clear_global_provider_config();

        let config = AIProviderConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            api_key: "key".to_string(),
            base_url: "url".to_string(),
            models: vec!["model".to_string()],
            protocol: crate::core_traits::ai::AIProtocol::OpenAI,
            enabled: true,
        };

        set_global_provider_config(config.clone());
        let retrieved = get_global_provider_config().unwrap();

        assert_eq!(retrieved.id, config.id);
        assert_eq!(retrieved.api_key, config.api_key);

        clear_global_provider_config();
        assert!(get_global_provider_config().is_none());
    }

    #[test]
    fn test_set_and_clear_progress_callback() {
        // 清理初始状态
        clear_global_progress_callback();

        let callback_called = Arc::new(RwLock::new(false));
        let callback_called_clone = callback_called.clone();

        set_global_progress_callback(move |_event| {
            *callback_called_clone.write().unwrap() = true;
        });

        // 验证可以获取回调
        let wrapper = try_get_progress_callback_wrapper();
        assert!(wrapper.is_some());

        // 调用回调
        if let Some(callback) = wrapper {
            callback(ProgressEvent {
                event_type: "test".to_string(),
                workflow_id: None,
                node_id: None,
                message: None,
                timestamp: 0,
                tool_details: None,
                nodes: None,
                content_delta: None,
                content_finished: None,
                completion_stats: None,
            });
        }

        // 验证回调被调用
        assert!(*callback_called.read().unwrap());

        // 清理后应该返回 None
        clear_global_progress_callback();
        assert!(try_get_progress_callback_wrapper().is_none());
    }

    #[test]
    fn test_callback_without_setting_returns_none() {
        // 清理初始状态
        clear_global_progress_callback();

        // 未设置时应该返回 None
        assert!(try_get_progress_callback_wrapper().is_none());
    }

    #[test]
    fn test_clear_after_execution() {
        // 清理初始状态
        clear_global_progress_callback();

        // 第一次设置和清理
        set_global_progress_callback(|_event| {});
        assert!(try_get_progress_callback_wrapper().is_some());

        clear_global_progress_callback();
        assert!(try_get_progress_callback_wrapper().is_none());

        // 清理后可以重新设置
        set_global_progress_callback(|_event| {});
        assert!(try_get_progress_callback_wrapper().is_some());

        clear_global_progress_callback();
    }
}
