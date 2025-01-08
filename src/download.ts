import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'

import {exists} from './utils.ts'

const DOWNLOADS_DIR = Deno.env.get('MC_VERSIONS_DOWNLOADS')

export async function getDownloads(manifest: TempVersionManifest) {
    if (!manifest.downloads || !DOWNLOADS_DIR) return {}
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
    if (!DOWNLOADS_DIR) throw Error('downloadsDir not defined')
    const hash = download.sha1
    const url = new URL(download.url)
    return path.resolve(DOWNLOADS_DIR, hash[0], hash[1], hash.slice(2), path.basename(url.pathname))
}

export async function downloadFile(url: string, file: string, part = false) {
    if (await exists(file)) return
    console.log(`Downloading ${url}`)
    await Deno.mkdir(path.dirname(file), {recursive: true})
    const destFile = part ? file + '.part' : file
    try {
        const res = await fetch(url)
        if (!res.ok) throw Error(`Invalid response for download: ${res.status} ${res.statusText}`)

        await res.body!.pipeTo((await Deno.open(destFile, {write: true})).writable)
        if (part) {
            await Deno.rename(destFile, file)
        }
    } catch(e) {
        console.error(`Download of ${url} failed`)
        console.error(e)
        if (await exists(file)) await Deno.remove(destFile)
    }
}