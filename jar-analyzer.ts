import './types.d.ts'
import { parseClassFile, type ClassNode } from './classfile/classfile.ts'
import { Instruction, Opcode, parseInstructions } from './classfile/code.ts'
import { ConstantType } from './classfile/constants.ts'
import { ZipFile } from './zip.ts'

export function shouldCheckJar(data: VersionData) {
    if (data.protocol === undefined) return true
    if (!data.world && data.releaseTime > '2010-06-27') return true
    if (!data.releaseTarget && !data.id.startsWith('af-') && data.releaseTime > '2011-11-13') return true
    return false
}

type TempVersionInfo = {
    protocolType?: ProtocolType,
    protocolVersion?: number,
    worldFormat?: WorldFormat,
    worldVersion?: number,
    metaInfDate?: Date,
    releaseTarget?: string,
}

const PARSERS: {[constant: string]: (node: ClassNode, info: TempVersionInfo) => void} = {
    'version:'(node, info) {
        if (info.worldVersion || node.this.name.value.startsWith('com/')) return
        for (const m of node.methods) {
            if (!m.attributes.Code) continue
            for (const insn of parseInstructions(m.attributes.Code.code, node.cp)) {
                if (insn.op !== Opcode.LDC) continue
                if (insn.value.tag !== ConstantType.CONSTANT_String) continue
                const value = insn.value.value.value
                if (value.startsWith('version:') && value.length > 8) {
                    info.worldVersion = Number(value.slice(8))
                    return
                }
            }
        }
    },
    'Outdated server!'(node, info) {
        for (const m of node.methods) {
            if (!m.attributes.Code) continue
            const insns = parseInstructions(m.attributes.Code.code, node.cp)
            for (let i = 0; i < insns.length; i++) {
                const insn = insns[i]
                if (insn.op !== Opcode.LDC) continue
                if (insn.value.tag !== ConstantType.CONSTANT_String) continue
                if (insn.value.value.value !== 'Outdated server!') continue
                let j = i
                while (--j > 0) {
                    const version = getIntConstant(insns[j])
                    if (version !== undefined) {
                        info.protocolVersion = version
                        info.protocolType = 'modern'
                        return
                    }
                }
            }
        }
    },
    'DataVersion'(node, info) {
        if (info.worldVersion) return
        for (const m of node.methods) {
            if (!m.attributes.Code) continue
            const insns = parseInstructions(m.attributes.Code.code, node.cp)
            for (let i = 0; i < insns.length; i++) {
                const insn = insns[i]
                if (insn.op !== Opcode.LDC) continue
                if (insn.value.tag !== ConstantType.CONSTANT_String) continue
                if (insn.value.value.value !== 'DataVersion') continue
                const v = getIntConstant(insns[i + 1])
                if (v !== undefined && v > 99) {
                    info.worldVersion = v
                    return
                }
            }
        }
    },
    '.mca'(_, info) {
        info.worldFormat = 'anvil'
    },
    '.mcr'(_, info) {
        if (info.worldFormat !== 'anvil') info.worldFormat = 'region'
    },
    'c.'(node, info) {
        if (info.worldFormat) return
        for (const m of node.methods) {
            if (!m.attributes.Code || m.descriptor.value !== '(II)Ljava/io/File;') continue
            for (const insn of parseInstructions(m.attributes.Code.code, node.cp)) {
                if (insn.op !== Opcode.LDC) continue
                if (insn.value.tag !== ConstantType.CONSTANT_String) continue
                if (insn.value.value.value !== 'c.') continue
                info.worldFormat = 'alpha'
            }
        }
    }
}

const PARSER_BYTES = Object.keys(PARSERS).map(key => new TextEncoder().encode(key))
const PARSER_KEYS = Object.keys(PARSERS)

function parseMinecraftServerClass(node: ClassNode, info: TempVersionInfo, version?: string) {
    for (const m of node.methods) {
        if (m.name.value !== 'run' || m.descriptor.value !== '()V') continue
        const insns = parseInstructions(m.attributes.Code!.code, node.cp)
        for (let i = 0; i < insns.length; i++) {
            const insn = insns[i]
            if (insn.op !== Opcode.LDC) continue
            if (insn.value.tag !== ConstantType.CONSTANT_String) continue
            const id = insn.value.value.value
            if (!version || id === version) {
                const nextInt = insns[i + 1] && getIntConstant(insns[i + 1])
                if (nextInt !== undefined) {
                    info.protocolVersion = nextInt
                    return
                }
            }
        }
    }
}

export async function parseJarInfo(file: string, version?: string): Promise<Partial<VersionData>> {
    const fsFile = await Deno.open(file, {read: true})
    const zip = new ZipFile(fsFile)
    const info: TempVersionInfo = {}
    for (const entry of await zip.entries()) {
        if (entry.filename === 'META-INF/MANIFEST.MF') {
            info.metaInfDate = entry.lastModified
        } else if (entry.filename === 'version.json') {
            const versionJson = JSON.parse(new TextDecoder().decode(await entry.read()))
            info.protocolVersion = versionJson.protocol_version
            info.worldVersion = versionJson.world_version
            info.releaseTarget = versionJson.release_target
        } else if (entry.filename.endsWith('.class')) {
            const data = await entry.read()
            if (entry.filename === 'net/minecraft/server/MinecraftServer.class') {
                const node = parseClassFile(data)
                parseMinecraftServerClass(node, info, version)
            } else {
                const matching = contains(data, PARSER_BYTES)
                if (matching.includes(true)) {
                    const node = parseClassFile(data)
                    for (let i = 0; i < matching.length; i++) {
                        if (matching[i]) {
                            PARSERS[PARSER_KEYS[i]](node, info)
                        }
                    }
                }
            }
        }
    }
    const result: Partial<VersionData> = {}
    if (info.metaInfDate) {
        result.time = info.metaInfDate.toISOString().replace('.000', '')
    }
    if (info.worldVersion) {
        result.world = {
            format: info.worldFormat ?? 'anvil',
            version: info.worldVersion
        }
    } else if (info.worldFormat) {
        result.world = {format: info.worldFormat}
    }
    const SNAPSHOT_PROTOCOL = 0x40000000
    if (info.protocolVersion) {
        if (!info.protocolType) {
            info.protocolType = info.protocolVersion & SNAPSHOT_PROTOCOL ? 'netty-snapshot' : 'netty'
            info.protocolVersion = info.protocolVersion & ~SNAPSHOT_PROTOCOL
        }
        result.protocol = {
            type: info.protocolType,
            version: info.protocolVersion
        }
    }
    result.releaseTarget = info.releaseTarget
    return result
}

function getIntConstant(insn: Instruction) {
    if (insn.op === Opcode.BIPUSH || insn.op === Opcode.SIPUSH) return insn.operand
    if (insn.op >= Opcode.ICONST_M1 && insn.op <= Opcode.ICONST_5) return insn.op - Opcode.ICONST_0
}

function contains(haystack: Uint8Array, needles: Uint8Array[]) {
    const startingCharacters = new Uint8Array(256)
    for (const needle of needles) startingCharacters[needle[0]] = 1
    const positions = []
    for (let i = 0; i < haystack.length; i++) {
        if (startingCharacters[haystack[i]]) positions.push(i)
    }
    const found = needles.map(_ => false)
    let foundCount = 0
    for (const pos of positions) {
        for (let i = 0; i < needles.length; i++) {
            if (found[i]) continue
            if (matches(haystack, needles[i], pos)) {
                found[i] = true
                if (++foundCount === needles.length) return found
            }
        }
    }
    return found
}

function matches(haystack: Uint8Array, needle: Uint8Array, offset: number) {
    for (let i = 0; i < needle.byteLength; i++) {
        if (haystack[offset + i] !== needle[i]) return false
    }
    return true
}