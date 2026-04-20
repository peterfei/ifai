#!/usr/bin/env tsx
/**
 * 快速诊断技能系统问题
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.ifai', 'skills');

console.log('🔍 IfAI 技能系统诊断工具');
console.log('='.repeat(70));

// 1. 检查技能目录
console.log('\n1️⃣  检查技能目录结构');
console.log('-'.repeat(70));

if (!fs.existsSync(SKILLS_DIR)) {
  console.log('❌ 技能目录不存在，创建中...');
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  console.log('✅ 已创建:', SKILLS_DIR);
} else {
  console.log('✅ 技能目录存在:', SKILLS_DIR);
}

// 2. 列出现有技能
console.log('\n2️⃣  现有技能列表');
console.log('-'.repeat(70));

const entries = fs.existsSync(SKILLS_DIR)
  ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
  : [];

const skillDirs = entries.filter(entry => entry.isDirectory());

if (skillDirs.length === 0) {
  console.log('⚠️  未发现技能目录');
  console.log('');
  console.log('💡 建议: 点击"安装示例技能"按钮来安装内置技能');
} else {
  console.log(`发现 ${skillDirs.length} 个技能:`);
  skillDirs.forEach(dir => {
    const skillPath = path.join(SKILLS_DIR, dir.name);
    const files = fs.readdirSync(skillPath);
    const hasSkillFile = files.some(f => f.startsWith('skill.'));
    const status = hasSkillFile ? '✅' : '❌';
    console.log(`  ${status} ${dir.name}/ (${files.length} 个文件)`);
  });
}

// 3. 检查技能文件格式
console.log('\n3️⃣  技能文件格式检查');
console.log('-'.repeat(70));

let validSkills = 0;

for (const dir of skillDirs) {
  const skillPath = path.join(SKILLS_DIR, dir.name);
  const files = fs.readdirSync(skillPath);

  const skillMd = path.join(skillPath, 'skill.md');
  const skillJson = path.join(skillPath, 'skill.json');

  if (fs.existsSync(skillMd)) {
    const content = fs.readFileSync(skillMd, 'utf-8');
    const hasYamlFrontmatter = content.startsWith('---');
    const status = hasYamlFrontmatter ? '✅' : '⚠️';
    console.log(`${status} ${dir.name}/skill.md (Markdown格式${hasYamlFrontmatter ? '+ YAML frontmatter' : ''})`);
    if (hasYamlFrontmatter) validSkills++;
  } else if (fs.existsSync(skillJson)) {
    try {
      JSON.parse(fs.readFileSync(skillJson, 'utf-8'));
      console.log(`✅ ${dir.name}/skill.json (JSON格式)`);
      validSkills++;
    } catch {
      console.log(`❌ ${dir.name}/skill.json (JSON格式无效)`);
    }
  }
}

// 4. 检查Rust编译状态
console.log('\n4️⃣  Rust编译状态');
console.log('-'.repeat(70));

try {
  const result = execSync('cargo check --quiet 2>&1', {
    cwd: path.join(PROJECT_ROOT, 'src-tauri'),
    encoding: 'utf-8'
  });
  console.log('✅ Rust代码编译正常');
} catch (e) {
  console.log('❌ Rust代码有编译问题');
  console.log('   请先解决编译问题');
}

// 5. 总结和建议
console.log('\n' + '='.repeat(70));
console.log('📊 诊断总结');
console.log('='.repeat(70));

console.log(`\n📁 技能目录: ${SKILLS_DIR}`);
console.log(`📊 技能数量: ${skillDirs.length}`);
console.log(`✅ 有效技能: ${validSkills}`);

if (validSkills === 0 && skillDirs.length === 0) {
  console.log('\n💡 推荐操作:');
  console.log('   1. 在IfAI中点击"安装示例技能"按钮');
  console.log('   2. 等待安装完成提示');
  console.log('   3. 刷新技能设置页面');
} else if (validSkills < skillDirs.length) {
  console.log('\n⚠️  发现问题:');
  console.log('   部分技能文件格式不正确');
  console.log('\n💡 建议:');
  console.log('   1. 删除.ifai/skills目录');
  console.log('   2. 重新安装示例技能');
} else {
  console.log('\n✅ 技能系统状态良好！');
  console.log('\n💡 如果技能列表仍然为空:');
  console.log('   1. 重启IfAI应用');
  console.log('   2. 打开开发者工具查看控制台日志');
  console.log('   3. 检查Tauri命令调用是否成功');
}

console.log('\n' + '='.repeat(70));
