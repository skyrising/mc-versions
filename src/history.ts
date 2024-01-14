#!/usr/bin/env -S deno run --allow-run --allow-read
import './types.d.ts'
import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'

if (Deno.args.length !== 1) {
    console.error('Expected one argument')
    Deno.exit(1)
}

const details: VersionData = JSON.parse(await Deno.readTextFile(`data/version/${Deno.args[0]}.json`))
for (let i = details.manifests.length - 1; i >= 1; i--) {
    const a = details.manifests[i]
    const b = details.manifests[i - 1]
    const cp = Deno.run({cmd: ['git', 'diff', '--no-index', path.resolve('data/version/', a.url), path.resolve('data/version/', b.url)]})
    await cp.status()
}