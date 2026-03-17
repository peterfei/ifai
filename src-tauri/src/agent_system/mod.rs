#[cfg(feature = "commercial")]
pub mod base;
#[cfg(feature = "commercial")]
pub mod supervisor;
#[cfg(feature = "commercial")]
pub mod runner;
#[cfg(feature = "commercial")]
pub mod tools;
#[cfg(feature = "commercial")]
pub mod pivo_controller;
#[cfg(feature = "commercial")]
pub mod debugger;
#[cfg(feature = "commercial")]
pub mod persistence;

#[cfg(feature = "commercial")]
pub use base::{AgentStatus, AgentContext};
#[cfg(feature = "commercial")]
pub use supervisor::Supervisor;

#[cfg(not(feature = "commercial"))]
pub struct Supervisor;
#[cfg(not(feature = "commercial"))]
impl Supervisor {
    pub fn new() -> Self { Self }
}