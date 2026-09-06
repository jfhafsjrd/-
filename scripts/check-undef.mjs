// 微型 no-undef 检查器：utils + composables 导出名逐文件核对（用后删）
import fs from 'node:fs'
import path from 'node:path'

const fmt = fs.readFileSync('src/utils/format.js', 'utf8')
const names = [...fmt.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1])

// composables 导出名
const compNames = []
for (const cf of ['useToast', 'useConfetti']) {
  const p = `src/composables/${cf}.js`
  if (fs.existsSync(p) && fs.readFileSync(p, 'utf8').match(new RegExp(`export (function|const) ${cf}`))) compNames.push(cf)
}
console.log('utils 导出:', names.join(', '), '| composables:', compNames.join(', '))

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.vue$/.test(e.name)) out.push(p)
  }
  return out
}

let bad = 0
for (const file of walk('src/components')) {
  const src = fs.readFileSync(file, 'utf8')
  const script = (src.match(/<script[^>]*>([\s\S]*?)<\/script>/) || ['', ''])[1]
  const impM = script.match(/import \{([^}]+)\} from '@\/utils\/format'/)
  const imported = impM ? impM[1].split(',').map((s) => s.trim().split(' as ')[0]).filter(Boolean) : []
  for (const name of names) {
    const used = new RegExp(`\\b${name}\\s*\\(`).test(script)
    if (used && !imported.includes(name)) {
      console.log('❌ 未导入', name, '→', path.relative('src', file))
      bad++
    }
  }
  for (const cf of compNames) {
    const used = new RegExp(`\\b${cf}\\b`).test(script)
    if (used && !script.includes(cf)) {
      console.log('❌ 未导入', cf, '→', path.relative('src', file))
      bad++
    }
  }
}
console.log(bad ? `发现 ${bad} 处` : '✓ 全部通过')
