import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

import {sha1, sortObject, readdirRecursive, mkdirp, downloadFile} from './utils.mjs'

const dataDir = path.resolve('data')
const manifestDir = path.resolve(dataDir, 'manifest')
const importDir = path.resolve(dataDir, 'import')
const versionDir = path.resolve(dataDir, 'version')

;(async () => {
    const oldOmniVersions = JSON.parse(fs.readFileSync(path.resolve(dataDir, 'omni_id.json')))
    const hashMap = sortObject(JSON.parse(fs.readFileSync(path.resolve(dataDir, 'hash_map.json'))))
    const newManifest = {}
    const mojangManifest = await (await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')).json()
    newManifest.latest = mojangManifest.latest
    const urls = mojangManifest.versions.map(v => new URL(v.url))
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
            downloads: sha1(JSON.stringify(dl)),
            assetIndex: data.assetIndex.id,
            assetHash: data.assetIndex.sha1,
            launcher: data.downloads.client && data.downloads.client.url.startsWith('https://launcher.mojang.com/')
        }
        ;(byId[v.omniId] = byId[v.omniId] || {})[hash] = v
        allVersions.push(v)
    }
    readdirRecursive(manifestDir, true)
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
        newManifest.versions.push(updateVersionFile(id, list))
    }
    newManifest.versions.sort((a, b) => a.releaseTime >= b.releaseTime ? -1 : 1)
    allVersions.sort(compareVersions)
    const newOmniVersions = {}
    for (const v of allVersions) {
        newOmniVersions[v.hash] = v.omniId
    }
    const allowedVersionFiles = new Set(newManifest.versions.map(v => v.omniId + '.json'))
    for (const f of fs.readdirSync(versionDir)) {
        if (!allowedVersionFiles.has(f)) {
            const file = path.resolve(versionDir, f)
            fs.unlinkSync(file)
            console.log(`Deleting ${file}`)
        }
    }
    fs.writeFileSync(path.resolve(dataDir, 'version_manifest.json'), JSON.stringify(newManifest, null, 2))
    fs.writeFileSync(path.resolve(dataDir, 'hash_map.json'), JSON.stringify(hashMap, null, 2))
    fs.writeFileSync(path.resolve(dataDir, 'omni_id.json'), JSON.stringify(newOmniVersions, null, 2))
})()

function compareVersions(a, b) {
    if (a.releaseTime > b.releaseTime) return -1
    if (a.releaseTime < b.releaseTime) return 1
    if (a.launcher && !b.launcher) return -1
    if (!a.launcher && b.launcher) return 1
    return a.time >= b.time ? -1 : 1
}

function updateVersionFile(id, manifests) {
    const file = path.resolve(versionDir, `${id}.json`)
    const oldData = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}
    const data = {...oldData}
    data.id = id
    data.releaseTime = data.releaseTime || manifests[0].releaseTime
    data.manifests = manifests.map(m => ({
        ...m,
        omniId: undefined,
        id: undefined,
        launcher: undefined,
        url: path.relative(versionDir, m.url),
        releaseTime: undefined
    }))
    const {omniId, type, url, time} = manifests[0]
    fs.writeFileSync(file, JSON.stringify(sortObject(data), null, 2))
    return {
        omniId, id: manifests[0].id, type,
        url: path.relative(dataDir, url),
        time,
        releaseTime: data.releaseTime,
        details: path.relative(dataDir, file)
    }
}
