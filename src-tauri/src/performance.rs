use serde::Serialize;
use tauri::command;

#[derive(Serialize)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub memory_total: Option<u64>,
}

#[command]
pub fn detect_gpu_info() -> Result<GpuInfo, String> {
    // Basic implementation or stub
    // For now, returning a generic info
    Ok(GpuInfo {
        name: "Unknown GPU".to_string(),
        vendor: "Unknown".to_string(),
        memory_total: None,
    })
}

#[command]
pub fn is_on_battery() -> Result<bool, String> {
    // Stub for battery check
    // On macOS/Linux/Windows we might need different implementations
    Ok(false)
}

#[command]
pub fn get_display_refresh_rate() -> Result<f32, String> {
    // Stub for refresh rate
    Ok(60.0)
}
