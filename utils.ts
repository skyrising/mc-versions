import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'
import { writableStreamFromWriter } from 'https://deno.land/std@0.113.0/io/mod.ts'
import { Sha1, Message } from 'https://deno.land/std@0.113.0/hash/sha1.ts'

export function sha1(data: Message): string {
    return new Sha1().update(data).toString()
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

export function sortObjectByValues<T>(obj: Record<string, T>, fn: (a: T, b: T) => number = (a, b) => a > b ? 1 : a < b ? -1 : 0): Record<string, T> {
    const keys = Object.keys(obj)
    keys.sort((k1, k2) => fn(obj[k1], obj[k2]))
    const newObj: Record<string, T> = {}
    for (const key of keys) {
        newObj[key] = obj[key]
    }
    return newObj
}

export function readdirRecursive(dir: string, deleteEmpty = false): Array<string> {
    const files = []
    for (const {name: f} of Deno.readDirSync(dir)) {
        const file = path.resolve(dir, f)
        if (Deno.statSync(file).isDirectory) {
            const dirFiles = readdirRecursive(file, deleteEmpty)
            if (deleteEmpty && dirFiles.length === 0) {
                console.log(`Deleting ${file}`)
                Deno.removeSync(file)
            }
            files.push(...dirFiles)
        } else {
            files.push(file)
        }
    }
    return files.sort()
}

export async function downloadFile(url: string, file: string, part = false) {
    if (existsSync(file)) return
    console.log(`Downloading ${url}`)
    mkdirp(path.dirname(file))
    const destFile = part ? file + '.part' : file
    try {
        const res = await fetch(url)
        if (!res.ok) throw Error(`Invalid response for download: ${res.status} ${res.statusText}`)
        await res.body!.pipeTo(writableStreamFromWriter(await Deno.open(destFile, {write: true, createNew: true})))
        if (part) {
            await Deno.rename(destFile, file)
        }
    } catch(e) {
        console.error(`Download of ${url} failed`)
        console.error(e)
        if (existsSync(file)) await Deno.remove(destFile)
    }
}

export function existsSync(file: string): boolean {
    try {
        Deno.lstatSync(file)
        return true
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) return false
        throw e
    }
}

export function mkdirp(dir: string) {
    if (existsSync(dir)) return
    mkdirp(path.dirname(dir))
    Deno.mkdirSync(dir)
}