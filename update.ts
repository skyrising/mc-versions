#!/usr/bin/env -S deno run --unstable --allow-env --allow-read --allow-write --allow-net --allow-run
import './types.d.ts'

import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.0/mod.ts'

import {sha1, sortObject, sortObjectByValues, readdirRecursive, existsSync, evaluateRules} from './utils.ts'
import {getReleaseTarget, normalizeVersion} from './versioning.ts'
import {parseJarInfo, shouldCheckJar} from './jar-analyzer.ts'
import {getDownloads, downloadFile} from './download.ts'

const GITHUB_ACTIONS = Deno.env.get('GITHUB_ACTIONS')

const META_URLS = [
    'https://piston-meta.mojang.com/mc/game/version_manifest.json',
    'https://launchermeta.mojang.com/mc/game/version_manifest.json',
    'https://meta.skyrising.xyz/mc/game/version_manifest.json'
]

const SCHEMA_BASE = 'https://skyrising.github.io/mc-versions/schemas/'

const VALID_PREVIOUS: Record<string, string[]> = {
    'release': ['snapshot'],
    'snapshot': ['release'],
    'pending': ['release', 'snapshot', 'old_beta'],
    'old_beta': ['old_alpha']
}

const DATA_DIR = path.resolve('data')
const MANIFEST_DIR = path.resolve(DATA_DIR, 'manifest')
const IMPORT_DIR = path.resolve('import')
const VERSION_DIR = path.resolve(DATA_DIR, 'version')
const PROTOCOL_DIR = path.resolve(DATA_DIR, 'protocol')

if (import.meta.main) {
    const data = await loadData()
    await downloadManifests(await getURLs(), data.hashMap, data.sources)
    await writeUpdatedData(await updateData(data))
}

async function loadData(): Promise<Database> {
    return {
        omniVersions: await readJsonFile('omni_id.json'),
        renameMap: await readJsonFile('rename.json'),
        hashMap: sortObject(await readJsonFile('hash_map.json')),
        lastModified: await readJsonFile('last_modified.json', (_, v) => typeof v === 'string' ? new Date(v) : v),
        sources: sortObject(await readJsonFile('sources.json')),
    }
}

async function writeUpdatedData(data: UpdatedDatabase) {
    await writeJsonFile('omni_id.json', data.omniVersions)
    await writeJsonFile('version_manifest.json', {
        '$schema': new URL('version_manifest.json', SCHEMA_BASE).toString(),
        ...data.manifest
    })
    await writeProtocolFiles(PROTOCOL_DIR, data.protocols)
    await writeJsonFile('release_targets.json', {
        '$schema': new URL('release_targets.json', SCHEMA_BASE).toString(),
        ...data.byReleaseTarget
    })
    await writeJsonFile('normalized.json', data.normalizedVersions)
    await writeJsonFile('hash_map.json', sortObject(data.hashMap))
    await writeJsonFile('last_modified.json', sortObjectByValues(data.lastModified))
    await writeJsonFile('sources.json', sortObject(data.sources))
}

async function updateData(data: Database): Promise<UpdatedDatabase> {
    const {versions, allVersions} = await collectVersions(data.hashMap, data.omniVersions, data.renameMap, data.lastModified)
    const {newManifest, versionsById} = updateMainManifest(versions)
    const {normalizedVersions, protocols, byReleaseTarget} = updateVersionDetails(versions, versionsById)
    const newOmniVersions = await sortAndWriteVersionFiles(VERSION_DIR, versions, allVersions, newManifest)
    return {
        ...data,
        omniVersions: newOmniVersions,
        manifest: newManifest,
        allVersions,
        protocols,
        byReleaseTarget,
        normalizedVersions
    }
}

// deno-lint-ignore no-explicit-any
async function readJsonFile(file: string, reviver?: (this: any, key: string, value: any) => any) {
    return JSON.parse(await Deno.readTextFile(path.resolve(DATA_DIR, file)), reviver)
}

// deno-lint-ignore no-explicit-any
async function writeJsonFile(file: string, data: any) {
    await Deno.writeTextFile(path.resolve(DATA_DIR, file), JSON.stringify(data, null, 2))
}

async function collectVersions(hashMap: HashMap<string>, oldOmniVersions: HashMap<VersionId>, renameMap: Record<string, string>, lastModified: HashMap<Date|null>) {
    const byId: Record<string, Record<string, TempVersionManifest>> = {}
    const allVersions = []
    const files = readdirRecursive(MANIFEST_DIR)
    try {
        await Deno.stat(IMPORT_DIR)
        files.push(...readdirRecursive(IMPORT_DIR))
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
        const correctPath = path.resolve(MANIFEST_DIR, hash[0], hash[1], hash.slice(2), path.basename(file))
        if (correctPath !== file) {
            console.log(file + ' -> ' + correctPath)
            await Deno.mkdir(path.dirname(correctPath), {recursive: true})
            await Deno.writeTextFile(correctPath, reformatted)
            await Deno.remove(file)
            file = correctPath
        }
        const aTime = new Date()
        const mTime = new Date(data.time)
        await Deno.utime(file, aTime, mTime)
        const dl = Object.values(data.downloads).map(d => d.sha1).sort()
        const omniId = ((oldOmniVersions[hash] || data.id) === data.id ? renameMap[data.id] : oldOmniVersions[hash]) || data.id
        const v: TempVersionManifest = {
            omniId,
            id: data.id,
            type: data.type,
            hash,
            url: file,
            time: data.time,
            releaseTime: data.releaseTime,
            downloadsHash: sha1(JSON.stringify(dl)),
            downloads: data.downloads,
            assetIndex: data.assetIndex?.id,
            assetHash: data.assetIndex?.sha1,
            launcher: data.downloads.client?.url.startsWith('https://launcher.mojang.com/'),
            libraries: data.libraries.filter(lib => !lib.rules || evaluateRules(lib.rules, {}) === 'allow'),
            localMirror: {}
        }
        ;(byId[v.omniId] ??= {})[hash] = v
        allVersions.push(v)
    }
    await updateLastModified(lastModified, hashMap)
    for (const v of allVersions) {
        v.lastModified = lastModified[v.hash]?.toISOString()?.replace('.000Z', '+00:00')
    }
    readdirRecursive(MANIFEST_DIR, true)
    const versions: VersionInfo[] = []
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

function updateMainManifest(versions: VersionInfo[]): {newManifest: MainManifest, versionsById: Record<string, VersionData>} {
    const newManifest: MainManifest = {latest: {}, versions: []}
    const versionsById: {[id: string]: VersionData} = {}
    for (let i = 0; i < versions.length; i++) {
        const v = versions[i]
        const {id} = v.data
        versionsById[id] = v.data
        v.data.previous = v.data.previous || findPrevious(versions, i)
        v.data.next = []
        newManifest.versions.unshift(v.info)
        newManifest.latest[v.info.type] = v.info.id
    }
    return {newManifest, versionsById}
}

function findPrevious(versions: VersionInfo[], index: number) {
    const v = versions[index]
    for (let j = index - 1; j >= 0; j--) {
        const prev = versions[j]
        if (prev.info.type === v.info.type || (VALID_PREVIOUS[v.info.type] || []).includes(prev.info.type)) {
            return [prev.data.id]
        }
    }
}

function warnPrefix(id: string) {
    return GITHUB_ACTIONS ? `::warning file=data/version/${id}.json::` : ''
}

function updateVersionDetails(versions: VersionInfo[], versionsById: Record<string, VersionData>) {
    const protocols: Protocols = {}
    const normalizedVersions: Record<VersionId, VersionId> = {}
    const byReleaseTarget: Record<string, Array<string>> = {}
    for (const v of versions) {
        const {id, protocol, releaseTarget, normalizedVersion} = v.data
        for (const pv of v.data.previous || []) {
            if (pv in versionsById) {
                versionsById[pv].next.push(id)
            } else {
                console.warn(`${warnPrefix(id)}Previous version '${pv}' of ${id} is unknown`)
            }
        }
        if (releaseTarget) {
            (byReleaseTarget[releaseTarget] ??= []).push(id)
        }
        if (normalizedVersion) {
            const currentSemVer = semver.parse(normalizedVersion)
            if (currentSemVer) {
                normalizedVersions[id] = normalizedVersion
                for (const pv of v.data.previous || []) {
                    const prevNorm = versionsById[pv]?.normalizedVersion
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
                console.warn(`${warnPrefix(id)}Invalid SemVer ${normalizedVersion} for ${id}`)
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
                console.warn(`${warnPrefix(id)}${id} decreases ${protocol.type} protocol version number from ${previousProtocol} to ${protocol.version}`)
            }
            if (!protocol.incompatible) {
                const pvInfo = (protocols[protocol.type] ??= {})[protocol.version] ??= {version: protocol.version, clients: [], servers: []}
                if (v.data.client) pvInfo.clients.push(id)
                if (v.data.server) pvInfo.servers.push(id)
            }
        } else if (protocol === undefined) {
            const previousProtocols = (v.data.previous || []).map(pv => versionsById[pv]?.protocol).filter(Boolean).map(p => p!.type + ' ' + p!.version)
            if (previousProtocols.length === 1) {
                console.warn(`${id} is missing protocol info, previous was ${previousProtocols[0]}`)
            } else if (previousProtocols.length) {
                console.warn(`${id} is missing protocol info, previous were ${previousProtocols}`)
            } else {
                console.warn(`${id} is missing protocol info`)
            }
        }
    }
    return {normalizedVersions, protocols, byReleaseTarget}
}

async function writeProtocolFiles(protocolDir: string, protocols: Protocols) {
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
        const oldData: ProtocolData = existsSync(file) ? await readJsonFile(file) : {type: p, versions: []}
        const data: ProtocolData = {...oldData}
        data.versions = Object.values(protocols[p as ProtocolType]!)
        await writeJsonFile(file, {
            '$schema': new URL('protocol.json', SCHEMA_BASE).toString(),
            ...data
        })
    }
}

async function sortAndWriteVersionFiles(versionDir: string, versions: VersionInfo[], allVersions: TempVersionManifest[], newManifest: MainManifest) {
    if (GITHUB_ACTIONS) console.log('::group::Head versions')
    for (const v of versions) {
        if (!v.data.next.length) console.log(v.data.id)
        await writeJsonFile(v.file, {
            '$schema': new URL('version.json', SCHEMA_BASE).toString(),
            ...sortObject(v.data)
        })
    }
    if (GITHUB_ACTIONS) console.log('::endgroup::')
    allVersions.sort(compareVersions)
    const newOmniVersions: HashMap<VersionId> = {}
    for (const v of allVersions) {
        newOmniVersions[v.hash] = v.omniId
    }
    await Deno.mkdir(versionDir, {recursive: true})
    const allowedVersionFiles = new Set(newManifest.versions.map(v => v.omniId + '.json'))
    for await (const {name: f} of Deno.readDir(versionDir)) {
        if (!allowedVersionFiles.has(f)) {
            const file = path.resolve(versionDir, f)
            await Deno.remove(file)
            console.log(`Deleting ${file}`)
        }
    }
    return newOmniVersions
}

async function getURLs(): Promise<Array<URL>> {
    const urls = new Set(Deno.args)
    await Promise.all(META_URLS.map(async metaUrl => {
        const manifest = await (await fetch(metaUrl)).json() as MainManifest
        for (const version of manifest.versions) {
            urls.add(version.url)
        }
    }))
    return [...urls].map(u => new URL(u))
}

function walkHashMap(hash: string, hashMap: HashMap<string>) {
    while (hash in hashMap) hash = hashMap[hash]
    return hash
}

async function downloadManifests(urls: Array<URL>, hashMap: HashMap<string>, sources: HashMap<string>): Promise<void> {
    for (const url of urls) {
        const p = url.pathname.split('/')
        const hash = walkHashMap(p[3], hashMap)
        sources[p[3]] ??= url.toString()
        const file = path.resolve(MANIFEST_DIR, hash[0], hash[1], hash.substr(2), p[4])
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
    const file = path.resolve(VERSION_DIR, `${id}.json`)
    const oldData = existsSync(file) ? JSON.parse(await Deno.readTextFile(file)) : {}
    const data: VersionData = {...oldData}
    data.id = id
    data.releaseTime ||= manifests[0].releaseTime
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
    data.libraries = [...new Set(manifests[0].libraries.map(l => l.name))].filter(l => l.split(':').length < 4).sort()
    data.releaseTarget = getReleaseTarget(data)
    if (data.normalizedVersion === undefined) {
        data.normalizedVersion = normalizeVersion(data.id, data.releaseTarget)
    }
    if (data.id.startsWith('af-')) data.releaseTarget = undefined
    if (data.sharedMappings === undefined) {
        data.sharedMappings = data.client && data.server && data.releaseTime > '2012-07-26'
    }
    const {omniId, type, url, time, localMirror} = manifests[0]
    if (localMirror.client && shouldCheckJar(data)) {
        try {
            console.log(`Analyzing ${data.id} (${localMirror.client})`)
            const parsedInfo = await parseJarInfo(localMirror.client, manifests[0].id)
            if (data.protocol === undefined) data.protocol = parsedInfo.protocol
            if (parsedInfo.protocol && parsedInfo.protocol.version !== data.protocol?.version) {
                console.warn(`${data.id}: Mismatched protocol version: analyzed=${parsedInfo.protocol.version} data=${data.protocol?.version}`)
            }
            data.world ||= parsedInfo.world
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
        url: path.relative(VERSION_DIR, m.url),
        releaseTime: undefined,
        downloads: m.downloadsHash,
        downloadsHash: undefined,
        localMirror: undefined,
        libraries: undefined
    }) as ShortManifest)
    return {
        info: {
            omniId, id: manifests[0].id, type,
            url: path.relative(DATA_DIR, url),
            time,
            releaseTime: data.releaseTime,
            details: path.relative(DATA_DIR, file)
        },
        data,
        file
    }
}

async function updateLastModified(lastModified: HashMap<Date|null>, hashMap: HashMap<string>) {
    for (const key in lastModified) {
        const hash = walkHashMap(key, hashMap)
        if (hash !== key) {
            lastModified[hash] = lastModified[key]
            delete lastModified[key]
        }
    }
    for (const key in hashMap) {
        const hash = walkHashMap(key, hashMap)
        if (hash in lastModified) continue
        const dir = path.resolve('data/manifest', hash[0], hash[1], hash.slice(2))
        if (!existsSync(dir)) continue
        for await (const {name} of Deno.readDir(dir)) {
            const dates = await Promise.all([
                getLastModified(new URL(`${key}/${name}`, 'https://piston-meta.mojang.com/v1/packages/')),
                getLastModified(new URL(`${key}/${name}`, 'https://launchermeta.mojang.com/v1/packages/'))
            ])
            const date = dates.filter(Boolean)[0]
            lastModified[hash] = date ?? null
        }
    }
}

async function getLastModified(url: URL) {
    const result = await fetch(url)
    if (result.ok && result.headers.has('last-modified')) {
        return new Date(result.headers.get('last-modified')!)
    } else {
        return null
    }
}