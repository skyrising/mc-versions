#!/usr/bin/env -S deno run --unstable --allow-env --allow-read --allow-write --allow-net --allow-run
import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.0/mod.ts'

import {sha1, sortObject, sortObjectByValues, readdirRecursive, mkdirp, downloadFile, existsSync} from './utils.ts'

const SCHEMA_BASE = 'https://skyrising.github.io/mc-versions/schemas/'
const SNAPSHOT_TARGETS: Record<VersionId, [number, number]> = {
    '1.1': [12, 1],
    '1.2': [12, 8],
    '1.3': [12, 30],
    '1.4': [12, 42], '1.4.6': [12, 50],
    '1.5': [13, 10], '1.5.1': [13, 12],
    '1.6': [13, 26],
    '1.7': [13, 43], '1.7.4': [13, 49],
    '1.8': [14, 34],
    '1.9': [16, 7], '1.9.3': [16, 15],
    '1.10': [16, 21],
    '1.11': [16, 44], '1.11.1': [16, 50],
    '1.12': [17, 18], '1.12.1': [17, 31],
    '1.13': [18, 22], '1.13.1': [18, 33],
    '1.14': [19, 14],
    '1.15': [19, 46],
    '1.16': [20, 22], '1.16.2': [20, 30],
    '1.17': [21, 20],
    '1.18': [21, 48], '1.18.2': [22, 7]
}

const VALID_PREVIOUS: Record<string, string[]> = {
    'release': ['snapshot'],
    'snapshot': ['release'],
    'pending': ['release', 'snapshot', 'old_beta'],
    'old_beta': ['old_alpha']
}

const downloadsDir = Deno.env.get('MC_VERSIONS_DOWNLOADS')

const dataDir = path.resolve('data')
const manifestDir = path.resolve(dataDir, 'manifest')
const importDir = path.resolve('import')
const versionDir = path.resolve(dataDir, 'version')
const protocolDir = path.resolve(dataDir, 'protocol')

type VersionId = string

interface MainManifest {
    latest: {[branch: string]: string}
    versions: Array<ShortVersion>
}

interface ShortVersion {
    omniId?: VersionId
    id: VersionId
    type: string
    url: string
    time: string
    releaseTime: string
    details?: string
}

type ProtocolType = 'classic' | 'alpha' | 'netty' | 'netty-snapshot'

interface ProtocolVersion {
    type: ProtocolType
    version: number
    incompatible?: boolean
}

interface ProtocolVersionInfo {
    version: number
    clients: Array<VersionId>
    servers: Array<VersionId>
}

interface ProtocolData {
    type: ProtocolType
    versions: Array<ProtocolVersionInfo>
}

type WorldFormat = 'anvil'

interface WorldVersion {
    format: WorldFormat
    version: number
}

interface BaseVersionManifest {
    id: VersionId
    type: string
    time: string
    releaseTime: string
    releaseTarget?: VersionId
}

interface DownloadInfo {
    sha1: string
    url: string
}

type VersionManifest = BaseVersionManifest & {
    assets?: string
    assetIndex?: {id: string, sha1: string, size: number, totalSize: number, url: string}
    downloads?: {[id: string]: DownloadInfo}
}

type ShortManifest = Omit<BaseVersionManifest, 'id' | 'releaseTime'> & {
    downloadsId?: number
    assetIndex: string
    assetHash: string
}

type TempVersionManifest = {
    omniId: VersionId
    id: VersionId
    type: string
    hash: string
    url: string
    time: string
    releaseTime: string
    lastModified?: string
    downloadsHash: string
    downloads: {[id: string]: DownloadInfo}
    downloadsId?: number
    assetIndex?: string
    assetHash?: string
    launcher: boolean
    localMirror: {[id: string]: string}
}

type VersionData = BaseVersionManifest & {
    omniId: VersionId
    client: boolean
    server: boolean
    downloads: Record<string, DownloadInfo>
    launcher: boolean
    sharedMappings: boolean
    normalizedVersion?: VersionId
    manifests: Array<ShortManifest>
    protocol?: ProtocolVersion
    world?: WorldVersion
    previous: Array<VersionId>
    next: Array<VersionId>
}

type HashMap<T> = Record<string, T>

async function collectVersions(hashMap: HashMap<string>, oldOmniVersions: HashMap<VersionId>, renameMap: Record<string, string>) {
    const byId: {[id: string]: {[hash: string]: TempVersionManifest}} = {}
    const allVersions = []
    const files = readdirRecursive(manifestDir)
    try {
        await Deno.stat(importDir)
        files.push(...readdirRecursive(importDir))
    } catch (_) {/**/}
    for (let file of files) {
        if (!file.endsWith('.json')) continue
        const content = await Deno.readTextFile(file)
        let hash = sha1(content)
        const data: VersionManifest = sortObject(JSON.parse(content))
        if (!data.downloads || data.downloads.client && (!data.assets || !data.assetIndex)) continue
        const reformatted = JSON.stringify(data, null, 2)
        const reformattedHash = sha1(reformatted)
        if (reformattedHash !== hash) {
            hashMap[hash] = reformattedHash
            hash = reformattedHash
        }
        const correctPath = path.resolve(manifestDir, hash[0], hash[1], hash.substr(2), path.basename(file))
        if (correctPath !== file) {
            console.log(file + ' -> ' + correctPath)
            mkdirp(path.dirname(correctPath))
            await Deno.writeTextFile(correctPath, reformatted)
            await Deno.remove(file)
            file = correctPath
        }
        const aTime = new Date()
        const mTime = new Date(data.time)
        await Deno.utime(file, aTime, mTime)
        const dl = Object.values(data.downloads).map(d => d.sha1).sort()
        const omniId = (oldOmniVersions[hash] === data.id ? renameMap[data.id] : oldOmniVersions[hash]) || data.id
        const v: TempVersionManifest = {
            omniId,
            id: data.id,
            type: data.type,
            hash,
            url: file,
            time: data.time,
            releaseTime: data.releaseTime,
            lastModified: lastModified[hash]?.toISOString()?.replace('.000Z', '+00:00'),
            downloadsHash: sha1(JSON.stringify(dl)),
            downloads: data.downloads,
            assetIndex: data.assetIndex?.id,
            assetHash: data.assetIndex?.sha1,
            launcher: data.downloads.client && data.downloads.client.url.startsWith('https://launcher.mojang.com/'),
            localMirror: {}
        }
        ;(byId[v.omniId] = byId[v.omniId] || {})[hash] = v
        allVersions.push(v)
    }
    readdirRecursive(manifestDir, true)
    const versions = []
    for (const id in byId) {
        const versionInfo = byId[id]
        const list = Object.values(versionInfo)
        list.sort(compareVersions)
        const downloadIds: {[hash: string]: number} = {}
        for (let i = list.length - 1; i >= 0; i--) {
            const hash = list[i].downloadsHash
            const id = downloadIds[hash] || Object.keys(downloadIds).length + 1
            list[i].downloadsId = id
            downloadIds[hash] = id
        }
        versions.push(await updateVersion(id, list))
    }
    versions.sort((a, b) => a.info.releaseTime >= b.info.releaseTime ? 1 : -1)
    return {versions, allVersions}
}

const oldOmniVersions: HashMap<VersionId> = JSON.parse(await Deno.readTextFile(path.resolve(dataDir, 'omni_id.json')))
const renameMap: Record<string, string> = JSON.parse(await Deno.readTextFile(path.resolve(dataDir, 'rename.json')))
const hashMap: HashMap<string> = sortObject(JSON.parse(await Deno.readTextFile(path.resolve(dataDir, 'hash_map.json'))))
const lastModified: HashMap<Date|null> = JSON.parse(await Deno.readTextFile(path.resolve(dataDir, 'last_modified.json')), (_, v) => typeof v === 'string' ? new Date(v) : v)
const newManifest: MainManifest = {latest: {}, versions: []}
const urls = await getURLs()
await downloadManifests(urls)
const {versions, allVersions} = await collectVersions(hashMap, oldOmniVersions, renameMap)
const protocols: {[K in ProtocolType]?: {[version: number]: ProtocolVersionInfo}} = {}
const versionsById: {[id: string]: VersionData} = {}
for (let i = 0; i < versions.length; i++) {
    const v = versions[i]
    const {id} = v.data
    versionsById[id] = v.data
    if (!v.data.previous) {
        let defaultPrevious = undefined
        for (let j = i - 1; j >= 0; j--) {
            const prev = versions[j]
            if (prev.info.type === v.info.type || (VALID_PREVIOUS[v.info.type] || []).includes(prev.info.type)) {
                defaultPrevious = prev.data.id
                break
            }
        }
        if (defaultPrevious) {
            v.data.previous = [defaultPrevious]
        }
    }
    v.data.next = []
    newManifest.versions.unshift(v.info)
    newManifest.latest[v.info.type] = v.info.id
}
const byReleaseTarget: {[target: string]: Array<string>} = {}
const normalizedVersions: Record<VersionId, VersionId> = {}
for (const v of versions) {
    const {id, protocol, releaseTarget, normalizedVersion} = v.data
    for (const pv of v.data.previous || []) {
        if (pv in versionsById) {
            versionsById[pv].next.push(id)
        } else {
            console.warn(`Previous version '${pv}' of ${id} is unknown`)
        }
    }
    if (releaseTarget) {
        (byReleaseTarget[releaseTarget] = byReleaseTarget[releaseTarget] || []).push(id)
    }
    if (normalizedVersion) {
        const currentSemVer = semver.parse(normalizedVersion)
        if (currentSemVer) {
            normalizedVersions[id] = normalizedVersion
            for (const pv of v.data.previous || []) {
                const prevNorm = versionsById[pv].normalizedVersion
                if (!prevNorm) continue
                const prevSemVer = semver.parse(prevNorm)
                if (prevSemVer) {
                    if (semver.compare(currentSemVer, prevSemVer) < 0) {
                        console.error(`Normalized version decreases from ${prevSemVer} (${pv}) to ${currentSemVer} (${id})`)
                    } else if (semver.compareBuild(currentSemVer, prevSemVer) <= 0) {
                        console.warn(`Normalized version does not increase from ${prevNorm} (${pv}) to ${normalizedVersion} (${id})`)
                    }
                }
            }
        } else {
            console.warn(`Invalid SemVer ${normalizedVersion} for ${id}`)
        }
    }
    if (protocol) {
        const sameType = function (p?: ProtocolVersion): p is ProtocolVersion {
            return !!p && p.type === protocol!.type
        }
        const previousProtocol = Math.max(0, ...v.data.previous
            .map(pv => versionsById[pv]).filter(Boolean)
            .map(v => v.protocol)
            .filter(sameType)
            .map(p => p.version))
        if (!protocol.incompatible && previousProtocol > protocol.version) {
            console.warn(`${id} decreases ${protocol.type} protocol version number from ${previousProtocol} to ${protocol.version}`)
        }
        if (!protocol.incompatible) {
            const pInfo = (protocols[protocol.type] = protocols[protocol.type] || {})
            const pvInfo = (pInfo[protocol.version] = pInfo[protocol.version] || {version: protocol.version, clients: [], servers: []})
            if (v.data.client) pvInfo.clients.push(id)
            if (v.data.server) pvInfo.servers.push(id)
        }
    } else if (protocol === undefined) {
        const previousProtocols = v.data.previous.map(pv => versionsById[pv].protocol).filter(Boolean).map(p => p!.type + ' ' + p!.version)
        if (previousProtocols.length === 1) {
            console.warn(`${id} is missing protocol info, previous was ${previousProtocols[0]}`)
        } else if (previousProtocols.length) {
            console.warn(`${id} is missing protocol info, previous were ${previousProtocols}`)
        } else {
            console.warn(`${id} is missing protocol info`)
        }
    }
}
await Deno.writeTextFile(path.resolve(dataDir, 'release_targets.json'), JSON.stringify({
    '$schema': new URL('release_targets.json', SCHEMA_BASE).toString(),
    ...byReleaseTarget
}, null, 2))
await Deno.writeTextFile(path.resolve(dataDir, 'normalized.json'), JSON.stringify(normalizedVersions, null, 2))
for (const v of versions) {
    if (!v.data.next.length) console.log(v.data.id)
    await Deno.writeTextFile(v.file, JSON.stringify({
        '$schema': new URL('version.json', SCHEMA_BASE).toString(),
        ...sortObject(v.data)
    }, null, 2))
}
mkdirp(protocolDir)
const allowedProtocolFile = new Set(Object.keys(protocols).map(p => p + '.json'))
for await (const {name: f} of Deno.readDir(protocolDir)) {
    if (!allowedProtocolFile.has(f)) {
        const file = path.resolve(protocolDir, f)
        await Deno.remove(file)
        console.log(`Deleting ${file}`)
    }
}
for (const p in protocols) {
    const file = path.resolve(protocolDir, `${p}.json`)
    const oldData: ProtocolData = existsSync(file) ? JSON.parse(await Deno.readTextFile(file)) : {type: p, versions: []}
    const data: ProtocolData = {...oldData}
    data.versions = Object.values(protocols[p as ProtocolType]!)
    await Deno.writeTextFile(file, JSON.stringify({
        '$schema': new URL('protocol.json', SCHEMA_BASE).toString(),
        ...data
    }, null, 2))
}
allVersions.sort(compareVersions)
const newOmniVersions: HashMap<VersionId> = {}
for (const v of allVersions) {
    newOmniVersions[v.hash] = v.omniId
}
mkdirp(versionDir)
const allowedVersionFiles = new Set(newManifest.versions.map(v => v.omniId + '.json'))
for await (const {name: f} of Deno.readDir(versionDir)) {
    if (!allowedVersionFiles.has(f)) {
        const file = path.resolve(versionDir, f)
        await Deno.remove(file)
        console.log(`Deleting ${file}`)
    }
}
await Deno.writeTextFile(path.resolve(dataDir, 'version_manifest.json'), JSON.stringify({
    '$schema': new URL('version_manifest.json', SCHEMA_BASE).toString(),
    ...newManifest
}, null, 2))
await Deno.writeTextFile(path.resolve(dataDir, 'hash_map.json'), JSON.stringify(sortObject(hashMap), null, 2))
await Deno.writeTextFile(path.resolve(dataDir, 'omni_id.json'), JSON.stringify(newOmniVersions, null, 2))

await updateLastModified()
await Deno.writeTextFile(path.resolve(dataDir, 'last_modified.json'), JSON.stringify(sortObjectByValues(lastModified), null, 2))


async function getURLs(): Promise<Array<URL>> {
    const mojangManifest = await (await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')).json() as MainManifest
    return [
        ...mojangManifest.versions.map(v => v.url),
        ...Deno.args
    ].map(u => new URL(u))
}

function walkHashMap(hash: string) {
    while (hash in hashMap) hash = hashMap[hash]
    return hash
}

async function downloadManifests(urls: Array<URL>): Promise<void> {
    for (const url of urls) {
        const p = url.pathname.split('/')
        const hash = walkHashMap(p[3])
        const file = path.resolve(manifestDir, hash[0], hash[1], hash.substr(2), p[4])
        await downloadFile(url.toString(), file)
    }
}

function compareVersions(a: TempVersionManifest, b: TempVersionManifest) {
    const compDate = compareDates(a.releaseTime, b.releaseTime)
    if (compDate !== 0) return -compDate
    if (a.launcher && !b.launcher) return -1
    if (!a.launcher && b.launcher) return 1
    if (a.lastModified && b.lastModified) {
        const compLastModified = compareDates(a.lastModified, b.lastModified)
        if (compLastModified !== 0) return -compLastModified
    }
    return compareDates(a.time, b.time) >= 0 ? -1 : 1
}

function compareDates(a: string, b: string) {
    return new Date(a).getTime() - new Date(b).getTime()
}

async function updateVersion(id: VersionId, manifests: Array<TempVersionManifest>) {
    const file = path.resolve(versionDir, `${id}.json`)
    const oldData = existsSync(file) ? JSON.parse(await Deno.readTextFile(file)) : {}
    const data: VersionData = {...oldData}
    data.id = id
    data.releaseTime = data.releaseTime || manifests[0].releaseTime
    const releaseTime = new Date(data.releaseTime)
    if (releaseTime.getUTCHours() === 22 && releaseTime.getUTCMinutes() === 0) {
        releaseTime.setUTCDate(releaseTime.getUTCDate() + 1)
        releaseTime.setUTCHours(0)
    }
    data.releaseTime = releaseTime.toISOString().replace('.000Z', '+00:00')
    data.client = data.server = false
    data.downloads = {}
    for (const m of manifests) {
        if (!m.downloads) continue
        if (m.downloads.client) data.client = true
        if (m.downloads.server || m.downloads.server_zip) data.server = true
        for (const type in m.downloads) {
            if (data.downloads[type]) continue
            data.downloads[type] = m.downloads[type]
        }
        m.localMirror = await getDownloads(m)
    }
    if (data.releaseTarget === undefined) {
        if (/^\d+(\.\d+)/.test(data.id)) {
            if (data.id.includes('_')) {
                data.releaseTarget = data.id.substr(0, data.id.indexOf('_'))
            } else if (data.id.includes('-')) {
                data.releaseTarget = data.id.substr(0, data.id.indexOf('-'))
            } else {
                data.releaseTarget = data.id
            }
        } else if (/^\d{2}w\d{2}/.test(data.id)) {
            const [, yearStr, weekStr] = data.id.match(/^(\d{2})w(\d{2})/)!
            data.releaseTarget = getSnapshotTarget(+yearStr, +weekStr)
        } else if (data.id.startsWith('b1.9')) {
            data.releaseTarget = '1.0.0'
        }
    }
    if (data.normalizedVersion === undefined) {
        data.normalizedVersion = normalizeVersion(data.id, data.releaseTarget)
    }
    if (data.id.startsWith('af-')) data.releaseTarget = undefined
    if (data.sharedMappings === undefined) {
        data.sharedMappings = data.client && data.server && data.releaseTime > '2012-07-23'
    }
    const {omniId, type, url, time, localMirror} = manifests[0]
    if (localMirror.client && shouldCheckJar(data)) {
        try {
            console.log(`Analyzing ${data.id} (${localMirror.client})`)
            const parsedInfo = await parseJarInfo(localMirror.client)
            if (data.protocol === undefined) data.protocol = parsedInfo.protocol
            data.world = data.world || parsedInfo.world
            if (data.releaseTarget === undefined) data.releaseTarget = parsedInfo.releaseTarget
        } catch (e) {
            console.error(e)
        }
    }
    data.manifests = manifests.map(m => ({
        ...m,
        omniId: undefined,
        id: undefined,
        launcher: undefined,
        url: path.relative(versionDir, m.url),
        releaseTime: undefined,
        downloads: m.downloadsHash,
        downloadsHash: undefined,
        localMirror: undefined
    }) as ShortManifest)
    return {
        info: {
            omniId, id: manifests[0].id, type,
            url: path.relative(dataDir, url),
            time,
            releaseTime: data.releaseTime,
            details: path.relative(dataDir, file)
        },
        data,
        file
    }
}

function normalizeVersion(omniId: VersionId, releaseTarget: VersionId | undefined) {
    // Extract all the numeric parts
    const numbers = (omniId.match(/\d+/g) || []).map(n => Number(n))
    // Extract all the non-numeric parts (Used for classic where this can contain 'a', 'st' etc.)
    const letters = omniId.split(/[\d._\-]/).filter(Boolean)
    const parts = omniId.split('-')
    const properTarget = releaseTarget && (releaseTarget.split('.').length < 3 ? releaseTarget + '.0' : releaseTarget)
    const server = parts[0] === 'server'
    if (server) parts.shift()
    if (parts[0] === 'b1.9') {
        parts[0] = '1.0.0'
    }
    function buildPart(index: number) {
        if (parts.length <= index) return ''
        return '+' + parts.slice(index).join('.')
    }

    // Beta
    if (parts[0].startsWith('b')) {
        const betaVersion = semver.coerce(parts[0].substring(1).replaceAll('_0', '.'))?.toString()
        if (parts[1] && parts[1].startsWith('pre')) {
            return `1.0.0-beta.${betaVersion}.pre${parts[1].length > 3 ? '.' + parts[1].substring(3) : ''}${buildPart(2)}`
        }
        if (parts[1] && parts[1].startsWith('tb')) {
            return `1.0.0-beta.${betaVersion}.test.${parts[1].substring(2)}${buildPart(2)}`
        }
        if (betaVersion === '1.8.0' || betaVersion === '1.6.0') {
            // Since we're already in the pre-release part we need to fix lexicographic ordering for these
            return `1.0.0-beta.${betaVersion}.z${buildPart(1)}`
        }
        return `1.0.0-beta.${betaVersion}${buildPart(1)}`
    }

    // Alpha
    if (parts[0].startsWith('a') && parts[0] !== 'af') {
        if (server) return '1.0.0-alpha.server.' + parts[0].substring(1).replaceAll('_0', '.') + buildPart(1)
        return '1.0.0-alpha.' + parts[0].substring(1).replaceAll('_0', '.') + buildPart(1)
    }

    // Indev / Infdev
    if (parts[0].startsWith('in')) return '0.31.' + omniId.substring(omniId.indexOf('-') + 1).replace('-', '+')

    // Classic
    if (parts[0].startsWith('c')) {
        // replace 0.0.x.y with 0.x.y
        if (numbers[1] === 0) numbers.shift()
        letters.shift()
        if (server) letters.shift()
        const plusComponents = [...new Set([...letters, ...parts.slice(1)])]
        if (server) return `0.30.0-classic.server.${numbers[0]}.${numbers[1]}.${numbers[2] || 0}${plusComponents.length ? '+' + plusComponents.join('.') : ''}`
        return `${numbers[0]}.${numbers[1]}.${numbers[2] || 0}${plusComponents.length ? '+' + plusComponents.join('.') : ''}`
    }

    // Pre-classic / RubyDung
    if (parts[0] === 'rd') {
        return `0.0.0-rd.${parts[1]}${buildPart(2)}`
    }

    // Regular snapshot: {yy}w{ww}[a-z~]
    if (/^\d{2}w\d{2}.$/.test(parts[0])) {
        return properTarget + `-alpha.${numbers[0]}.${numbers[1]}.${letters[1] >= 'a' && letters[1] <= 'z' ? letters[1] : 'a'}${buildPart(1)}`
    }

    // Experimental snapshots: Upper-case to sort before lower-case 'alpha'
    // 1.18_experimental-snapshot-<n>
    if (letters[0] === 'experimental') return properTarget + '-Experimental.' + numbers[2]
    // 1.19_deep_dark_experimental_snapshot-<n>
    if (letters[2] === 'experimental') return properTarget + '-' + letters.slice(0, 3).map(part => part[0].toUpperCase() + part.slice(1)).join('.') + '.' + numbers[2]

    // Pre-releases and release candidates
    if (parts[0] === releaseTarget) {
        if (parts.length === 1) return properTarget
        if (parts[1] && parts[1].startsWith('pre')) {
            const pre = parts[1].substring(3)
            return `${properTarget}-pre${pre ? '.' + pre : ''}${buildPart(2)}`
        }
        if (parts[1] && parts[1].startsWith('rc')) {
            const rc = parts[1].substring(2)
            return `${properTarget}-rc${rc ? '.' + rc : ''}${buildPart(2)}`
        }
        return `${properTarget}+${parts.slice(1).join('.')}`
    }
    console.log(omniId, numbers, letters, parts, releaseTarget, properTarget)
    return undefined
}

function shouldCheckJar(data: VersionData) {
    if (data.protocol === undefined) return true
    if (!data.world && data.releaseTime > '2010-06-27') return true
    if (!data.releaseTarget && !data.id.startsWith('af-') && data.releaseTime > '2011-11-13') return true
    return false
}

function getSnapshotTarget(year: number, week: number): string | undefined {
    for (const version in SNAPSHOT_TARGETS) {
        const end = SNAPSHOT_TARGETS[version]
        if (year < end[0] || (year === end[0] && week <= end[1])) {
            return version
        }
    }
    const versions = Object.keys(SNAPSHOT_TARGETS)
    const last = versions[versions.length - 1].split('.')
    return `${last[0]}.${+last[1] + 1}`
}

async function getDownloads(manifest: TempVersionManifest) {
    if (!manifest.downloads || !downloadsDir) return {}
    const files: {[id: string]: string} = {}
    for (const key in manifest.downloads) {
        const download = manifest.downloads[key]
        const file = getDownloadDestination(download)
        await downloadFile(download.url, file, true)
        files[key] = file
    }
    return files
}

function getDownloadDestination(download: DownloadInfo): string {
    if (!downloadsDir) throw Error('downloadsDir not defined')
    const hash = download.sha1
    const url = new URL(download.url)
    return path.resolve(downloadsDir, hash[0], hash[1], hash.substr(2), path.basename(url.pathname))
}

async function parseJarInfo(file: string): Promise<Partial<VersionData>> {
    const javaHome = Deno.env.get('JAVA_HOME')
    const javaPath = javaHome ? path.resolve(javaHome, 'bin', 'java') : 'java'
    const c = Deno.run({
        cmd: [javaPath, '-jar', 'jar-analyzer/build/libs/jar-analyzer-all.jar', file],
        stdout: 'piped',
        stderr: 'piped'
    })
    const {code} = await c.status()
    const stdout = await c.output()
    const stderr = await c.stderrOutput()
    if (code) {
        throw Error(new TextDecoder().decode(stderr))
    }
    return JSON.parse(new TextDecoder().decode(stdout))
}

async function updateLastModified() {
    for (const key in lastModified) {
        const hash = walkHashMap(key)
        if (hash !== key) {
            lastModified[hash] = lastModified[key]
            delete lastModified[key]
        }
    }
    for (const key in hashMap) {
        const hash = walkHashMap(key)
        if (hash in lastModified) continue
        const dir = path.resolve('data/manifest', hash[0], hash[1], hash.slice(2))
        if (!existsSync(dir)) continue
        for await (const {name} of Deno.readDir(dir)) {
            const url = new URL(`${key}/${name}`, 'https://launchermeta.mojang.com/v1/packages/')
            const result = await fetch(url)
            if (result.ok && result.headers.has('last-modified')) {
                lastModified[hash] = new Date(result.headers.get('last-modified')!)
            } else {
                lastModified[hash] = null
            }
        }
    }
}