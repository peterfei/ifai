import { v4 as uuidv4 } from 'uuid';

export interface MockSnippet {
  id: string;
  title: string;
  language: string;
  code: string;
  createdAt: string;
  tags: string[];
}

export interface GeneratorOptions {
  count?: number;
  languages?: string[];
  complexity?: 'simple' | 'medium' | 'complex';
}

const SAMPLE_CODE = {
  typescript: [
    'console.log("Hello World");',
    'function add(a: number, b: number) { return a + b; }',
    'interface User { id: string; name: string; }'
  ],
  python: [
    'print("Hello World")',
    'def add(a, b):\n    return a + b',
    'class User:\n    def __init__(self, name):\n        self.name = name'
  ],
  rust: [
    'fn main() { println!("Hello World"); }',
    'pub fn add(a: i32, b: i32) -> i32 { a + b }',
    'struct User { name: String, age: u32 }'
  ]
};

export class TestDataGenerator {
  
  /**
   * 生成指定数量的代码片段
   */
  static generateSnippets(options: GeneratorOptions = {}): MockSnippet[] {
    const count = options.count || 10;
    const languages = options.languages || ['typescript', 'python', 'rust'];
    
    return Array.from({ length: count }).map((_, i) => {
      const lang = languages[Math.floor(Math.random() * languages.length)];
      const samples = SAMPLE_CODE[lang as keyof typeof SAMPLE_CODE] || SAMPLE_CODE['typescript'];
      const baseCode = samples[Math.floor(Math.random() * samples.length)];
      
      // 简单模拟不同复杂度
      let code = baseCode;
      if (options.complexity === 'medium') {
        code = code.repeat(5);
      } else if (options.complexity === 'complex') {
        code = code.repeat(20);
      }

      return {
        id: uuidv4(),
        title: `${lang} snippet ${i}`,
        language: lang,
        code: code,
        createdAt: new Date().toISOString(),
        tags: [`tag-${i % 5}`, lang]
      };
    });
  }

  /**
   * 生成模拟对话历史
   */
  static generateConversation(turns: number) {
    return Array.from({ length: turns }).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message content ${i} - ${new Date().toISOString()}`
    }));
  }
}
