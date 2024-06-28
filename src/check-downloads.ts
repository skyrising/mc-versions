import {collectVersions, loadData} from "./update.ts";

if (import.meta.main) {
    const data = await loadData()
    const {allVersions} = await collectVersions(data.hashMap, data.omniVersions, data.renameMap, data.lastModified)
    const allDownloads = Object.fromEntries(allVersions.filter(t => !t.launcher).flatMap(v => Object.values(v.downloads)).map(d => [d.url, d]))
    const ps = []
    for (const download of Object.values(allDownloads)) {
        ps.push(checkDownload(download))
    }
    await Promise.all(ps)
}

async function checkDownload(download: DownloadInfo) {
    const res = await fetch(download.url, {method: 'HEAD'})
    if (!res.ok) return console.warn(`${download.url}: ${res.status} ${res.statusText}`)
    const size = Number(res.headers.get('content-length') ?? '0')
    if (download.size && size !== download.size) return console.warn(`${download.url}: size mismatch ${size} != ${download.size}`)
    if (res.redirected) console.log(`${download.url} -> ${res.url}`)
}