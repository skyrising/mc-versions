import fs from 'fs'
import path from 'path'
import {readdirRecursive, mkdirp} from './utils.js'

const {URL_BASE} = process.env
if (!URL_BASE) {
    console.error('$URL_BASE not provided')
    process.exit(1)
}
const distDir = path.resolve('dist')
const dataDir = path.resolve('data')

for (const file of readdirRecursive(dataDir)) {
    if (!file.endsWith('.json')) continue
    const relative = path.relative(dataDir, file)
    const outFile = path.resolve(distDir, relative)
    mkdirp(path.dirname(outFile))
    if (relative.startsWith('version/') || !relative.includes('/')) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        const base = new URL(relative, URL_BASE)
        resolveUrls(base, data)
        fs.writeFileSync(outFile, JSON.stringify(data, null, 2))
    } else {
        fs.copyFileSync(file, outFile)
    }
}

function resolveUrls(base: URL, obj: any) {
    if (Array.isArray(obj)) {
        for (const element of obj) resolveUrls(base, element)
    } else if (typeof obj === 'object' && obj) {
        for (const key in obj) {
            const value = obj[key]
            if (key === 'url' || key === 'details' && typeof value === 'string' && value.endsWith('.json')) {
                obj[key] = new URL(value, base).toString()
            } else {
                resolveUrls(base, value)
            }
        }
    }
}