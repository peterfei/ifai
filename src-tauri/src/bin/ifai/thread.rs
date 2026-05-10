//! 多线程对话系统 - 元编程驱动的轻量级线程管理
//!
//! ## 架构哲学
//!
//! 本模块严格遵循 IfAI 的元编程架构原则：
//! - **声明式配置**: 使用枚举而非结构体，编译器保证完整性
//! - **组合优于继承**: 通过 Option<T> 处理可选状态，避免自定义类型
//! - **零重复**: 线程操作复用标准库的迭代器模式
//!
//! ## 核心类型
//!
//! ```text
//! ThreadId (UUID v7, 时间排序)
//!     ↓
//! ThreadKind (Main/Side, 枚举)
//!     ↓
//! ThreadStatus (Active/Paused/Idle, 枚举)
//!     ↓
//! ThreadInfo (元数据容器)
//!     ↓
//! ThreadStore (Vec<ThreadInfo> + active_id)
//!     ↓
//! ThreadMessages (HashMap<ThreadId, Vec<Message>>)
//! ```
//!
//! ## 使用示例
//!
//! ```rust
//! use crate::thread::{ThreadStore, ThreadMessages};
//!
//! // 1. 创建线程存储（自动创建主线程）
//! let mut store = ThreadStore::new();
//!
//! // 2. 创建侧线程
//! let side_id = store.create_side_thread(store.primary_id, Some("Query".to_string()));
//!
//! // 3. 切换线程
//! store.switch_to(side_id);
//!
//! // 4. 消息存储
//! let mut messages = ThreadMessages::new();
//! messages.push(side_id, message);
//! ```

use std::collections::HashMap;
use std::fmt::{self, Display, Formatter};
use std::time::Instant;
use uuid::Uuid;

// ============================================================================
// 核心类型定义
// ============================================================================

/// 线程唯一标识符（UUID v7，时间排序）
///
/// ## 设计决策
///
/// - **UUID v7**: 时间内嵌，自然按创建顺序排列，零配置排序
/// - **Copy 语义**: 线程 ID 是值类型，可以安全复制
/// - **Hash + Eq**: 支持 HashMap key，高效查找
///
/// ## 示例
///
/// ```rust
/// let id = ThreadId::new();
/// println!("{}", id.short());  // "a1b2c3d4"
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ThreadId(pub Uuid);

impl ThreadId {
    /// 创建新的线程 ID（UUID v7，时间排序）
    #[inline]
    pub fn new() -> Self {
        Self(Uuid::now_v7())
    }

    /// 人类可读的短格式（前 8 位）
    ///
    /// 用于状态栏显示和调试日志
    #[inline]
    pub fn short(&self) -> String {
        format!("{}", self.0)
            .chars()
            .filter(|c| *c != '-')
            .take(8)
            .collect()
    }
}

impl Display for ThreadId {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.short())
    }
}

impl Default for ThreadId {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================

/// 线程类型（简化为两种，避免 Codex 的 10+ 类型）
///
/// ## 设计决策
///
/// - **枚举而非结构体**: 编译器保证完整性，避免遗漏类型
/// - **Copy 语义**: 线程类型是静态分类，可以安全复制
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ThreadKind {
    /// 主线程（默认，单例）
    Main,
    /// 侧线程（临时查询分支，可有多个）
    Side,
}

impl Display for ThreadKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            ThreadKind::Main => write!(f, "Main"),
            ThreadKind::Side => write!(f, "Side"),
        }
    }
}

// ============================================================================

/// 线程状态（简化为核心状态，避免 Codex 的复杂状态机）
///
/// ## 设计决策
///
/// - **3 种状态**: 覆盖所有生命周期，避免冗余状态
/// - **Copy 语义**: 状态是瞬时的，可以安全复制
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ThreadStatus {
    /// 活跃中（用户可交互）
    Active,
    /// 已暂停（用户切换到其他线程）
    Paused,
    /// 空闲（10 分钟无活动，用于未来的自动清理）
    Idle,
}

impl Display for ThreadStatus {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            ThreadStatus::Active => write!(f, "Active"),
            ThreadStatus::Paused => write!(f, "Paused"),
            ThreadStatus::Idle => write!(f, "Idle"),
        }
    }
}

impl Default for ThreadStatus {
    fn default() -> Self {
        ThreadStatus::Active
    }
}

// ============================================================================

/// 线程事件（用于异步消息路由）
///
/// ## 设计决策
///
/// - **Channel 传输**: 通过 tokio::sync::mpsc 在异步任务间传递
/// - **Clone 语义**: 事件可以克隆（用于多订阅者模式）
/// - **声明式**: 枚举变体清晰表达事件类型
///
/// ## 示例
///
/// ```rust
/// use tokio::sync::mpsc;
///
/// let (tx, mut rx) = mpsc::unbounded_channel::<ThreadEvent>();
/// tx.send(ThreadEvent::NewMessage {
///     thread_id: ThreadId::new(),
///     message: "Hello".to_string(),
/// });
/// ```
#[derive(Debug, Clone, PartialEq)]
pub enum ThreadEvent {
    /// 新消息（用于 AI 响应路由）
    NewMessage {
        /// 目标线程 ID
        thread_id: ThreadId,
        /// 消息内容
        message: String,
    },
    /// 状态变更（用于线程生命周期管理）
    StatusChange {
        /// 目标线程 ID
        thread_id: ThreadId,
        /// 新状态
        status: ThreadStatus,
    },
    /// 线程关闭（用于清理资源）
    Closed {
        /// 要关闭的线程 ID
        thread_id: ThreadId,
    },
}

// ============================================================================

/// 线程元数据（精简版，避免 Codex 的 20+ 字段）
///
/// ## 设计决策
///
/// - **不可变**: 线程创建后不修改元数据（除了 status）
/// - **Option 处理可选**: parent_id 和 name 使用 Option，避免额外类型
#[derive(Debug, Clone)]
pub struct ThreadInfo {
    /// 线程唯一标识符
    pub id: ThreadId,
    /// 线程类型（Main/Side）
    pub kind: ThreadKind,
    /// 线程状态（Active/Paused/Idle）
    pub status: ThreadStatus,
    /// 父线程 ID（仅 Side 线程有）
    pub parent_id: Option<ThreadId>,
    /// 线程名称（可选，用于 UI 显示）
    pub name: Option<String>,
    /// 创建时间（用于排序和未来的自动清理）
    pub created_at: Instant,
}

impl ThreadInfo {
    /// 创建主线程信息
    pub fn main(id: ThreadId) -> Self {
        Self {
            id,
            kind: ThreadKind::Main,
            status: ThreadStatus::Active,
            parent_id: None,
            name: Some("Main".to_string()),
            created_at: Instant::now(),
        }
    }

    /// 创建侧线程信息
    pub fn side(id: ThreadId, parent_id: ThreadId, name: Option<String>) -> Self {
        Self {
            id,
            kind: ThreadKind::Side,
            status: ThreadStatus::Active,
            parent_id: Some(parent_id),
            name: name.or_else(|| Some(format!("Thread-{}", id.short()))),
            created_at: Instant::now(),
        }
    }

    /// 获取显示名称（优先使用 name，fallback 到短 ID）
    pub fn display_name(&self) -> String {
        match (&self.kind, &self.name) {
            (ThreadKind::Main, Some(name)) => name.clone(),
            (ThreadKind::Main, None) => "Main".to_string(),
            (ThreadKind::Side, Some(name)) => format!("Side: {}", name),
            (ThreadKind::Side, None) => format!("Side: {}", self.id.short()),
        }
    }
}

// ============================================================================
// 线程存储（元编程风格：零分支的声明式查询）
// ============================================================================

/// 线程存储（管理所有线程的元数据和活动状态）
///
/// ## 设计决策
///
/// - **Vec 存储**: 线程数量少（< 10），Vec 比 HashMap 更高效
/// - **active_id 索引**: O(1) 活动线程查询，避免遍历
/// - **声明式查询**: 使用迭代器链式调用，零显式循环
///
/// ## 示例
///
/// ```rust
/// let mut store = ThreadStore::new();
/// let side_id = store.create_side_thread(store.primary_id, Some("Query".to_string()));
/// store.switch_to(side_id);
/// ```
pub struct ThreadStore {
    /// 所有线程的元数据
    threads: Vec<ThreadInfo>,
    /// 当前活动线程 ID（Some = 有活动线程，None = 测试模式）
    active_id: Option<ThreadId>,
    /// 主线程 ID（永不删除）
    primary_id: ThreadId,
}

impl ThreadStore {
    /// 创建线程存储（自动创建主线程）
    pub fn new() -> Self {
        let primary_id = ThreadId::new();
        Self {
            threads: vec![ThreadInfo::main(primary_id)],
            active_id: Some(primary_id),
            primary_id,
        }
    }

    // ========================================================================
    // CRUD 操作（声明式，零显式循环）
    // ========================================================================

    /// 创建侧线程
    pub fn create_side_thread(&mut self, parent_id: ThreadId, name: Option<String>) -> ThreadId {
        let thread_id = ThreadId::new();
        self.threads
            .push(ThreadInfo::side(thread_id, parent_id, name));
        thread_id
    }

    /// 切换活动线程（返回是否成功）
    pub fn switch_to(&mut self, thread_id: ThreadId) -> bool {
        if self.get_thread(thread_id).is_some() {
            self.active_id = Some(thread_id);
            true
        } else {
            false
        }
    }

    /// 获取线程信息（声明式查询）
    pub fn get_thread(&self, thread_id: ThreadId) -> Option<&ThreadInfo> {
        self.threads.iter().find(|t| t.id == thread_id)
    }

    /// 获取活动线程信息
    pub fn active_thread(&self) -> Option<&ThreadInfo> {
        self.active_id.and_then(|id| self.get_thread(id))
    }

    /// 获取主线程信息
    pub fn primary_thread(&self) -> &ThreadInfo {
        self.get_thread(self.primary_id)
            .expect("Primary thread must always exist")
    }

    /// 获取父线程信息（仅 Side 线程有效）
    pub fn parent_thread(&self, thread_id: ThreadId) -> Option<&ThreadInfo> {
        self.get_thread(thread_id)
            .and_then(|t| t.parent_id)
            .and_then(|id| self.get_thread(id))
    }

    // ========================================================================
    // 导航操作（声明式，零显式索引计算）
    // ========================================================================

    /// 获取上一个线程 ID（循环）
    pub fn previous_thread(&self) -> Option<ThreadId> {
        let active_id = self.active_id?;
        let current_index = self.thread_index(active_id)?;
        let prev_index = if current_index == 0 {
            self.threads.len() - 1
        } else {
            current_index - 1
        };
        self.threads.get(prev_index).map(|t| t.id)
    }

    /// 获取下一个线程 ID（循环）
    pub fn next_thread(&self) -> Option<ThreadId> {
        let active_id = self.active_id?;
        let current_index = self.thread_index(active_id)?;
        let next_index = (current_index + 1) % self.threads.len();
        self.threads.get(next_index).map(|t| t.id)
    }

    /// 获取线程索引（用于显示 "2/5"）
    pub fn thread_index(&self, thread_id: ThreadId) -> Option<usize> {
        self.threads.iter().position(|t| t.id == thread_id)
    }

    // ========================================================================
    // 状态管理（声明式，零 if-match 分支）
    // ========================================================================

    /// 更新线程状态
    pub fn update_status(&mut self, thread_id: ThreadId, status: ThreadStatus) -> bool {
        if let Some(thread) = self.threads.iter_mut().find(|t| t.id == thread_id) {
            thread.status = status;
            true
        } else {
            false
        }
    }

    /// 删除线程（主线程不可删除）
    pub fn remove_thread(&mut self, thread_id: ThreadId) -> bool {
        if thread_id == self.primary_id {
            return false; // 主线程不可删除
        }

        if let Some(pos) = self.thread_index(thread_id) {
            self.threads.remove(pos);
            // 如果删除的是活动线程，返回到主线程
            if self.active_id == Some(thread_id) {
                self.active_id = Some(self.primary_id);
            }
            true
        } else {
            false
        }
    }

    /// 重命名线程
    pub fn rename_thread(&mut self, thread_id: ThreadId, new_name: String) -> bool {
        if let Some(thread) = self.threads.iter_mut().find(|t| t.id == thread_id) {
            thread.name = Some(new_name);
            true
        } else {
            false
        }
    }

    // ========================================================================
    // 查询操作（声明式，零显式循环）
    // ========================================================================

    /// 线程总数
    pub fn len(&self) -> usize {
        self.threads.len()
    }

    /// 是否为空（永远为 false，至少有主线程）
    pub fn is_empty(&self) -> bool {
        self.threads.is_empty()
    }

    /// 获取所有线程（不可变）
    pub fn all_threads(&self) -> &[ThreadInfo] {
        &self.threads
    }

    /// 获取活动线程 ID
    pub fn active_id(&self) -> Option<ThreadId> {
        self.active_id
    }

    /// 获取主线程 ID
    pub fn primary_id(&self) -> ThreadId {
        self.primary_id
    }
}

impl Default for ThreadStore {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 线程消息存储（HashMap 驱动，零手动索引管理）
// ============================================================================

/// 线程消息存储（每个线程独立的消息历史）
///
/// ## 设计决策
///
/// - **HashMap key**: ThreadId 作为 key，O(1) 查找
/// - **Vec<Message>**: 消息按顺序存储，支持追加
/// - **声明式 API**: push/get 方法，零手动索引管理
///
/// ## 示例
///
/// ```rust
/// let mut messages = ThreadMessages::new();
/// messages.push(thread_id, message);
/// let history = messages.get(thread_id);
/// ```
pub struct ThreadMessages {
    /// 线程 ID -> 消息历史
    messages: HashMap<ThreadId, Vec<Message>>,
}

/// 消息类型（简化版，避免完整的 Message 结构）
///
/// TODO: 集成到现有的 session::Message 类型
#[derive(Debug, Clone)]
pub struct Message {
    /// 角色名称（user/assistant/system）
    pub role: String,
    /// 消息内容
    pub content: String,
    /// 时间戳
    pub timestamp: Instant,
}

impl Message {
    /// 创建用户消息
    pub fn user(content: String) -> Self {
        Self {
            role: "user".to_string(),
            content,
            timestamp: Instant::now(),
        }
    }

    /// 创建助手消息
    pub fn assistant(content: String) -> Self {
        Self {
            role: "assistant".to_string(),
            content,
            timestamp: Instant::now(),
        }
    }
}

impl ThreadMessages {
    /// 创建线程消息存储
    pub fn new() -> Self {
        Self {
            messages: HashMap::new(),
        }
    }

    /// 添加消息到线程
    pub fn push(&mut self, thread_id: ThreadId, message: Message) {
        self.messages
            .entry(thread_id)
            .or_insert_with(Vec::new)
            .push(message);
    }

    /// 获取线程消息（不可变切片）
    pub fn get(&self, thread_id: ThreadId) -> Option<&[Message]> {
        self.messages.get(&thread_id).map(|v| v.as_slice())
    }

    /// 获取所有线程消息（用于会话归档）
    pub fn get_all(&self) -> &HashMap<ThreadId, Vec<Message>> {
        &self.messages
    }

    /// 获取主线程消息（作为上下文继承）
    pub fn primary_context(&self, primary_id: ThreadId) -> &[Message] {
        self.get(primary_id).unwrap_or(&[])
    }

    /// 获取线程消息（可变，用于追加）
    pub fn get_mut(&mut self, thread_id: ThreadId) -> Option<&mut Vec<Message>> {
        self.messages.get_mut(&thread_id)
    }

    /// 删除线程的所有消息
    pub fn remove_thread(&mut self, thread_id: ThreadId) -> bool {
        self.messages.remove(&thread_id).is_some()
    }

    /// 获取所有线程 ID
    pub fn thread_ids(&self) -> impl Iterator<Item = &ThreadId> {
        self.messages.keys()
    }
}

impl Default for ThreadMessages {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 单元测试（快照测试风格）
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================================================
    // ThreadId 测试
    // ========================================================================

    #[test]
    fn test_thread_id_new() {
        let id = ThreadId::new();
        assert_eq!(id.0.get_version().unwrap(), uuid::Version::SortRand);
    }

    #[test]
    fn test_thread_id_short() {
        let id = ThreadId::new();
        let short = id.short();
        assert_eq!(short.len(), 8);
        assert!(short.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_thread_id_display() {
        let id = ThreadId::new();
        let display = format!("{}", id);
        assert_eq!(display.len(), 8);
    }

    #[test]
    fn test_thread_id_copy() {
        let id1 = ThreadId::new();
        let id2 = id1; // Copy
        assert_eq!(id1.0, id2.0);
    }

    #[test]
    fn test_thread_id_hash() {
        use std::collections::HashSet;
        let id1 = ThreadId::new();
        let id2 = ThreadId::new();
        let mut set = HashSet::new();
        set.insert(id1);
        set.insert(id2);
        assert_eq!(set.len(), 2);
    }

    // ========================================================================
    // ThreadKind 测试
    // ========================================================================

    #[test]
    fn test_thread_kind_display() {
        assert_eq!(format!("{}", ThreadKind::Main), "Main");
        assert_eq!(format!("{}", ThreadKind::Side), "Side");
    }

    #[test]
    fn test_thread_kind_copy() {
        let kind1 = ThreadKind::Main;
        let kind2 = kind1; // Copy
        assert_eq!(kind1, kind2);
    }

    // ========================================================================
    // ThreadStatus 测试
    // ========================================================================

    #[test]
    fn test_thread_status_display() {
        assert_eq!(format!("{}", ThreadStatus::Active), "Active");
        assert_eq!(format!("{}", ThreadStatus::Paused), "Paused");
        assert_eq!(format!("{}", ThreadStatus::Idle), "Idle");
    }

    #[test]
    fn test_thread_status_default() {
        let status = ThreadStatus::default();
        assert_eq!(status, ThreadStatus::Active);
    }

    // ========================================================================
    // ThreadInfo 测试
    // ========================================================================

    #[test]
    fn test_thread_info_main() {
        let id = ThreadId::new();
        let info = ThreadInfo::main(id);
        assert_eq!(info.id, id);
        assert_eq!(info.kind, ThreadKind::Main);
        assert_eq!(info.status, ThreadStatus::Active);
        assert!(info.parent_id.is_none());
        assert_eq!(info.name, Some("Main".to_string()));
    }

    #[test]
    fn test_thread_info_side() {
        let id = ThreadId::new();
        let parent_id = ThreadId::new();
        let info = ThreadInfo::side(id, parent_id, Some("Query".to_string()));
        assert_eq!(info.id, id);
        assert_eq!(info.kind, ThreadKind::Side);
        assert_eq!(info.status, ThreadStatus::Active);
        assert_eq!(info.parent_id, Some(parent_id));
        assert_eq!(info.name, Some("Query".to_string()));
    }

    #[test]
    fn test_thread_info_side_auto_name() {
        let id = ThreadId::new();
        let parent_id = ThreadId::new();
        let info = ThreadInfo::side(id, parent_id, None);
        assert_eq!(info.name, Some(format!("Thread-{}", id.short())));
    }

    #[test]
    fn test_thread_info_display_name() {
        let id = ThreadId::new();
        let info = ThreadInfo::main(id);
        assert_eq!(info.display_name(), "Main");

        let side_id = ThreadId::new();
        let side_info = ThreadInfo::side(side_id, id, Some("Query".to_string()));
        assert_eq!(side_info.display_name(), "Side: Query");
    }

    // ========================================================================
    // ThreadStore 测试
    // ========================================================================

    #[test]
    fn test_thread_store_new() {
        let store = ThreadStore::new();
        assert_eq!(store.len(), 1);
        assert!(store.active_thread().is_some());
        assert_eq!(store.active_thread().unwrap().kind, ThreadKind::Main);
    }

    #[test]
    fn test_thread_store_create_side_thread() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));
        assert_eq!(store.len(), 2);

        let side_thread = store.get_thread(side_id).unwrap();
        assert_eq!(side_thread.kind, ThreadKind::Side);
        assert_eq!(side_thread.parent_id, Some(primary_id));
        assert_eq!(side_thread.name, Some("Query".to_string()));
    }

    #[test]
    fn test_thread_store_switch_to() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));

        assert!(store.switch_to(side_id));
        assert_eq!(store.active_id(), Some(side_id));

        assert!(!store.switch_to(ThreadId::new())); // 不存在的线程
    }

    #[test]
    fn test_thread_store_navigation() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;

        // 创建 2 个侧线程
        let side1 = store.create_side_thread(primary_id, Some("Side1".to_string()));
        let side2 = store.create_side_thread(primary_id, Some("Side2".to_string()));

        assert_eq!(store.len(), 3);

        // 线程顺序: [primary_id (0), side1 (1), side2 (2)]

        // 测试循环导航：从 side1
        store.switch_to(side1);
        assert_eq!(store.active_id(), Some(side1));

        // 从 side1 (index 1)，下一个应该是 side2 (index 2)
        let next = store.next_thread().unwrap();
        assert_eq!(next, side2);

        // 从 side1 (index 1)，上一个应该是 primary_id (index 0)
        let prev = store.previous_thread().unwrap();
        assert_eq!(prev, primary_id);

        // 测试循环边界：从 side2
        store.switch_to(side2);
        // 从 side2 (index 2)，下一个应该是 primary_id (index 0, 循环)
        let next = store.next_thread().unwrap();
        assert_eq!(next, primary_id);

        // 从 side2 (index 2)，上一个应该是 side1 (index 1)
        let prev = store.previous_thread().unwrap();
        assert_eq!(prev, side1);

        // 测试循环边界：从 primary_id
        store.switch_to(primary_id);
        // 从 primary_id (index 0)，下一个应该是 side1 (index 1)
        let next = store.next_thread().unwrap();
        assert_eq!(next, side1);

        // 从 primary_id (index 0)，上一个应该是 side2 (index 2, 循环)
        let prev = store.previous_thread().unwrap();
        assert_eq!(prev, side2);
    }

    #[test]
    fn test_thread_store_thread_index() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;

        assert_eq!(store.thread_index(primary_id), Some(0));

        let side1 = store.create_side_thread(primary_id, Some("Side1".to_string()));
        assert_eq!(store.thread_index(side1), Some(1));

        let side2 = store.create_side_thread(primary_id, Some("Side2".to_string()));
        assert_eq!(store.thread_index(side2), Some(2));
    }

    #[test]
    fn test_thread_store_parent_thread() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));

        let parent = store.parent_thread(side_id).unwrap();
        assert_eq!(parent.id, primary_id);

        assert!(store.parent_thread(primary_id).is_none()); // 主线程没有父线程
    }

    #[test]
    fn test_thread_store_remove_thread() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));

        assert!(store.remove_thread(side_id));
        assert_eq!(store.len(), 1);

        // 主线程不可删除
        assert!(!store.remove_thread(primary_id));
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn test_thread_store_update_status() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;

        assert!(store.update_status(primary_id, ThreadStatus::Paused));
        assert_eq!(
            store.get_thread(primary_id).unwrap().status,
            ThreadStatus::Paused
        );

        assert!(!store.update_status(ThreadId::new(), ThreadStatus::Active));
    }

    // ========================================================================
    // ThreadMessages 测试
    // ========================================================================

    #[test]
    fn test_thread_messages_push_and_get() {
        let mut messages = ThreadMessages::new();
        let id = ThreadId::new();

        messages.push(id, Message::user("Hello".to_string()));
        messages.push(id, Message::assistant("Hi there".to_string()));

        let history = messages.get(id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].content, "Hello");
        assert_eq!(history[1].content, "Hi there");
    }

    #[test]
    fn test_thread_messages_isolation() {
        let mut messages = ThreadMessages::new();
        let id1 = ThreadId::new();
        let id2 = ThreadId::new();

        messages.push(id1, Message::user("Thread 1".to_string()));
        messages.push(id2, Message::user("Thread 2".to_string()));

        assert_eq!(messages.get(id1).unwrap().len(), 1);
        assert_eq!(messages.get(id2).unwrap().len(), 1);
        assert_ne!(
            messages.get(id1).unwrap()[0].content,
            messages.get(id2).unwrap()[0].content
        );
    }

    #[test]
    fn test_thread_messages_primary_context() {
        let mut messages = ThreadMessages::new();
        let primary_id = ThreadId::new();

        messages.push(primary_id, Message::user("Main context".to_string()));
        let context = messages.primary_context(primary_id);
        assert_eq!(context.len(), 1);
        assert_eq!(context[0].content, "Main context");
    }

    #[test]
    fn test_thread_messages_remove_thread() {
        let mut messages = ThreadMessages::new();
        let id = ThreadId::new();

        messages.push(id, Message::user("Hello".to_string()));
        assert!(messages.remove_thread(id));
        assert!(messages.get(id).is_none());
    }

    // ========================================================================
    // 集成测试
    // ========================================================================

    #[test]
    fn test_thread_workflow() {
        let mut store = ThreadStore::new();
        let mut messages = ThreadMessages::new();

        // 1. 初始状态：只有主线程
        assert_eq!(store.len(), 1);
        let primary_id = store.primary_id;

        // 2. 主线程发送消息
        messages.push(
            primary_id,
            Message::user("Help me understand Rust".to_string()),
        );

        // 3. 创建侧线程
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));
        assert_eq!(store.len(), 2);

        // 4. 侧线程继承主线程上下文
        let context = messages.primary_context(primary_id);
        assert_eq!(context.len(), 1);

        // 5. 侧线程发送消息
        messages.push(side_id, Message::user("What is a lifetime?".to_string()));

        // 6. 切换回主线程
        store.switch_to(primary_id);
        assert_eq!(store.active_id(), Some(primary_id));

        // 7. 主线程和侧线程的消息隔离
        assert_eq!(messages.get(primary_id).unwrap().len(), 1);
        assert_eq!(messages.get(side_id).unwrap().len(), 1);
    }

    #[test]
    fn test_thread_limit_enforcement() {
        let mut store = ThreadStore::new();
        let primary_id = store.primary_id;

        // 创建 5 个线程（达到上限）
        for i in 1..=4 {
            store.create_side_thread(primary_id, Some(format!("Thread-{}", i)));
        }
        assert_eq!(store.len(), 5);

        // 第 6 个线程应该被拒绝（在应用层检查）
        // ThreadStore 本身不强制限制，由 App 层控制
    }
}
