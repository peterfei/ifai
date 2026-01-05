import Dexie, { Table } from 'dexie';

// 定义数据库接口
export interface StoreStats {
  count: number;
  // IndexedDB 难以直接获取精确的字节大小，这里仅作为预留字段或估算值
  size: number;
  lastUpdated: Date;
}

// 应用特定的数据库类
class AppDatabase extends Dexie {
  // 定义表及其类型，这里使用 any 为了适配通用的 Manager，但在实际使用中应使用具体接口
  snippets!: Table<any, string>;

  constructor() {
    super('IfAIDatabase');
    this.version(1).stores({
      // id 为主键，其他为索引字段
      snippets: 'id, title, language, createdAt'
    });
  }
}

export const db = new AppDatabase();

export class DatabaseManager {
  private db: AppDatabase;

  constructor() {
    this.db = db;
  }

  // --- CRUD 操作 ---

  async create<T>(storeName: string, data: T): Promise<string> {
    const table = this.db.table(storeName);
    // Dexie add 返回主键
    const id = await table.add(data);
    return id.toString();
  }

  async read<T>(storeName: string, id: string): Promise<T | undefined> {
    const table = this.db.table(storeName);
    return await table.get(id);
  }

  async update<T>(storeName: string, id: string, data: Partial<T>): Promise<void> {
    const table = this.db.table(storeName);
    await table.update(id, data);
  }

  async delete(storeName: string, id: string): Promise<void> {
    const table = this.db.table(storeName);
    await table.delete(id);
  }

  // --- 批量操作 ---

  async bulkCreate<T>(storeName: string, items: T[]): Promise<string[]> {
    const table = this.db.table(storeName);
    // bulkAdd 返回最后一个 key，但我们通常需要确认成功
    await table.bulkAdd(items);
    // 简单返回 IDs (假设 items 中有 id 字段，否则这里需要更复杂的逻辑)
    return items.map((item: any) => item.id);
  }

  async bulkRead<T>(storeName: string, ids: string[]): Promise<(T | undefined)[]> {
    const table = this.db.table(storeName);
    return await table.bulkGet(ids);
  }

  // --- 查询操作 ---

  async query<T>(storeName: string, predicate: (item: T) => boolean): Promise<T[]> {
    const table = this.db.table(storeName);
    // Filter 在 JS 层面执行，性能低于索引查询，但灵活性高
    return await table.filter(predicate).toArray();
  }

  async search<T>(storeName: string, searchTerm: string): Promise<T[]> {
      // 这是一个简单的全文搜索模拟，实际应基于索引
      // 假设搜索 title 和 content (如果有)
      const table = this.db.table(storeName);
      const lowerTerm = searchTerm.toLowerCase();
      
      return await table.filter((item: any) => {
          return (item.title && item.title.toLowerCase().includes(lowerTerm)) ||
                 (item.code && item.code.toLowerCase().includes(lowerTerm));
      }).toArray();
  }

  // --- 存储管理 ---

  async clear(storeName: string): Promise<void> {
    await this.db.table(storeName).clear();
  }
}

export const databaseManager = new DatabaseManager();
