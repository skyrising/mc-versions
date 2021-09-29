import fs from 'fs'
import path, { relative } from 'path'
import cp from 'child_process'
import fetch from 'node-fetch'

import {sha1, sortObject, readdirRecursive, mkdirp, downloadFile, promisifiedPipe} from './utils.js'

const downloadsDir = process.env.MC_VERSIONS_DOWNLOADS

const dataDir = path.resolve('data')
const manifestDir = path.resolve(dataDir, 'manifest')
const importDir = path.resolve(dataDir, 'import')
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
    downloadsHash: string
    downloads: {[id: string]: DownloadInfo}
    downloadsId?: number
    assetIndex: string
    assetHash: string
    launcher: boolean
    localMirror: {[id: string]: string}
}

type VersionData = BaseVersionManifest & {
    omniId: VersionId
    client: boolean
    server: boolean
    launcher: boolean
    manifests: Array<ShortManifest>
    protocol?: ProtocolVersion
    world?: WorldVersion
    previous: Array<VersionId>
    next: Array<VersionId>
}

interface HashMap<T> {
    [hash: string]: T
}

async function collectVersions(hashMap: HashMap<string>, oldOmniVersions: HashMap<VersionId>) {
    const byId: {[id: string]: {[hash: string]: TempVersionManifest}} = {}
    const allVersions = []
    const files = [...readdirRecursive(manifestDir), ...readdirRecursive(importDir)]
    for (let file of files) {
        if (!file.endsWith('.json')) continue
        const content = fs.readFileSync(file, 'utf8')
        let hash = sha1(content)
        const data: VersionManifest = sortObject(JSON.parse(content))
        if (!data.downloads || !data.assets || !data.assetIndex) continue
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
            fs.writeFileSync(correctPath, reformatted)
            fs.unlinkSync(file)
            file = correctPath
        }
        const aTime = new Date()
        const mTime = new Date(data.time)
        fs.utimesSync(file, aTime, mTime)
        const dl = Object.values(data.downloads).map(d => d.sha1).sort()
        const omniId =  oldOmniVersions[hash] || data.id
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
            assetIndex: data.assetIndex.id,
            assetHash: data.assetIndex.sha1,
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

;(async () => {
    const oldOmniVersions: HashMap<VersionId> = JSON.parse(fs.readFileSync(path.resolve(dataDir, 'omni_id.json'), 'utf8'))
    const hashMap: HashMap<string> = sortObject(JSON.parse(fs.readFileSync(path.resolve(dataDir, 'hash_map.json'), 'utf8')))
    const newManifest: MainManifest = {latest: {}, versions: []}
    const urls = await getURLs()
    await downloadManifests(urls, hashMap)
    const {versions, allVersions} = await collectVersions(hashMap, oldOmniVersions)
    const protocols: {[K in ProtocolType]?: {[version: number]: ProtocolVersionInfo}} = {}
    const versionsById: {[id: string]: VersionData} = {}
    for (let i = 0; i < versions.length; i++) {
        const v = versions[i]
        const {id, protocol} = v.data
        versionsById[id] = v.data
        const defaultPrevious = i === 0 ? undefined : [versions[i - 1].data.id]
        v.data.previous = v.data.previous || defaultPrevious
        v.data.next = []
        newManifest.versions.unshift(v.info)
        newManifest.latest[v.info.type] = v.info.id
    }
    for (const v of versions) {
        const {id, protocol} = v.data
        for (const pv of v.data.previous || []) {
            if (pv in versionsById) {
                versionsById[pv].next.push(id)
            } else {
                console.warn(`Previous version '${pv}' of ${id} is unknown`)
            }
        }
        if (protocol) {
            const sameType = function (p?: ProtocolVersion): p is ProtocolVersion {
                return !!p && p.type === protocol!!.type
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
            const previousProtocols = v.data.previous.map(pv => versionsById[pv].protocol).filter(Boolean).map(p => p!!.type + ' ' + p!!.version)
            if (previousProtocols.length === 1) {
                console.warn(`${id} is missing protocol info, previous was ${previousProtocols[0]}`)
            } else if (previousProtocols.length) {
                console.warn(`${id} is missing protocol info, previous were ${previousProtocols}`)
            } else {
                console.warn(`${id} is missing protocol info`)
            }
        }
    }
    for (const v of versions) {
        if (!v.data.next.length) console.log(v.data.id)
        fs.writeFileSync(v.file, JSON.stringify(sortObject(v.data), null, 2))
    }
    mkdirp(protocolDir)
    const allowedProtocolFile = new Set(Object.keys(protocols).map(p => p + '.json'))
    for (const f of fs.readdirSync(protocolDir)) {
        if (!allowedProtocolFile.has(f)) {
            const file = path.resolve(protocolDir, f)
            fs.unlinkSync(file)
            console.log(`Deleting ${file}`)
        }
    }
    for (const p in protocols) {
        const file = path.resolve(protocolDir, `${p}.json`)
        const oldData: ProtocolData = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {type: p, versions: []}
        const data: ProtocolData = {...oldData}
        data.versions = Object.values(protocols[p as ProtocolType]!!)
        fs.writeFileSync(file, JSON.stringify(data, null, 2))
    }
    allVersions.sort(compareVersions)
    const newOmniVersions: HashMap<VersionId> = {}
    for (const v of allVersions) {
        newOmniVersions[v.hash] = v.omniId
    }
    mkdirp(versionDir)
    const allowedVersionFiles = new Set(newManifest.versions.map(v => v.omniId + '.json'))
    for (const f of fs.readdirSync(versionDir)) {
        if (!allowedVersionFiles.has(f)) {
            const file = path.resolve(versionDir, f)
            fs.unlinkSync(file)
            console.log(`Deleting ${file}`)
        }
    }
    fs.writeFileSync(path.resolve(dataDir, 'version_manifest.json'), JSON.stringify(newManifest, null, 2))
    fs.writeFileSync(path.resolve(dataDir, 'hash_map.json'), JSON.stringify(sortObject(hashMap), null, 2))
    fs.writeFileSync(path.resolve(dataDir, 'omni_id.json'), JSON.stringify(newOmniVersions, null, 2))
})()

async function getURLs(): Promise<Array<URL>> {
    const mojangManifest = await (await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')).json() as MainManifest
    return [
        ...mojangManifest.versions.map(v => v.url),
        ...process.argv.slice(2)
    ].map(u => new URL(u))
}

async function downloadManifests(urls: Array<URL>, hashMap: HashMap<string>): Promise<void> {
    for (const url of urls) {
        const p = url.pathname.split('/')
        let hash = p[3]
        while (hash in hashMap) hash = hashMap[hash]
        const file = path.resolve(manifestDir, hash[0], hash[1], hash.substr(2), p[4])
        await downloadFile(url.toString(), file)
    }
}

function compareVersions(a: TempVersionManifest, b: TempVersionManifest) {
    if (a.releaseTime > b.releaseTime) return -1
    if (a.releaseTime < b.releaseTime) return 1
    if (a.launcher && !b.launcher) return -1
    if (!a.launcher && b.launcher) return 1
    return a.time >= b.time ? -1 : 1
}

async function updateVersion(id: VersionId, manifests: Array<TempVersionManifest>) {
    const file = path.resolve(versionDir, `${id}.json`)
    const oldData = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
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
    for (const m of manifests) {
        if (!m.downloads) continue
        if (m.downloads.client) data.client = true
        if (m.downloads.server) data.server = true
        m.localMirror = await getDownloads(m)
    }
    const {localMirror} = manifests[0]
    if (localMirror.client && shouldCheckJar(data)) {
        try {
            console.log(`Analyzing ${data.id} (${localMirror.client})`)
            const parsedInfo = await parseJarInfo(localMirror.client)
            if (data.protocol === undefined) data.protocol = parsedInfo.protocol
            data.world = data.world || parsedInfo.world
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
    const {omniId, type, url, time} = manifests[0]
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

function shouldCheckJar(data: VersionData) {
    if (data.protocol === undefined) return true
    if (!data.world && data.releaseTime > '2010-06-27') return true
    return false
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
    const javaHome = process.env['JAVA_HOME']
    const javaPath = javaHome ? path.resolve(javaHome, 'bin', 'java') : 'java'
    return new Promise((resolve, reject) => {
        const c = cp.spawn(javaPath, ['-jar', 'jar-analyzer/build/libs/jar-analyzer-all.jar', file], {stdio: 'pipe'})
        let stdout = ''
        let stderr = ''
        c.stdout.on('data', d => stdout += d)
        c.stderr.on('data', d => stderr += d)
        c.on('exit', code => {
            if (code) reject(stderr)
            else resolve(JSON.parse(stdout))
        })
    })
}