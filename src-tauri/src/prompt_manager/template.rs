use anyhow::{Context, Result};
use handlebars::{handlebars_helper, Context as HandlebarsCtx, Handlebars, Helper, HelperDef, Output, RenderContext, RenderError};
use serde_json::json;
use std::collections::HashMap;

// Define helpers using the macro
handlebars_helper!(eq: |x: str, y: str| x == y);
handlebars_helper!(ne: |x: str, y: str| x != y);

/// Custom helper for `{{include "path/to/file.md"}}` directive.
///
/// Reads the target file relative to `base_path` and injects its content
/// into the template. Fails silently if the file is missing (logs a warning).
pub struct IncludeHelper {
    base_path: String,
}

impl HelperDef for IncludeHelper {
    fn call<'reg: 'rc, 'rc>(
        &self,
        h: &Helper<'rc>,
        _reg: &Handlebars<'reg>,
        _ctx: &HandlebarsCtx,
        _rc: &mut RenderContext,
        out: &mut dyn Output,
    ) -> Result<(), RenderError> {
        let param = h
            .param(0)
            .and_then(|v| v.value().as_str())
            .ok_or_else(|| RenderError::new("include: missing path parameter"))?;

        let path = std::path::Path::new(&self.base_path).join(param);
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                out.write(&content)
                    .map_err(|e| RenderError::new(format!("include: write error: {}", e)))?;
                Ok(())
            }
            Err(e) => {
                // Silent failure — log warning but don't block template rendering
                eprintln!(
                    "[PromptManager] include: failed to read '{}' (resolved: {}): {}",
                    param,
                    path.display(),
                    e
                );
                Ok(())
            }
        }
    }
}

/// Render a Handlebars template with the given variables.
///
/// When `prompt_base_path` is `Some(project_root)`, the `{{include}}` helper
/// is registered, allowing templates to include external files relative to
/// `{project_root}/.ifai/prompts/`.
///
/// When `prompt_base_path` is `None`, the `{{include}}` helper is NOT registered,
/// preserving backward compatibility for callers that do not need file inclusion.
pub fn render_template(
    template_content: &str,
    variables: &HashMap<String, String>,
    prompt_base_path: Option<&str>,
) -> Result<String> {
    let mut reg = Handlebars::new();

    // Configure handlebars
    reg.set_strict_mode(false);

    // Register helpers
    reg.register_helper("eq", Box::new(eq));
    reg.register_helper("ne", Box::new(ne));

    // Register include helper if a base path is provided
    if let Some(base) = prompt_base_path {
        let base_path = format!("{}/.ifai/prompts", base);
        reg.register_helper("include", Box::new(IncludeHelper { base_path }));
    }

    // Convert variables map to JSON value
    let data = json!(variables);

    reg.render_template(template_content, &data)
        .context("Failed to render prompt template")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_include_helper_renders_included_file() {
        let dir = tempfile::tempdir().unwrap();
        let prompts_dir = dir.path().join(".ifai/prompts/protocols");
        std::fs::create_dir_all(&prompts_dir).unwrap();
        std::fs::write(prompts_dir.join("test_include.md"), "included content").unwrap();

        let template = "before {{include \"protocols/test_include.md\"}} after";
        let vars = HashMap::new();
        let result = render_template(template, &vars, Some(dir.path().to_str().unwrap())).unwrap();

        assert_eq!(result, "before included content after");
    }

    #[test]
    fn test_include_helper_silent_fail_on_missing() {
        let template = "before {{include \"nonexistent.md\"}} after";
        let vars = HashMap::new();
        // Should not panic or return error when include target is missing
        let result = render_template(template, &vars, Some("/tmp")).unwrap();

        assert_eq!(result, "before  after");
    }

    #[test]
    fn test_render_without_include_still_works() {
        let template = "hello {{name}}";
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "world".to_string());
        let result = render_template(template, &vars, None).unwrap();
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_variable_substitution_still_works() {
        let template = "{{greeting}} {{name}}!";
        let mut vars = HashMap::new();
        vars.insert("greeting".to_string(), "Hello".to_string());
        vars.insert("name".to_string(), "World".to_string());
        let result = render_template(template, &vars, None).unwrap();
        assert_eq!(result, "Hello World!");
    }
}
