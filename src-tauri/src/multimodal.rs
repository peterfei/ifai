/**
 * 多模态功能模块
 * v0.3.0: Vision LLM 集成、OCR、图片分析
 *
 * 架构:
 * - 社区版: 使用本地 MockMultimodalEngine
 * - 商业版: 使用 ifainew-core 的 CommercialMultimodalEngine
 */

use serde::{Deserialize, Serialize};
use std::error::Error;

/// 图片内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageContent {
    /// Base64 编码的图片数据
    pub data: String,
    /// MIME 类型 (image/png, image/jpeg, etc.)
    #[serde(rename = "mime_type")]
    pub mime_type: String,
    /// 原始文件名
    pub name: Option<String>,
    /// 文件大小（字节）
    pub size: Option<usize>,
}

/// 视觉分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionAnalysisResult {
    /// 分析文本描述
    pub description: String,
    /// 提取的代码（如果有）
    pub code: Option<String>,
    /// 语言类型（如果有代码）
    pub language: Option<String>,
    /// 置信度 (0-1)
    pub confidence: Option<f64>,
}

// ============================================================================
// 社区版 Mock 实现（本地，不依赖 ifainew-core）
// ============================================================================

/// 社区版 Mock 多模态引擎
pub struct MockMultimodalEngine;

impl MockMultimodalEngine {
    /// 分析图片 (Mock 实现)
    pub async fn analyze_image(
        image: ImageContent,
        prompt: &str,
    ) -> Result<VisionAnalysisResult, String> {
        // 使用 ifainew-core 的工具函数验证（如果可用）
        #[cfg(feature = "commercial")]
        {
            if let Err(e) = ifainew_core::validate_image_base64(&image.data, &image.mime_type) {
                return Err(format!("图片验证失败: {}", e));
            }
            if let Some(size) = image.size {
                if let Err(e) = ifainew_core::validate_image_size(size, 5) {
                    return Err(e);
                }
            }
        }

        #[cfg(not(feature = "commercial"))]
        {
            // 社区版简单验证
            if image.data.is_empty() {
                return Err("图片数据不能为空".to_string());
            }
        }

        // 模拟延迟
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        Ok(VisionAnalysisResult {
            description: format!(
                "[社区版 Mock] 图片分析模拟响应\n\n提示词: {}\n图片类型: {}\n图片大小: {} 字符\n文件名: {:?}\n\n这是社区版的 Mock 实现。商业版将支持真实的 Vision LLM API 集成，支持以下功能：\n\
                - 截图代码识别\n\
                - OCR 文字识别\n\
                - UI 设计分析\n\
                - 错误信息诊断\n\
                - 数据可视化图表分析",
                prompt,
                image.mime_type,
                image.data.len(),
                image.name
            ),
            code: None,
            language: None,
            confidence: Some(0.5),
        })
    }

    /// 检查是否支持 Vision
    pub fn is_vision_supported() -> bool {
        false // 社区版不支持真实 Vision
    }
}

// ============================================================================
// 商业版实现（使用 ifainew-core，需要商业版 feature）
// ============================================================================

/// 商业版多模态引擎
#[cfg(feature = "commercial")]
pub struct CommercialMultimodalEngine {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

#[cfg(feature = "commercial")]
impl CommercialMultimodalEngine {
    /// 分析图片 (商业版真实实现，使用 ifainew-core)
    pub async fn analyze_image(
        &self,
        image: ImageContent,
        prompt: &str,
    ) -> Result<VisionAnalysisResult, String> {
        use ifainew_core::MultimodalService;

        // 转换为 ifainew-core 的 ImageContent
        let core_image = ifainew_core::ImageContent {
            data: image.data,
            mime_type: image.mime_type,
            name: image.name,
            size: image.size,
        };

        // 使用 ifainew-core 的工具函数验证图片
        if let Err(e) = ifainew_core::validate_image_base64(&core_image.data, &core_image.mime_type) {
            return Err(format!("图片验证失败: {}", e));
        }
        if let Some(size) = core_image.size {
            if let Err(e) = ifainew_core::validate_image_size(size, 5) {
                return Err(e);
            }
        }

        // 创建 ifainew-core 的商业版引擎实例
        let core_engine = ifainew_core::CommercialMultimodalEngine {
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            model: self.model.clone(),
        };

        // 调用 ifainew-core 的商业版引擎
        let core_result = core_engine
            .analyze_image(core_image, prompt)
            .await
            .map_err(|e| e.to_string())?;

        // 转换回本地类型
        Ok(VisionAnalysisResult {
            description: core_result.description,
            code: core_result.code,
            language: core_result.language,
            confidence: core_result.confidence,
        })
    }

    /// 检查是否支持 Vision
    pub fn is_vision_supported(&self) -> bool {
        true // 商业版支持
    }
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 分析图片
#[tauri::command]
pub async fn multimodal_analyze_image(
    image: ImageContent,
    prompt: String,
) -> Result<VisionAnalysisResult, String> {
    println!("[Multimodal] analyze_image called");
    println!("  - mime_type: {}", image.mime_type);
    println!("  - prompt: {}", prompt);
    println!("  - data length: {}", image.data.len());

    // 社区版使用本地 Mock
    MockMultimodalEngine::analyze_image(image, &prompt).await
}

/// 检查是否支持 Vision
#[tauri::command]
pub fn multimodal_is_vision_supported() -> bool {
    MockMultimodalEngine::is_vision_supported()
}

/// v0.3.0: 读取文件并转换为 base64（用于拖拽图片）
#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, String> {
    use std::fs;
    use std::io::Read;

    println!("[Multimodal] read_file_as_base64 called with path: {}", path);

    // 读取文件
    let mut file = fs::File::open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    // 读取文件内容
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // 转换为 base64
    use base64::Engine;
    let base64_string = base64::engine::general_purpose::STANDARD.encode(&buffer);

    println!("[Multimodal] File size: {} bytes, base64 length: {}", buffer.len(), base64_string.len());

    Ok(base64_string)
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_multimodal() {
        let image = ImageContent {
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==".to_string(),
            mime_type: "image/png".to_string(),
            name: Some("test.png".to_string()),
            size: Some(67),
        };

        let result = MockMultimodalEngine::analyze_image(image, "Describe this").await.unwrap();

        assert!(result.description.contains("社区版 Mock"));
        assert!(!MockMultimodalEngine::is_vision_supported());
    }

    #[test]
    fn test_empty_image_data() {
        // 测试空图片数据会被拒绝
        let rt = tokio::runtime::Runtime::new().unwrap();
        let image = ImageContent {
            data: "".to_string(),
            mime_type: "image/png".to_string(),
            name: Some("empty.png".to_string()),
            size: Some(0),
        };

        let result = rt.block_on(MockMultimodalEngine::analyze_image(image, "Test"));
        assert!(result.is_err());
    }
}
