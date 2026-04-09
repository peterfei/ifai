# Vitest 配置 - Tauri Mock 管线

mocks:
  # 自动 mock Tauri API
  - '@tauri-apps/api/core':
      - invoke:
          - vi.fn()
  - '@tauri-apps/api/event':
      - listen:
          - vi.fn()
      - emit:
          - vi.fn()

# 测试环境变量
testEnvironment: 'jsdom'

# 设置文件
setupFiles:
  - ./src/components/workflow/__tests__/mocks/vitestSetup.ts
