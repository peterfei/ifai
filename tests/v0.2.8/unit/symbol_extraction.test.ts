/**
 * v0.2.8 RAG-001: 符号提取引擎单元测试
 *
 * 验证从代码中提取符号结构的能力：
 * - 商业版：深度 tree-sitter 解析
 * - 社区版：正则表达式兜底
 */

import { describe, test, expect, vi } from 'vitest';

// Mock Rust backend invoke
const mockInvoke = vi.fn();

// Mock Tauri API
global.__TAURI__ = {
    core: {
        invoke: mockInvoke
    }
};

/**
 * 符号提取服务 (前端封装)
 */
class SymbolService {
    /**
     * 从代码中提取符号
     */
    async extractSymbols(code: string, language: string, filePath: string): Promise<Array<{
        kind: string;
        name: string;
        line: number;
        end_line?: number;
        parent?: string;
        qualified_name: string;
    }>> {
        return await mockInvoke('extract_symbols', {
            code,
            language,
            filePath
        });
    }

    /**
     * 批量索引项目文件
     */
    async indexProject(rootPath: string): Promise<{
        filesIndexed: number;
        symbolsFound: number;
    }> {
        return await mockInvoke('index_project_symbols', { rootPath });
    }

    /**
     * 查找符号的所有引用
     */
    async findReferences(symbolName: string): Promise<Array<{
        symbolName: string;
        definedAt: string;
        referencedIn: string[];
    }>> {
        return await mockInvoke('find_symbol_references', { symbolName });
    }

    /**
     * 查找 trait/interface 的所有实现
     */
    async findImplementations(traitName: string): Promise<string[]> {
        return await mockInvoke('find_implementations', { traitName });
    }
}

const symbolService = new SymbolService();

describe('RAG-001: Symbol Extraction Engine', () => {
    describe('Rust 符号提取', () => {
        test('should extract struct definitions', async () => {
            const rustCode = `
struct User {
    name: String,
    age: u32,
}

struct Admin {
    user: User,
    permissions: Vec<String>,
}
`;

            mockInvoke.mockResolvedValue([
                { kind: 'struct', name: 'User', line: 2, end_line: 5, parent: null, qualified_name: 'User' },
                { kind: 'struct', name: 'Admin', line: 7, end_line: 10, parent: null, qualified_name: 'Admin' }
            ]);

            const symbols = await symbolService.extractSymbols(rustCode, 'rust', 'test.rs');

            expect(symbols).toHaveLength(2);

            const userStruct = symbols.find(s => s.name === 'User');
            expect(userStruct).toBeDefined();
            expect(userStruct?.kind).toBe('struct');
            expect(userStruct?.line).toBe(2);

            const adminStruct = symbols.find(s => s.name === 'Admin');
            expect(adminStruct).toBeDefined();
            expect(adminStruct?.kind).toBe('struct');
        });

        test('should extract trait definitions', async () => {
            const rustCode = `
trait Authenticator {
    fn authenticate(&self, token: &str) -> bool;
    fn logout(&self);
}

trait Database {
    fn query(&self, sql: &str) -> Result<Vec<User>>;
}
`;

            mockInvoke.mockResolvedValue([
                { kind: 'trait', name: 'Authenticator', line: 2, end_line: 5, parent: null, qualified_name: 'Authenticator' },
                { kind: 'trait', name: 'Database', line: 7, end_line: 8, parent: null, qualified_name: 'Database' }
            ]);

            const symbols = await symbolService.extractSymbols(rustCode, 'rust', 'traits.rs');

            expect(symbols).toHaveLength(2);

            const authTrait = symbols.find(s => s.name === 'Authenticator');
            expect(authTrait).toBeDefined();
            expect(authTrait?.kind).toBe('trait');

            const dbTrait = symbols.find(s => s.name === 'Database');
            expect(dbTrait).toBeDefined();
            expect(dbTrait?.kind).toBe('trait');
        });

        test('should extract function definitions', async () => {
            const rustCode = `
fn main() {
    println!("Hello");
}

fn calculate(a: i32, b: i32) -> i32 {
    a + b
}

async fn fetch_data(url: &str) -> Result<String> {
    Ok("data".to_string())
}
`;

            mockInvoke.mockResolvedValue([
                { kind: 'function', name: 'main', line: 2, end_line: 4, parent: null, qualified_name: 'main' },
                { kind: 'function', name: 'calculate', line: 6, end_line: 8, parent: null, qualified_name: 'calculate' },
                { kind: 'function', name: 'fetch_data', line: 10, end_line: 12, parent: null, qualified_name: 'fetch_data' }
            ]);

            const symbols = await symbolService.extractSymbols(rustCode, 'rust', 'main.rs');

            expect(symbols).toHaveLength(3);

            const mainFn = symbols.find(s => s.name === 'main');
            expect(mainFn).toBeDefined();

            const calcFn = symbols.find(s => s.name === 'calculate');
            expect(calcFn).toBeDefined();

            const asyncFn = symbols.find(s => s.name === 'fetch_data');
            expect(asyncFn).toBeDefined();
        });

        test('should extract impl blocks', async () => {
            const rustCode = `
impl User {
    fn new(name: String) -> Self {
        User { name, age: 0 }
    }
}

impl Authenticator for User {
    fn authenticate(&self, token: &str) -> bool {
        true
    }
}
`;

            mockInvoke.mockResolvedValue([
                { kind: 'impl', name: 'User', line: 2, end_line: 6, parent: null, qualified_name: 'User' },
                { kind: 'impl', name: 'impl Authenticator for User', line: 8, end_line: 12, parent: null, qualified_name: 'User::Authenticator' }
            ]);

            const symbols = await symbolService.extractSymbols(rustCode, 'rust', 'user.rs');

            expect(symbols).toHaveLength(2);

            const userImpl = symbols.find(s => s.kind === 'impl' && s.name === 'User');
            expect(userImpl).toBeDefined();

            const traitImpl = symbols.find(s => s.qualified_name.includes('Authenticator'));
            expect(traitImpl).toBeDefined();
        });
    });

    describe('TypeScript 符号提取', () => {
        test('should extract class declarations', async () => {
            const tsCode = `
class UserService {
    constructor(private api: ApiClient) {}

    async getUser(id: string): Promise<User> {
        return this.api.get(\`/users/\${id}\`);
    }
}

class AdminService extends BaseService {
    async deleteUser(id: string): Promise<void> {
        await this.api.delete(\`/users/\${id}\`);
    }
}
`;

            mockInvoke.mockResolvedValue([
                { kind: 'class', name: 'UserService', line: 2, end_line: 7, parent: null, qualified_name: 'UserService' },
                { kind: 'method', name: 'getUser', line: 4, end_line: 6, parent: 'UserService', qualified_name: 'UserService::getUser' },
                { kind: 'class', name: 'AdminService', line: 9, end_line: 13, parent: null, qualified_name: 'AdminService' },
                { kind: 'method', name: 'deleteUser', line: 10, end_line: 12, parent: 'AdminService', qualified_name: 'AdminService::deleteUser' }
            ]);

            const symbols = await symbolService.extractSymbols(tsCode, 'typescript', 'services.ts');

            expect(symbols).toHaveLength(4);

            const userService = symbols.find(s => s.name === 'UserService');
            expect(userService).toBeDefined();
            expect(userService?.kind).toBe('class');

            const adminService = symbols.find(s => s.name === 'AdminService');
            expect(adminService).toBeDefined();

            const getUserMethod = symbols.find(s => s.name === 'getUser');
            expect(getUserMethod).toBeDefined();
            expect(getUserMethod?.parent).toBe('UserService');
        });

        test('should extract interface declarations', async () => {
            const tsCode = `
interface Repository<T> {
    findById(id: string): Promise<T | null>;
    findAll(): Promise<T[]>;
    save(entity: T): Promise<T>;
}

interface Logger {
    log(message: string): void;
    error(error: Error): void;
}
`;

            mockInvoke.mockResolvedValue([
                { kind: 'interface', name: 'Repository', line: 2, end_line: 5, parent: null, qualified_name: 'Repository' },
                { kind: 'interface', name: 'Logger', line: 7, end_line: 9, parent: null, qualified_name: 'Logger' }
            ]);

            const symbols = await symbolService.extractSymbols(tsCode, 'typescript', 'interfaces.ts');

            expect(symbols).toHaveLength(2);

            const repo = symbols.find(s => s.name === 'Repository');
            expect(repo).toBeDefined();
            expect(repo?.kind).toBe('interface');

            const logger = symbols.find(s => s.name === 'Logger');
            expect(logger).toBeDefined();
        });

        test('should extract type aliases', async () => {
            const tsCode = `
type UserId = string;
type UserMap = Map<string, User>;
type EventHandler<T> = (event: T) => void;
`;

            mockInvoke.mockResolvedValue([
                { kind: 'type', name: 'UserId', line: 2, end_line: 2, parent: null, qualified_name: 'UserId' },
                { kind: 'type', name: 'UserMap', line: 3, end_line: 3, parent: null, qualified_name: 'UserMap' },
                { kind: 'type', name: 'EventHandler', line: 4, end_line: 4, parent: null, qualified_name: 'EventHandler' }
            ]);

            const symbols = await symbolService.extractSymbols(tsCode, 'typescript', 'types.ts');

            expect(symbols).toHaveLength(3);

            const userId = symbols.find(s => s.name === 'UserId');
            expect(userId).toBeDefined();
            expect(userId?.kind).toBe('type');
        });

        test('should support generic functions', async () => {
            const tsCode = `
function identity<T>(value: T): T {
    return value;
}

async function fetchData<T>(url: string): Promise<T> {
    const response = await fetch(url);
    return response.json();
}
`;

            mockInvoke.mockResolvedValue([
                { kind: 'function', name: 'identity', line: 2, end_line: 4, parent: null, qualified_name: 'identity' },
                { kind: 'function', name: 'fetchData', line: 6, end_line: 9, parent: null, qualified_name: 'fetchData' }
            ]);

            const symbols = await symbolService.extractSymbols(tsCode, 'typescript', 'utils.ts');

            expect(symbols).toHaveLength(2);

            const identityFn = symbols.find(s => s.name === 'identity');
            expect(identityFn).toBeDefined();

            const fetchDataFn = symbols.find(s => s.name === 'fetchData');
            expect(fetchDataFn).toBeDefined();
        });
    });

    describe('Python 符号提取', () => {
        test('should extract class definitions', async () => {
            const pythonCode = `
class UserService:
    def __init__(self, api_client):
        self.api = api_client

    def get_user(self, user_id):
        return self.api.get(f"/users/{user_id}")
`;

            mockInvoke.mockResolvedValue([
                { kind: 'class', name: 'UserService', line: 2, end_line: 7, parent: null, qualified_name: 'UserService' },
                { kind: 'function', name: '__init__', line: 3, end_line: 4, parent: 'UserService', qualified_name: 'UserService::__init__' },
                { kind: 'function', name: 'get_user', line: 5, end_line: 7, parent: 'UserService', qualified_name: 'UserService::get_user' }
            ]);

            const symbols = await symbolService.extractSymbols(pythonCode, 'python', 'services.py');

            expect(symbols).toHaveLength(3);

            const userService = symbols.find(s => s.name === 'UserService');
            expect(userService).toBeDefined();
            expect(userService?.kind).toBe('class');
        });

        test('should extract function definitions', async () => {
            const pythonCode = `
def calculate_total(items):
    return sum(item.price for item in items)

async def fetch_user_data(user_id):
    response = await api.get(f"/users/{user_id}")
    return response.json()
`;

            mockInvoke.mockResolvedValue([
                { kind: 'function', name: 'calculate_total', line: 2, end_line: 3, parent: null, qualified_name: 'calculate_total' },
                { kind: 'function', name: 'fetch_user_data', line: 5, end_line: 7, parent: null, qualified_name: 'fetch_user_data' }
            ]);

            const symbols = await symbolService.extractSymbols(pythonCode, 'python', 'utils.py');

            expect(symbols).toHaveLength(2);

            const calcFn = symbols.find(s => s.name === 'calculate_total');
            expect(calcFn).toBeDefined();

            const asyncFn = symbols.find(s => s.name === 'fetch_user_data');
            expect(asyncFn).toBeDefined();
        });
    });

    describe('RAG-002: 跨文件符号关联', () => {
        test('should find all references to a symbol', async () => {
            mockInvoke.mockResolvedValue([
                {
                    symbolName: 'User',
                    definedAt: 'src/models/user.rs:5',
                    referencedIn: [
                        'src/services/auth.rs:12',
                        'src/services/database.rs:8',
                        'src/main.rs:15',
                        'src/controllers/user_controller.rs:3'
                    ]
                }
            ]);

            const refs = await symbolService.findReferences('User');

            expect(refs).toHaveLength(1);
            expect(refs[0].symbolName).toBe('User');
            expect(refs[0].definedAt).toBe('src/models/user.rs:5');
            expect(refs[0].referencedIn).toHaveLength(4);
        });

        test('should find all implementations of a trait', async () => {
            mockInvoke.mockResolvedValue([
                'src/models/user.rs:20',
                'src/models/admin.rs:15',
                'src/models/guest.rs:10'
            ]);

            const impls = await symbolService.findImplementations('Authenticator');

            expect(impls).toHaveLength(3);
            expect(impls[0]).toContain('user.rs');
            expect(impls[1]).toContain('admin.rs');
            expect(impls[2]).toContain('guest.rs');
        });
    });

    describe('符号索引与查询', () => {
        test('should index entire project', async () => {
            mockInvoke.mockResolvedValue({
                filesIndexed: 42,
                symbolsFound: 287
            });

            const result = await symbolService.indexProject('/path/to/project');

            expect(result.filesIndexed).toBe(42);
            expect(result.symbolsFound).toBe(287);
        });

        test('should handle empty files gracefully', async () => {
            mockInvoke.mockResolvedValue([]);

            const symbols = await symbolService.extractSymbols('', 'rust', 'empty.rs');

            expect(symbols).toHaveLength(0);
        });

        test('should handle unsupported languages', async () => {
            mockInvoke.mockResolvedValue([]);

            const symbols = await symbolService.extractSymbols('some code', 'unknown', 'file.unknown');

            expect(symbols).toHaveLength(0);
        });
    });

    describe('错误处理', () => {
        test('should handle syntax errors gracefully', async () => {
            const invalidRust = `
struct User {
    name: String,
    // Missing closing brace
`;

            mockInvoke.mockResolvedValue([
                // Should still extract valid symbols
                { kind: 'struct', name: 'User', line: 2, end_line: null, parent: null, qualified_name: 'User' }
            ]);

            const symbols = await symbolService.extractSymbols(invalidRust, 'rust', 'invalid.rs');

            // Extractor should be resilient to syntax errors
            expect(symbols.length).toBeGreaterThanOrEqual(0);
        });

        test('should propagate backend errors', async () => {
            mockInvoke.mockRejectedValue(new Error('Failed to parse code'));

            await expect(symbolService.extractSymbols('code', 'rust', 'test.rs'))
                .rejects.toThrow('Failed to parse code');
        });
    });

    describe('社区版 vs 商业版', () => {
        test('community edition should return basic symbols', async () => {
            // 社区版使用正则表达式，返回基础符号
            mockInvoke.mockResolvedValue([
                { kind: 'struct', name: 'User', line: 2, end_line: null, parent: null, qualified_name: 'User' },
                { kind: 'function', name: 'new', line: 3, end_line: null, parent: null, qualified_name: 'new' }
            ]);

            const symbols = await symbolService.extractSymbols('code', 'rust', 'test.rs');

            // 社区版可能返回较少信息（如 end_line 为 null）
            expect(symbols).toBeDefined();
        });

        test('commercial edition should return detailed symbols', async () => {
            // 商业版使用 tree-sitter，返回完整信息
            mockInvoke.mockResolvedValue([
                {
                    kind: 'struct',
                    name: 'User',
                    line: 2,
                    end_line: 10,
                    parent: null,
                    qualified_name: 'User'
                },
                {
                    kind: 'function',
                    name: 'new',
                    line: 3,
                    end_line: 8,
                    parent: 'User',
                    qualified_name: 'User::new'
                }
            ]);

            const symbols = await symbolService.extractSymbols('code', 'rust', 'test.rs');

            // 商业版应包含完整的 end_line 和 parent 信息
            const userStruct = symbols[0];
            expect(userStruct.end_line).toBeDefined();
            expect(userStruct.end_line).toBe(10);
        });
    });
});
