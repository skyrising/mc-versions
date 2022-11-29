const MAGIC_CENTRAL_DIRECTORY = 0x02014b50
const MAGIC_LOCAL_FILE = 0x04034b50
const MAGIC_EOCD = 0x06054b50

async function readAll(reader: Deno.Reader, buf: Uint8Array) {
    let read = 0
    while (read < buf.byteLength) {
        const tmpBuf = new Uint8Array(buf.buffer, buf.byteOffset + read, buf.byteLength - read)
        const r = await reader.read(tmpBuf)
        if (r === null) return read
        read += r
    }
    return read
}

function convertMsDosTime(time: number, date: number) {
    const year = 1980 + ((date & 0xfe00) >> 9)
    const month = (date & 0x01e0) >> 5
    const day = date & 0x001f
    const hour = (time & 0xf800) >> 11
    const minute = (time & 0x07e0) >> 5
    const second = (time & 0x001f) * 2
    return new Date(year, month - 1, day, hour, minute, second, 0)
}

type EOCD = {
    diskNumber: number,
    centralDirectory: {
        disk: number,
        countDisk: number,
        countTotal: number,
        size: number,
        offset: number,
    }
    comment: Uint8Array,
}

export class ZipFile {
    #file: Deno.Reader&Deno.Seeker

    constructor(file: Deno.Reader&Deno.Seeker) {
        this.#file = file
    }

    private async findEOCD(): Promise<EOCD> {
        const size = await this.#file.seek(0, Deno.SeekMode.End)
        const buf = new Uint8Array(4096)
        for (let offset = Math.max(0, size - 4096); offset > size - 65536;) {
            if (offset < 0) offset = 0
            await this.#file.seek(offset, Deno.SeekMode.Start)
            const read = await readAll(this.#file, buf)
            const view = new DataView(buf.buffer, buf.byteOffset, read)
            for (let pos = read - 22; pos >= 0; pos--) {
                if (view.getUint32(pos, true) === MAGIC_EOCD) {
                    return {
                        diskNumber: view.getUint16(pos + 4, true),
                        centralDirectory: {
                            disk: view.getUint16(pos + 6, true),
                            countDisk: view.getUint16(pos + 8, true),
                            countTotal: view.getUint16(pos + 10, true),
                            size: view.getUint32(pos + 12, true),
                            offset: view.getUint32(pos + 16, true),
                        },
                        comment: buf.slice(pos + 22, pos + 22 + view.getUint16(pos + 20, true)),
                    }
                }
            }
            offset -= read
            if (offset <= 0) break
        }
        throw new Error('Could not find end of central directory')
    }

    private async readData(offset: number, size: number) {
        const buf = new Uint8Array(size)
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
        await this.#file.seek(offset, Deno.SeekMode.Start)
        await readAll(this.#file, buf)
        return view
    }

    async entries() {
        const eocd = await this.findEOCD()
        const view = await this.readData(eocd.centralDirectory.offset, eocd.centralDirectory.size)
        let pos = 0
        const entries = []
        while (pos < view.byteLength) {
            if (view.getUint32(pos, true) !== MAGIC_CENTRAL_DIRECTORY) throw new Error('Invalid central directory file header')
            const size = 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true)
            entries.push(new ZipEntry(this, new DataView(view.buffer, view.byteOffset + pos, size)))
            pos += size
        }
        return entries
    }

    async read(entry: ZipEntry) {
        const sizeGuess = 30 + entry.filenameBytes.byteLength + entry.extraField.byteLength
        let view = await this.readData(entry.offset, sizeGuess)
        const size = 30 + view.getUint16(26, true) + view.getUint16(28, true)
        if (size > sizeGuess) {
            view = await this.readData(entry.offset, size)
        }
        if (view.getUint32(0, true) !== MAGIC_LOCAL_FILE) throw new Error('Invalid local file header')
        entry.versionNeeded = view.getUint16(4, true)
        entry.flags = view.getUint16(6, true)
        entry.compressionMethod = view.getUint16(8, true)
        entry.lastModifiedTime = view.getUint16(10, true)
        entry.lastModifiedDate = view.getUint16(12, true)
        if ((entry.flags & 8) === 0) {
            entry.crc32 = view.getUint32(14, true)
            entry.compressedSize = view.getUint32(18, true)
            entry.uncompressedSize = view.getUint32(22, true)
        }
        const filenameLength = view.getUint16(26, true)
        const extraFieldLength = view.getUint16(28, true)
        entry.filenameBytes = new Uint8Array(view.buffer, view.byteOffset + 30, filenameLength)
        entry.extraField = new Uint8Array(view.buffer, view.byteOffset + 30 + filenameLength, extraFieldLength)
        const compressed = new Uint8Array(entry.compressedSize)
        await readAll(this.#file, compressed)
        switch (entry.compressionMethod) {
            case CompressionMethod.Store: return compressed
            case CompressionMethod.Deflate: {
                const uncompressed = new Uint8Array(entry.uncompressedSize)
                await decompress('deflate-raw', compressed, uncompressed)
                return uncompressed
                //return inflateRaw(compressed)
            }
            default: throw new Error(`Unsupported compression method ${CompressionMethod[entry.compressionMethod] || entry.compressionMethod}`)
        }
    }
}

async function decompress(format: string, compressed: Uint8Array, uncompressed: Uint8Array) {
    const stream = new DecompressionStream(format)
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()
    writer.write(compressed)
    writer.close()
    let pos = 0
    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        uncompressed.set(value, pos)
        pos += value.byteLength
    }
}

enum CompressionMethod {
    Store,
    Shrink,
    ReduceFactor1,
    ReduceFactor2,
    ReduceFactor3,
    ReduceFactor4,
    Implode,
    Deflate = 8,
    Deflate64,
    ImplodePKWARE,
    bzip2 = 12,
    LZMA = 14,
    TERSE = 18,
    IBM_LZ77,
    Zstandard = 93,
    MP3,
    XZ,
    JPEG,
    WavPack,
    PPMd,
    AEx,
}

const UTF8_DECODER = new TextDecoder()

export class ZipEntry {
    #zip: ZipFile
    versionMadeBy: number
    versionNeeded: number
    flags: number
    compressionMethod: CompressionMethod
    lastModifiedTime: number
    lastModifiedDate: number
    crc32: number
    compressedSize: number
    uncompressedSize: number
    disk: number
    internalAttributes: number
    externalAttributes: number
    offset: number
    filenameBytes: Uint8Array
    #filename?: string
    extraField: Uint8Array
    commentBytes: Uint8Array
    #comment?: string

    constructor(zip: ZipFile, header: DataView) {
        if (header.getUint32(0, true) !== MAGIC_CENTRAL_DIRECTORY) throw new Error('Invalid central directory file header')
        this.#zip = zip
        this.versionMadeBy = header.getUint16(4, true)
        this.versionNeeded = header.getUint16(6, true)
        this.flags = header.getUint16(8, true)
        this.compressionMethod = header.getUint16(10, true)
        this.lastModifiedTime = header.getUint16(12, true)
        this.lastModifiedDate = header.getUint16(14, true)
        this.crc32 = header.getUint32(16, true)
        this.compressedSize = header.getUint32(20, true)
        this.uncompressedSize = header.getUint32(24, true)
        const filenameLength = header.getUint16(28, true)
        const extraFieldLength = header.getUint16(30, true)
        const commentLength = header.getUint16(32, true)
        this.disk = header.getUint16(34, true)
        this.internalAttributes = header.getUint16(36, true)
        this.externalAttributes = header.getUint32(38, true)
        this.offset = header.getUint32(42, true)
        this.filenameBytes = new Uint8Array(header.buffer, header.byteOffset + 46, filenameLength)
        this.extraField = new Uint8Array(header.buffer, header.byteOffset + 46 + filenameLength, extraFieldLength)
        this.commentBytes = new Uint8Array(header.buffer, header.byteOffset + 46 + filenameLength + extraFieldLength, commentLength)
    }

    get filename() {
        if (this.#filename === undefined) this.#filename = UTF8_DECODER.decode(this.filenameBytes)
        return this.#filename
    }

    get comment() {
        if (this.#comment === undefined) this.#comment = UTF8_DECODER.decode(this.commentBytes)
        return this.#comment
    }

    get lastModified() {
        return convertMsDosTime(this.lastModifiedTime, this.lastModifiedDate)
    }

    read() {
        return this.#zip.read(this)
    }
}