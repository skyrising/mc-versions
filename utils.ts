import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'

export function sha1(data: crypto.BinaryLike): string {
    const h = crypto.createHash('sha1')
    h.update(data)
    return h.digest('hex')
}

export function sortObject<T>(obj: T, recursive = true): T {
    if (recursive && Array.isArray(obj)) {
        return obj.map(e => sortObject(e)) as unknown as T
    } else if (typeof obj !== 'object' || Object.prototype.toString.call(obj) !== '[object Object]') {
        return obj
    }
    const keys = Object.keys(obj)
    keys.sort()
    const newObj: any = {}
    for (const key of keys) {
        const value = (obj as any)[key]
        newObj[key] = recursive ? sortObject(value, recursive) : value
    }
    return newObj as unknown as T
}

export function readdirRecursive(dir: string, deleteEmpty = false): Array<string> {
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

export async function downloadFile(url: string, file: string, part = false) {
    if (fs.existsSync(file)) return
    console.log(`Downloading ${url}`)
    mkdirp(path.dirname(file))
    const destFile = part ? file + '.part' : file
    try {
        await fetch(url).then(res => {
            if (!res.ok) throw Error(`Invalid response for download: ${res.status} ${res.statusText}`)
            return promisifiedPipe(res.body!!, fs.createWriteStream(destFile))
        })
        if (part) {
            fs.renameSync(destFile, file)
        }
    } catch(e) {
        console.error(`Download of ${url} failed`)
        console.error(e)
        if (fs.existsSync(destFile)) fs.unlinkSync(destFile)
    }
}

export function mkdirp(dir: string) {
    if (fs.existsSync(dir)) return
    mkdirp(path.dirname(dir))
    fs.mkdirSync(dir)
}

interface Closable {
    close(): void
}

function isCloseable<T>(obj: T): obj is T & Closable {
    return typeof (obj as any as Closable).close === 'function'
}

export function promisifiedPipe<R extends NodeJS.ReadableStream, W extends NodeJS.WritableStream>(input: R, output: W): Promise<void> {
    let ended = false
    function end() {
        if (!ended) {
            ended = true
            isCloseable(output) && output.close()
            isCloseable(input) && input.close()
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