export class Reader {
    data: DataView;
    position: number;

    constructor(data: Uint8Array) {
        this.data = new DataView(data.buffer, data.byteOffset, data.byteLength)
        this.position = 0
    }

    read<T>(fn: (this: DataView, pos: number) => T, count: number): T {
        const value = fn.call(this.data, this.position)
        this.position += count
        return value
    }

    i1() {
        return this.read(DataView.prototype.getInt8, 1)
    }

    u1() {
        return this.read(DataView.prototype.getUint8, 1)
    }

    i2() {
        return this.read(DataView.prototype.getInt16, 2)
    }

    u2() {
        return this.read(DataView.prototype.getUint16, 2)
    }

    i4() {
        return this.read(DataView.prototype.getInt32, 4)
    }

    u4() {
        return this.read(DataView.prototype.getUint32, 4)
    }

    i8() {
        return this.read(DataView.prototype.getBigInt64, 8)
    }

    f4() {
        return this.read(DataView.prototype.getFloat32, 4)
    }

    f8() {
        return this.read(DataView.prototype.getFloat64, 8)
    }

    bytes(length: number) {
        const value = this.data.buffer.slice(this.data.byteOffset + this.position, this.data.byteOffset + this.position + length)
        this.position += length
        return new Uint8Array(value)
    }
}

export function convertModifiedUtf8(bytes: Uint8Array): string {
    const chars = []
    for (let i = 0; i < bytes.length; i++) {
        const x = bytes[i]
        if (x === 0) throw new Error('Invalid \\0')
        if (x < 0x80) {
            chars.push(x)
            continue
        }
        if ((x & 0xe0) === 0xc0) {
            const y = bytes[++i]
            if ((y & 0xc0) !== 0x80) throw new Error('Invalid continuation byte')
            chars.push(((x & 0x1f) << 6) | (y & 0x3f))
            continue
        }
        if ((x & 0xf0) === 0xe0) {
            const y = bytes[++i]
            const z = bytes[++i]
            if ((y & 0xc0) !== 0x80 || (z & 0xc0) !== 0x80) throw new Error('Invalid continuation byte')
            chars.push(((x & 0xf) << 12) | ((y & 0x3f) << 6) | (z & 0x3f))
            continue
        }
        throw new Error('Invalid starting byte')
    }
    return String.fromCharCode(...chars)
}