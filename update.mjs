import fs, { fdatasyncSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'

const dataDir = path.resolve('data')
const manifestDir = path.resolve(dataDir, 'manifest')
const importDir = path.resolve(dataDir, 'import')

;(async () => {
    const timeFix = JSON.parse(fs.readFileSync(path.resolve(dataDir, 'time_fix.json')))
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
        const releaseTime = timeFix[omniId] || data.releaseTime
        const v = {
            omniId,
            id: data.id,
            type: data.type,
            hash,
            url: path.relative(dataDir, file),
            time: data.time,
            releaseTime,
            downloads: sha1(JSON.stringify(dl)),
            assetIndex: data.assetIndex.id,
            assetHash: data.assetIndex.sha1
        }
        ;(byId[v.omniId] = byId[v.omniId] || {})[hash] = v
        allVersions.push(v)
    }
    readdirRecursive(manifestDir, true)
    newManifest.versions = []
    for (const versionInfo of Object.values(byId)) {
        const list = Object.values(versionInfo)
        list.sort((a, b) => a.time >= b.time ? -1 : 1)
        const downloadIds = {}
        for (let i = list.length - 1; i >= 0; i--) {
            const hash = list[i].downloads
            list[i].downloadsId = downloadIds[hash] || Object.keys(downloadIds).length + 1
            downloadIds[hash] = list[i].downloadsId
        }
        const latest = list.shift()
        if (list.length) {
            latest.other = []
            for (const v of list) {
                latest.other.push({url: v.url, time: v.time, downloadsId: v.downloadsId, assetIndex: v.assetIndex, assetHash: v.assetHash})
            }
        }
        newManifest.versions.push(latest)
    }
    newManifest.versions.sort((a, b) => a.releaseTime >= b.releaseTime ? -1 : 1)
    allVersions.sort((a, b) => {
        if (a.releaseTime > b.releaseTime) return -1
        if (a.releaseTime < b.releaseTime) return 1
        return a.time >= b.time ? -1 : 1
    })
    const newOmniVersions = {}
    for (const v of allVersions) {
        newOmniVersions[v.hash] = v.omniId
        delete v.downloads
        delete v.hash
    }
    fs.writeFileSync(path.resolve(dataDir, 'version_manifest.json'), JSON.stringify(newManifest, null, 2))
    fs.writeFileSync(path.resolve(dataDir, 'hash_map.json'), JSON.stringify(hashMap, null, 2))
    fs.writeFileSync(path.resolve(dataDir, 'omni_id.json'), JSON.stringify(newOmniVersions, null, 2))
})()

function sha1(data) {
    const h = crypto.createHash('sha1')
    h.update(data)
    return h.digest('hex')
}

function sortObject(obj) {
    const keys = Object.keys(obj)
    keys.sort()
    const newObj = {}
    for (const key of keys) {
        let element = keys[key]
        if (Object.prototype.toString.call(element) === '[object Object]') {
            element = sortObject(element)
        }
        newObj[key] = obj[key]
    }
    return newObj
}

function readdirRecursive(dir, deleteEmpty = false) {
    const files = []
    for (const f of fs.readdirSync(dir)) {
        const file = path.resolve(dir, f)
        if (fs.statSync(file).isDirectory()) {
            const dirFiles = readdirRecursive(file, deleteEmpty)
            if (deleteEmpty && dirFiles.length === 0) {
                console.log(`Deleting ${file}`)
                fs.rmdirSync(file)
            }
            files.push(...dirFiles)
        } else {
            files.push(file)
        }
    }
    return files
}

async function downloadFile(url, file) {
    if (fs.existsSync(file)) return
    console.log(`Downloading ${url}`)
    mkdirp(path.dirname(file))
    await fetch(url).then(res => promisifiedPipe(res.body, fs.createWriteStream(file)))
}

function mkdirp(dir) {
    if (fs.existsSync(dir)) return
    mkdirp(path.dirname(dir))
    fs.mkdirSync(dir)
}

function promisifiedPipe(input, output) {
    let ended = false
    function end() {
        if (!ended) {
            ended = true
            output.close && output.close()
            input.close && input.close()
            return true
        }
    }

    return new Promise((resolve, reject) => {
        input.pipe(output)
        output.on('finish', () => {
            if (end()) resolve()
        })
        output.on('end', () => {
            if (end()) resolve()
        })
        input.on('error', err => {
            if (end()) reject(err)
        })
        output.on('error', err => {
            if (end()) reject(err)
        })
    })
}