use anyhow::{Context, Result};
use handlebars::{handlebars_helper, Handlebars};
use serde_json::json;
use std::collections::HashMap;

// Define helpers using the macro
handlebars_helper!(eq: |x: str, y: str| x == y);
handlebars_helper!(ne: |x: str, y: str| x != y);

pub fn render_template(
    template_content: &str,
    variables: &HashMap<String, String>,
) -> Result<String> {
    let mut reg = Handlebars::new();

    // Configure handlebars
    reg.set_strict_mode(false);

    // Register helpers
    reg.register_helper("eq", Box::new(eq));
    reg.register_helper("ne", Box::new(ne));

    // Convert variables map to JSON value
    let data = json!(variables);

    reg.render_template(template_content, &data)
        .context("Failed to render prompt template")
}
