/**
 * 技能系统诊断脚本
 * 分析技能系统的当前状态和潜在问题
 */

import fs from 'fs';
import path from 'path';

interface DiagnosticResult {
  category: string;
  item: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

const results: DiagnosticResult[] = [];

function addResult(category: string, item: string, status: 'pass' | 'fail' | 'warning', message: string, details?: string) {
  results.push({ category, item, status, message, details });
}

console.log('🔍 开始诊断技能系统...\n');

// 1. 检查前端组件
console.log('📋 检查前端组件...');
try {
  const skillsDir = path.join(process.cwd(), 'src/components/Settings/Skills');
  const components = fs.readdirSync(skillsDir);

  const expectedComponents = [
    'SkillsManagement.tsx',
    'SkillInstaller.tsx',
    'SkillEditor.tsx',
    'SkillDetailPanel.tsx',
    'SkillSearchBar.tsx',
    'SkillStateIndicator.tsx',
    'types.ts',
    'index.ts'
  ];

  expectedComponents.forEach(comp => {
    const exists = components.includes(comp);
    if (exists) {
      addResult('前端组件', comp, 'pass', '组件文件存在');
    } else {
      addResult('前端组件', comp, 'fail', '组件文件缺失');
    }
  });
} catch (e) {
  addResult('前端组件', '目录检查', 'fail', '无法访问Skills目录', String(e));
}

// 2. 检查Store实现
console.log('📋 检查Store实现...');
try {
  const storePath = path.join(process.cwd(), 'src/stores/skillStore.ts');
  const storeContent = fs.readFileSync(storePath, 'utf-8');

  // 检查关键方法
  const methods = [
    'fetchSkills',
    'activateSkill',
    'deactivateSkill',
    'installSkill',
    'uninstallSkill',
    'createSkill',
    'updateSkill'
  ];

  methods.forEach(method => {
    const exists = storeContent.includes(method);
    if (exists) {
      addResult('Store方法', method, 'pass', '方法已定义');
    } else {
      addResult('Store方法', method, 'fail', '方法未定义');
    }
  });

  // 检查Tauri invoke调用
  const invokePattern = /invoke\(['"]([^'"]+)['"]/g;
  const invokes = [];
  let match;
  while ((match = invokePattern.exec(storeContent)) !== null) {
    invokes.push(match[1]);
  }

  console.log(`  找到 ${invokes.length} 个invoke调用:`);
  invokes.forEach(inv => console.log(`    - ${inv}`));

} catch (e) {
  addResult('Store实现', '文件检查', 'fail', '无法读取skillStore.enhanced.ts', String(e));
}

// 3. 检查后端Tauri命令
console.log('📋 检查后端Tauri命令...');
try {
  const commandsPath = path.join(process.cwd(), 'src-tauri/src/commands/skill_commands.rs');
  const commandsContent = fs.readFileSync(commandsPath, 'utf-8');

  // 查找所有Tauri命令定义
  const commandPattern = /#\[tauri::command\]\s*pub\s+async\s+fn\s+(\w+)/g;
  const commands = [];
  let match;
  while ((match = commandPattern.exec(commandsContent)) !== null) {
    commands.push(match[1]);
  }

  console.log(`  找到 ${commands.length} 个Tauri命令:`);
  commands.forEach(cmd => console.log(`    - ${cmd}`));

  // 检查关键命令
  const requiredCommands = [
    'get_available_skills',
    'init_skills_dir',
    'install_skill',
    'uninstall_skill',
    'activate_skill',
    'deactivate_skill',
    'create_skill',
    'update_skill'
  ];

  requiredCommands.forEach(cmd => {
    const exists = commands.includes(cmd);
    if (exists) {
      addResult('Tauri命令', cmd, 'pass', '命令已实现');
    } else {
      addResult('Tauri命令', cmd, 'fail', '命令未实现（前端调用会失败）');
    }
  });

} catch (e) {
  addResult('Tauri命令', '文件检查', 'fail', '无法读取skill_commands.rs', String(e));
}

// 4. 检查命令注册
console.log('📋 检查命令注册...');
try {
  const libRsPath = path.join(process.cwd(), 'src-tauri/src/lib.rs');
  const libRsContent = fs.readFileSync(libRsPath, 'utf-8');

  // 检查skill_commands模块是否被导入
  const hasSkillCommandsImport = libRsContent.includes('skill_commands') ||
                                  libRsContent.includes('mod skill_commands');

  if (hasSkillCommandsImport) {
    addResult('命令注册', 'skill_commands导入', 'pass', '模块已导入');
  } else {
    addResult('命令注册', 'skill_commands导入', 'fail', '模块未导入');
  }

  // 检查generate_handler调用
  const hasGenerateHandler = libRsContent.includes('skill_commands');

  if (hasGenerateHandler) {
    addResult('命令注册', 'generate_handler', 'pass', '命令已注册');
  } else {
    addResult('命令注册', 'generate_handler', 'warning', '可能未正确注册到Tauri');
  }

} catch (e) {
  addResult('命令注册', 'lib.rs检查', 'fail', '无法读取lib.rs', String(e));
}

// 5. 生成诊断报告
console.log('\n📊 诊断报告\n');
console.log('='.repeat(80));

const categoryGroups: Record<string, DiagnosticResult[]> = {};
results.forEach(result => {
  if (!categoryGroups[result.category]) {
    categoryGroups[result.category] = [];
  }
  categoryGroups[result.category].push(result);
});

Object.entries(categoryGroups).forEach(([category, items]) => {
  console.log(`\n${category}:`);
  console.log('-'.repeat(80));

  const passCount = items.filter(i => i.status === 'pass').length;
  const failCount = items.filter(i => i.status === 'fail').length;
  const warningCount = items.filter(i => i.status === 'warning').length;

  items.forEach(item => {
    const icon = item.status === 'pass' ? '✅' : item.status === 'fail' ? '❌' : '⚠️';
    console.log(`  ${icon} ${item.item}: ${item.message}`);
    if (item.details) {
      console.log(`     详情: ${item.details}`);
    }
  });

  console.log(`  小计: ${passCount} 通过, ${failCount} 失败, ${warningCount} 警告`);
});

console.log('\n' + '='.repeat(80));

// 6. 关键问题总结
const failures = results.filter(r => r.status === 'fail');
if (failures.length > 0) {
  console.log('\n🚨 发现的关键问题:\n');
  failures.forEach(failure => {
    console.log(`❌ [${failure.category}] ${failure.item}`);
    console.log(`   ${failure.message}`);
    if (failure.details) {
      console.log(`   详情: ${failure.details}`);
    }
    console.log('');
  });
}

// 7. 修复建议
console.log('🔧 修复建议:\n');

if (failures.some(f => f.item === 'install_skill' && f.category === 'Tauri命令')) {
  console.log('1. 实现缺失的Tauri命令:');
  console.log('   在 src-tauri/src/commands/skill_commands.rs 中添加以下命令:');
  console.log('   - install_skill: 安装技能到项目');
  console.log('   - uninstall_skill: 从项目卸载技能');
  console.log('   - activate_skill: 激活技能');
  console.log('   - deactivate_skill: 停用技能');
  console.log('   - create_skill: 创建新技能');
  console.log('   - update_skill: 更新现有技能');
  console.log('');
}

if (failures.some(f => f.item === 'skill_commands导入' && f.category === '命令注册')) {
  console.log('2. 注册skill_commands模块:');
  console.log('   在 src-tauri/src/lib.rs 中添加:');
  console.log('   mod skill_commands;');
  console.log('   .invoke_handler(skill_commands::*):');
  console.log('');
}

console.log('8. 保存诊断结果到文件...');
const reportPath = path.join(process.cwd(), 'skills-system-diagnosis.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    total: results.length,
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    warning: results.filter(r => r.status === 'warning').length
  },
  results
}, null, 2));

console.log(`   诊断报告已保存到: ${reportPath}`);

console.log('\n✅ 诊断完成！');
