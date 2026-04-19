#!/usr/bin/env tsx
/**
 * 验证技能安装是否正确
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.ifai', 'skills');

console.log('='.repeat(60));
console.log('🔍 技能安装验证工具');
console.log('='.repeat(60));
console.log(`项目根目录: ${PROJECT_ROOT}`);
console.log(`技能目录: ${SKILLS_DIR}`);
console.log('');

// 检查技能目录是否存在
if (!fs.existsSync(SKILLS_DIR)) {
  console.error('❌ 技能目录不存在:', SKILLS_DIR);
  process.exit(1);
}

console.log('✅ 技能目录存在');
console.log('');

// 读取技能目录内容
const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
const skillDirs = entries.filter(entry => entry.isDirectory());

console.log(`📁 发现 ${skillDirs.length} 个技能子目录:`);
skillDirs.forEach(dir => console.log(`   - ${dir.name}`));
console.log('');

// 检查每个技能目录的结构
let validSkills = 0;
let invalidSkills = 0;

for (const dir of skillDirs) {
  const skillPath = path.join(SKILLS_DIR, dir.name);
  const files = fs.readdirSync(skillPath);

  console.log(`\n📂 技能: ${dir.name}`);
  console.log(`   文件: ${files.join(', ')}`);

  // 检查是否有skill.md或skill.json
  const hasSkillMd = files.includes('skill.md');
  const hasSkillJson = files.includes('skill.json');

  if (hasSkillMd) {
    console.log('   ✅ 发现 skill.md');
    validSkills++;

    // 读取并验证YAML frontmatter
    const skillMdPath = path.join(skillPath, 'skill.md');
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const lines = content.split('\n');

    if (lines[0].startsWith('---')) {
      console.log('   ✅ 包含YAML frontmatter');

      // 提取基本信息
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*(.+)$/m);

      if (nameMatch) console.log(`   📝 名称: ${nameMatch[1]}`);
      if (descMatch) console.log(`   📝 描述: ${descMatch[1].substring(0, 50)}...`);
    } else {
      console.log('   ⚠️  缺少YAML frontmatter');
    }
  } else if (hasSkillJson) {
    console.log('   ✅ 发现 skill.json (JSON格式)');
    validSkills++;

    try {
      const skillJsonPath = path.join(skillPath, 'skill.json');
      const content = fs.readFileSync(skillJsonPath, 'utf-8');
      const skillData = JSON.parse(content);

      console.log(`   📝 ID: ${skillData.id || 'N/A'}`);
      console.log(`   📝 名称: ${skillData.name || 'N/A'}`);
    } catch (e) {
      console.log('   ❌ JSON解析失败:', (e as Error).message);
    }
  } else {
    console.log('   ❌ 缺少技能定义文件（skill.md或skill.json）');
    invalidSkills++;
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 验证结果汇总');
console.log('='.repeat(60));
console.log(`✅ 有效技能: ${validSkills}`);
console.log(`❌ 无效技能: ${invalidSkills}`);
console.log(`📈 总计: ${skillDirs.length} 个技能`);
console.log('');

if (validSkills === 0) {
  console.log('⚠️  没有发现有效技能！');
  console.log('');
  console.log('可能的原因：');
  console.log('1. 技能文件格式不正确');
  console.log('2. YAML frontmatter格式错误');
  console.log('3. 需要重新运行安装命令');
  console.log('');
  process.exit(1);
} else {
  console.log('🎉 技能安装验证通过！');
  console.log('');
  console.log('下一步：');
  console.log('1. 重启应用');
  console.log('2. 打开技能设置页面');
  console.log('3. 验证技能是否正确显示');
}

console.log('='.repeat(60));
