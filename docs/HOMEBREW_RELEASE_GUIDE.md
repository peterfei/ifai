# 🍺 Homebrew 发布快速入门指南

## 🎯 5 分钟快速发布

### 方案选择

| 方案 | 适用场景 | 难度 |
|------|----------|------|
| **方案 A** | 使用自定义 Tap（推荐） | ⭐⭐ |
| **方案 B** | 只提供 Cargo 安装 | ⭐ |
| **方案 C** | 提交到官方 homebrew-core | ⭐⭐⭐⭐⭐ |

---

## 方案 A: 自定义 Tap（推荐）

### 前置准备

```bash
# 1. 安装 GitHub CLI（可选，但推荐）
brew install gh

# 2. 登录 GitHub
gh auth login

# 3. 创建 GitHub 仓库
gh repo create homebrew-ifai --public --description "Homebrew tap for IfAI CLI"
```

### 一键发布

```bash
# 进入项目目录
cd /path/to/ifai

# 设置环境变量（修改为你的信息）
export GITHUB_USER="your-username"
export VERSION="0.4.3"

# 运行发布脚本
chmod +x scripts/brew-release.sh
./scripts/brew-release.sh
```

### 用户安装

```bash
# 添加 Tap
brew tap your-username/homebrew-ifai

# 安装
brew install ifai

# 更新
brew upgrade ifai

# 卸载
brew uninstall ifai
brew untap your-username/homebrew-ifai
```

---

## 方案 B: 仅 Cargo 安装（最简单）

### 在 README.md 中添加

```markdown
## 安装

### 使用 Cargo（推荐）

\`\`\`bash
cargo install ifai --version 0.4.3
\`\`\`

### 从源码构建

\`\`\`bash
git clone https://github.com/your-username/ifai
cd ifai
cargo build --release
cp target/release/ifai ~/.local/bin/
\`\`\`
```

**优点**: 无需维护 Tap
**缺点**: 不支持 `brew upgrade` 自动更新

---

## 方案 C: 提交到官方 homebrew-core

### 前置条件

- ⭐️ GitHub 仓库至少 100+ stars
- 📊 下载量稳定（通过 GitHub Releases 统计）
- 📝 完善的文档和测试
- 🆕 活跃维护

### 步骤

1. **准备 PR**

```bash
# 克隆 homebrew-core
git clone https://github.com/Homebrew/homebrew-core.git
cd homebrew-core

# 创建 Formula
cp Formula/ifai.rb Formula/ifai.rb
```

2. **Formula 示例**

```ruby
class Ifai < Formula
  desc "AI-powered CLI with streaming code block rendering"
  homepage "https://github.com/your-username/ifai"
  url "https://github.com/your-username/ifai/archive/refs/tags/v0.4.3.tar.gz"
  sha256 "SHA256_HASH"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", "--no-track", "*ifai*"
  end

  test do
    system bin/"ifai", "--version"
  end
end
```

3. **提交 PR**

```bash
# 提交到 Homebrew
git add Formula/ifai.rb
git commit -m "ifai 0.4.3 (new formula)"
gh pr create --repo Homebrew/brew --title "ifai 0.4.3 (new formula)"
```

---

## 📋 发布检查清单

### 发布前

- [ ] 版本号已更新 (`Cargo.toml`)
- [ ] Release notes 已准备
- [ ] 二进制文件已测试
- [ ] SHA256 已校验

### 发布中

- [ ] GitHub Release 已创建
- [ ] Tap 仓库已更新
- [ ] Formula 已测试安装

### 发布后

- [ ] README 更新安装说明
- [ ] 发布公告（Twitter/Reddit）
- [ ] 监控下载量和 Issue

---

## 🔧 常见问题

### Q1: 如何跨平台发布？

```bash
# 在不同平台构建

# macOS (Intel)
brew install rustup
rustup target add x86_64-apple-darwin
cargo build --release --target x86_64-apple-darwin

# macOS (Apple Silicon)
rustup target add aarch64-apple-darwin
cargo build --release --target aarch64-apple-darwin

# Linux
rustup target add x86_64-unknown-linux-gnu
cargo build --release --target x86_64-unknown-linux-gnu
```

### Q2: 如何自动化发布？

使用 GitHub Actions：

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu

    steps:
      - uses: actions/checkout@v3
      - uses: actions-rust-lang/setup-rust-toolchain@v1

      - name: Build
        run: cargo build --release --target ${{ matrix.target }}

      - name: Upload
        uses: softprops/action-gh-release@v1
        with:
          files: target/${{ matrix.target }}/release/ifai
```

### Q3: Formula 校验失败？

```bash
# 重新计算 SHA256
shasum -a 256 ifai-x86_64-apple-darwin.gz

# 更新 Formula 中的 sha256 字段
# 然后运行
brew uninstall ifai
brew install ifai
```

---

## 📚 参考资源

- [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook)
- [brew create 命令](https://docs.brew.sh/Manpage#create-options-url)
- [GitHub Actions for Rust](https://github.com/actions-rust-lang/setup-rust-toolchain)

---

**作者**: Claude (DevOps Specialist)
**更新**: 2026-04-25
**版本**: v1.0
