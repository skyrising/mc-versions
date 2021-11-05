#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write

import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'
import {readdirRecursive, mkdirp} from './utils.ts'

const URL_BASE = Deno.env.get('URL_BASE')
if (!URL_BASE) {
    console.error('$URL_BASE not provided')
    Deno.exit(1)
}
const distDir = path.resolve('dist')
const dataDir = path.resolve('data')

for (const file of readdirRecursive(dataDir)) {
    if (!file.endsWith('.json')) continue
    const relative = path.relative(dataDir, file)
    const outFile = path.resolve(distDir, relative)
    mkdirp(path.dirname(outFile))
    if (relative.startsWith('version/') || !relative.includes('/')) {
        const data = JSON.parse(await Deno.readTextFile(file))
        const base = new URL(relative, URL_BASE)
        resolveUrls(base, data)
        await Deno.writeTextFile(outFile, JSON.stringify(data, null, 2))
    } else {
        await Deno.copyFile(file, outFile)
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