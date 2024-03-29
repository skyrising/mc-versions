#!/usr/bin/env -S deno run --no-check=remote --allow-env --allow-read --allow-write
import './types.d.ts'

import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'
import React from 'https://esm.sh/react@17.0.2'
import {renderToStaticMarkup} from 'https://esm.sh/react-dom@17.0.2/server'
import {readdirRecursive} from './utils.ts'
import {getType} from './versioning.ts'

const URL_BASE = Deno.env.get('URL_BASE')
if (!URL_BASE) {
    console.error('$URL_BASE not provided')
    Deno.exit(1)
}
const distDir = path.resolve('dist')
const dataDir = path.resolve('data')

const timeline = []
for (const file of readdirRecursive(dataDir)) {
    if (!file.endsWith('.json')) continue
    const relative = path.relative(dataDir, file)
    const outFile = path.resolve(distDir, relative)
    await Deno.mkdir(path.dirname(outFile), {recursive: true})
    if (relative.startsWith('version/') || !relative.includes('/')) {
        const data = JSON.parse(await Deno.readTextFile(file))
        const base = new URL(relative, URL_BASE)
        resolveUrls(base, data)
        if (relative.startsWith('version/') && !relative.startsWith('version/manifest/')) {
            timeline.push({
                id: data.id,
                type: getType(data.normalizedVersion),
                normalizedVersion: data.normalizedVersion,
                publicTime: data.publicTime,
                releaseTime: data.releaseTime
            })
        }
        await Deno.writeTextFile(outFile, JSON.stringify(data, null, 2))
    } else {
        await Deno.copyFile(file, outFile)
    }
}
timeline.sort((a, b) => new Date(a.publicTime || a.releaseTime).getTime() - new Date(b.publicTime || b.releaseTime).getTime())
await Deno.writeTextFile(path.resolve(distDir, 'timeline.json'), JSON.stringify(timeline, null, 2))

// deno-lint-ignore no-explicit-any
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

const INDEX_HTML_TEMPLATE = await Deno.readTextFile(path.resolve(dataDir, 'index.html'))

const MAIN_MANIFEST: MainManifest = JSON.parse(await Deno.readTextFile(path.resolve(dataDir, 'version_manifest.json')))
const versionElements: Element[] = []
for (const version of MAIN_MANIFEST.versions) {
    versionElements.push(await createVersionElement(version))
}
const rendered = renderToStaticMarkup(<>{...versionElements}</>)
await Deno.writeTextFile(path.resolve(distDir, 'index.html'), INDEX_HTML_TEMPLATE.replace('$$VERSIONS$$', rendered))

async function createVersionElement(version: ShortVersion) {
    const details: VersionData = JSON.parse(await Deno.readTextFile(path.resolve(dataDir, `version/${version.id}.json`)))
    return <details className='version' id={version.id} open={Object.values(MAIN_MANIFEST.latest).includes(version.id)}>
        <summary>
            <a className='version-title' href={`version/${version.id}.json`}>{version.id}</a>
            <time dateTime={version.releaseTime}>{version.releaseTime.slice(0, 10)}</time>
        </summary>
        <ul>
            <PropertyListElement property='Normalized Version' value={details.normalizedVersion} />
            <ProtocolVersion {...details.protocol} />
            <WorldFormat {...details.world} />
            <VersionListProperty property='Previous' versions={details.previous} />
            <VersionListProperty property='Next' versions={details.next} />
        </ul>
    </details>
}

function PropertyListElement({property, value}: {property: string, value: React.ReactNode}) {
    if (!value) return <></>
    return <li><span className='property'>{property}</span>: <span className='value'>{value}</span></li>
}

function WorldFormat({format, version}: {format?: string, version?: number}) {
    if (!format) return <></>
    let info = format[0].toUpperCase() + format.slice(1)
    if (version) info += ` version ${version}`
    return <PropertyListElement property='World Format' value={info} />
}

function ProtocolVersion({type, version}: {type?: string, version?: number}) {
    if (!type || version === undefined) return <></>
    let info = type.split('-').map(t => t[0].toUpperCase() + t.slice(1)).join(' ') + ' ' + version
    if (type === 'netty-snapshot') info += ` (0x${(0x40000000 | version).toString(16)})`
    return <PropertyListElement property='Network Protocol' value={info} />
}

function VersionListProperty({property, versions}: {property: string, versions?: string[]}) {
    if (!versions || !versions.length) return <></>
    return <PropertyListElement property={property} value={versions.map((v, i) => 
        <>{i ? ', ' : ''}<a href={'#' + v}>{v}</a></>
    )}/>
}