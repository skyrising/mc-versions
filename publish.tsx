#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write

import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'
import React from 'https://esm.sh/react@17'
import ReactDOMServer from 'https://esm.sh/react-dom@17/server'
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

const INDEX_HTML_TEMPLATE = await Deno.readTextFile(path.resolve(dataDir, 'index.html'))

const MAIN_MANIFEST = JSON.parse(await Deno.readTextFile(path.resolve(dataDir, 'version_manifest.json')))
const versionElements: Element[] = []
for (const version of MAIN_MANIFEST.versions) {
    versionElements.push(await createVersionElement(version))
}
const rendered = ReactDOMServer.renderToStaticMarkup(<>{...versionElements}</>)
await Deno.writeTextFile(path.resolve(distDir, 'index.html'), INDEX_HTML_TEMPLATE.replace('$$VERSIONS$$', rendered))

async function createVersionElement(version: any) {
    const details = JSON.parse(await Deno.readTextFile(path.resolve(dataDir, `version/${version.omniId}.json`)))
    return <details className='version' id={version.omniId} open={Object.values(MAIN_MANIFEST.latest).includes(version.id)}>
        <summary>
            <a className='version-title' href={`version/${version.omniId}.json`}>{version.id}{version.id === version.omniId ? '' : ` (${version.omniId})`}</a>
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