use serde::{Serialize, Deserialize};
use tree_sitter::{Parser, Language};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Symbol {
    pub name: String,
    pub kind: String,
    pub range: SymbolRange,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SymbolRange {
    pub start_line: usize,
    pub start_col: usize,
    pub end_line: usize,
    pub end_col: usize,
}

pub struct SymbolEngine {
    parser: Parser,
}

impl SymbolEngine {
    pub fn new() -> Self {
        Self {
            parser: Parser::new(),
        }
    }

    /// 根据语言标识提取符号
    pub fn extract_symbols(&mut self, content: &str, language_id: &str) -> Vec<Symbol> {
        let lang = match language_id {
            "rust" => tree_sitter_rust::LANGUAGE.into(),
            "typescript" | "tsx" => tree_sitter_typescript::LANGUAGE_TSX.into(),
            _ => return Vec::new(),
        };

        self.parser.set_language(&lang).ok();
        let tree = self.parser.parse(content, None).unwrap();
        let root_node = tree.root_node();

        let mut symbols = Vec::new();
        self.traverse(root_node, content, &mut symbols);
        symbols
    }

    fn traverse(&self, node: tree_sitter::Node, source: &str, symbols: &mut Vec<Symbol>) {
        let kind = node.kind();
        
        // 识别核心符号类型
        match kind {
            "struct_item" | "enum_item" | "trait_item" | "function_item" | "impl_item" |
            "class_declaration" | "method_definition" | "function_declaration" | "interface_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = &source[name_node.start_byte()..name_node.end_byte()];
                    let range = node.range();
                    
                    symbols.push(Symbol {
                        name: name.to_string(),
                        kind: kind.to_string(),
                        range: SymbolRange {
                            start_line: range.start_point.row,
                            start_col: range.start_point.column,
                            end_line: range.end_point.row,
                            end_col: range.end_point.column,
                        },
                    });
                }
            }
            _ => {}
        }

        // 递归遍历子节点
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.traverse(child, source, symbols);
        }
    }
}

/// 对外暴露的便捷函数
pub fn extract_symbols_from_source(content: &str, language_id: &str) -> Vec<Symbol> {
    let mut engine = SymbolEngine::new();
    engine.extract_symbols(content, language_id)
}
