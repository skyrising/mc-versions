import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

import {sha1, sortObject, readdirRecursive, mkdirp, downloadFile} from './utils.mjs'

const dataDir = path.resolve('data')
const manifestDir = path.resolve(dataDir, 'manifest')
const importDir = path.resolve(dataDir, 'import')
const versionDir = path.resolve(dataDir, 'version')
const protocolDir = path.resolve(dataDir, 'protocol')

;(async () => {
    const oldOmniVersions = JSON.parse(fs.readFileSync(path.resolve(dataDir, 'omni_id.json')))
    const hashMap = sortObject(JSON.parse(fs.readFileSync(path.resolve(dataDir, 'hash_map.json'))))
    const newManifest = {}
    const mojangManifest = await (await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')).json()
    newManifest.latest = mojangManifest.latest
    const urls = [
        ...mojangManifest.versions.map(v => v.url),
        ...process.argv.slice(2)
    ].map(u => new URL(u))
    for (const url of urls) {
        const p = url.pathname.split('/')
        let hash = p[3]
        while (hash in hashMap) hash = hashMap[hash]
        const file = path.resolve(manifestDir, hash[0], hash[1], hash.substr(2), p[4])
        await downloadFile(url, file)
    }
    const byId = {}
    const allVersions = []
    const files = [...readdirRecursive(manifestDir), ...readdirRecursive(importDir)]
    for (let file of files) {
        if (!file.endsWith('.json')) continue
        const content = fs.readFileSync(file, 'UTF-8')
        let hash = sha1(content)
        const data = sortObject(JSON.parse(content))
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
        const v = {
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
            launcher: data.downloads.client && data.downloads.client.url.startsWith('https://launcher.mojang.com/')
        }
        ;(byId[v.omniId] = byId[v.omniId] || {})[hash] = v
        allVersions.push(v)
    }
    readdirRecursive(manifestDir, true)
    const versions = []
    newManifest.versions = []
    for (const id in byId) {
        const versionInfo = byId[id]
        const list = Object.values(versionInfo)
        list.sort(compareVersions)
        const downloadIds = {}
        for (let i = list.length - 1; i >= 0; i--) {
            const hash = list[i].downloads
            list[i].downloadsId = downloadIds[hash] || Object.keys(downloadIds).length + 1
            downloadIds[hash] = list[i].downloadsId
        }
        versions.push(updateVersion(id, list))
    }
    versions.sort((a, b) => a.info.releaseTime >= b.info.releaseTime ? 1 : -1)
    const protocols = {}
    const versionsById = {}
    for (let i = 0; i < versions.length; i++) {
        const v = versions[i]
        const {id, protocol} = v.data
        versionsById[id] = v.data
        const defaultPrevious = i === 0 ? undefined : [versions[i - 1].data.id]
        v.data.previous = v.data.previous || defaultPrevious
        v.data.next = []
        for (const pv of v.data.previous || []) {
            versionsById[pv].next.push(id)
        }
        if (protocol) {
            const previousProtocol = Math.max(0, ...v.data.previous.map(pv => versionsById[pv].protocol).filter(p => p && p.type === protocol.type).map(p => p.version))
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
            console.warn(`${id} is missing protocol info, previous was`)
        }
        newManifest.versions.unshift(v.info)
    }
    for (const v of versions) {
        if (!v.data.next.length) console.log(v.data.id)
        fs.writeFileSync(v.file, JSON.stringify(sortObject(v.data), null, 2))
    }
    mkdirp(protocolDir)
    const allowedProtocolFile = new Set(Object.keys(protocols).map(p => p + '.json'))
    for (const f of fs.readdirSync(protocolDir)) {
        if (!allowedProtocolFile.has(f)) {
            const file = path.resolve(protocolsDir, f)
            fs.unlinkSync(file)
            console.log(`Deleting ${file}`)
        }
    }
    for (const p in protocols) {
        const file = path.resolve(protocolDir, `${p}.json`)
        const oldData = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}
        const data = {...oldData}
        data.type = p
        data.versions = Object.values(protocols[p])
        fs.writeFileSync(file, JSON.stringify(data, null, 2))
    }
    allVersions.sort(compareVersions)
    const newOmniVersions = {}
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

function compareVersions(a, b) {
    if (a.releaseTime > b.releaseTime) return -1
    if (a.releaseTime < b.releaseTime) return 1
    if (a.launcher && !b.launcher) return -1
    if (!a.launcher && b.launcher) return 1
    return a.time >= b.time ? -1 : 1
}

function updateVersion(id, manifests) {
    const file = path.resolve(versionDir, `${id}.json`)
    const oldData = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}
    const data = {...oldData}
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
    }
    data.manifests = manifests.map(m => ({
        ...m,
        omniId: undefined,
        id: undefined,
        launcher: undefined,
        url: path.relative(versionDir, m.url),
        releaseTime: undefined,
        downloads: m.downloadsHash,
        downloadsHash: undefined
    }))
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
