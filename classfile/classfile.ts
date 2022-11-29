import { Attributes,readAttributes } from './attributes.ts'
import { ConstantPool,ConstantClass,ConstantUtf8,readConstant,ConstantType,resolveConstants,getConstant } from './constants.ts'
import { Reader } from './utils.ts'

export type ClassNode = {
    version: {
        major: number
        minor: number
    }
    cp: ConstantPool<true>
    accessFlags: number
    this: ConstantClass<true>
    super: ConstantClass<true>|null
    interfaces: ConstantClass<true>[]
    fields: FieldNode[]
    methods: MethodNode[]
    attributes: Attributes
}

export type FieldNode = {
    accessFlags: number
    name: ConstantUtf8
    descriptor: ConstantUtf8
    attributes: Attributes
}

export type MethodNode = {
    accessFlags: number
    name: ConstantUtf8
    descriptor: ConstantUtf8
    attributes: Attributes
}

function readField(reader: Reader, cp: ConstantPool<true>): FieldNode {
    return {
        accessFlags: reader.u2(),
        name: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
        descriptor: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
        attributes: readAttributes(reader, cp)
    }
}

function readMethod(reader: Reader, cp: ConstantPool<true>): MethodNode {
    return {
        accessFlags: reader.u2(),
        name: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
        descriptor: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
        attributes: readAttributes(reader, cp)
    }
}

export function parseClassFile(data: Uint8Array): ClassNode {
    const reader = new Reader(data)
    const cls: Partial<ClassNode> = {}
    const magic = reader.u4()
    if (magic !== 0xcafebabe) {
        throw new Error(`Invalid magic number 0x${magic.toString(16)}`)
    }
    cls.version = {
        minor: reader.u2(),
        major: reader.u2(),
    }
    const cpCount = reader.u2()
    const cp: ConstantPool<false> = [null]
    for (let i = 1; i < cpCount; i++) {
        const entry = readConstant(reader)
        cp.push(entry)
        if (entry.tag === ConstantType.CONSTANT_Long || entry.tag === ConstantType.CONSTANT_Double) {
            i++
            cp.push(null)
        }
    }
    cls.cp = resolveConstants(cp)
    cls.accessFlags = reader.u2()
    cls.this = getConstant(cls.cp, reader.u2(), ConstantType.CONSTANT_Class)
    const superIndex = reader.u2()
    cls.super = superIndex === 0 ? null : getConstant(cls.cp, superIndex, ConstantType.CONSTANT_Class)
    cls.interfaces = []
    const interfacesCount = reader.u2()
    for (let i = 0; i < interfacesCount; i++) cls.interfaces.push(getConstant(cls.cp, reader.u2(), ConstantType.CONSTANT_Class))
    cls.fields = []
    const fieldsCount = reader.u2()
    for (let i = 0; i < fieldsCount; i++) cls.fields.push(readField(reader, cls.cp))
    cls.methods = []
    const methodsCount = reader.u2()
    for (let i = 0; i < methodsCount; i++) cls.methods.push(readMethod(reader, cls.cp))
    return cls as ClassNode
}