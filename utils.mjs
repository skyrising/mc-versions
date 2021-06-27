import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'

export function sha1(data) {
    const h = crypto.createHash('sha1')
    h.update(data)
    return h.digest('hex')
}

export function sortObject(obj, recursive = true) {
    if (recursive && Array.isArray(obj)) {
        return obj.map(e => sortObject(e))
    } else if (typeof obj !== 'object' || Object.prototype.toString.call(obj) !== '[object Object]') {
        return obj
    }
    const keys = Object.keys(obj)
    keys.sort()
    const newObj = {}
    for (const key of keys) {
        newObj[key] = recursive ? sortObject(obj[key], recursive) : obj[key]
    }
    return newObj
}

export function readdirRecursive(dir, deleteEmpty = false) {
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

export async function downloadFile(url, file) {
    if (fs.existsSync(file)) return
    console.log(`Downloading ${url}`)
    mkdirp(path.dirname(file))
    await fetch(url).then(res => promisifiedPipe(res.body, fs.createWriteStream(file)))
}

export function mkdirp(dir) {
    if (fs.existsSync(dir)) return
    mkdirp(path.dirname(dir))
    fs.mkdirSync(dir)
}

export function promisifiedPipe(input, output) {
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