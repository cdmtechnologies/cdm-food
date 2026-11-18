// Collects every piece of English text the app shows (t('...'), N('...') and /*i18n*/ '...') into src/i18n/strings.json.
// Run after changing text:  node scripts/i18n-extract.mjs && sh scripts/sync-shared.sh
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require(process.env.TYPESCRIPT ?? 'typescript')
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = new Set()
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [path.join(dir, e.name)] : []))
for (const file of walk(path.join(root, 'src'))) {
  const src = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const isText = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 't' || n.expression.text === 'N') && n.arguments[0] && isText(n.arguments[0])) out.add(n.arguments[0].text)
    if (isText(n)) {
      if (src.slice(n.getFullStart(), n.getStart(sf)).includes('/*i18n*/')) out.add(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
const list = [...out].filter((s) => /\p{L}/u.test(s)).sort()
fs.writeFileSync(path.join(root, 'src/i18n/strings.json'), JSON.stringify(list, null, 0).replace(/","/g, '",\n"') + '\n')
console.log(list.length, 'strings')
