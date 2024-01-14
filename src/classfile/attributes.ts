import { ConstantInteger,ConstantFloat,ConstantLong,ConstantDouble,ConstantString,ConstantClass,ConstantUtf8,ConstantNameAndType,ConstantMethodHandle,MethodHandleKind,LoadableConstant, ConstantPool, getConstant, ConstantType, getConstantOrNull, LoadableConstantTypes } from './constants.ts'
import { convertModifiedUtf8, Reader } from './utils.ts'

export type Attributes = Attribute[]
    & {[name in KnownAttribute['name']]?: KnownAttribute & {name: name}}
    & {[name in Exclude<Attribute['name'], KnownAttribute['name']>]?: Exclude<Attribute, KnownAttribute> & {name: name}}

export type ConstantValueAttribute = {
    name: 'ConstantValue'
    constantValue: ConstantInteger|ConstantFloat|ConstantLong|ConstantDouble|ConstantString<true>
}

export type CodeAttribute = {
    name: 'Code'
    maxStack: number
    maxLocals: number
    code: Uint8Array
    exceptionTable: {start: number, end: number, handler: number, catchType: ConstantClass<true>|null}[]
    attributes: Attribute[]
}

export type ExceptionsAttribute = {
    name: 'Exceptions'
    exceptions: ConstantClass<true>[]
}

export type InnerClassesAttribute = {
    name: 'InnerClasses'
    classes: {
        innerClass: ConstantClass<true>
        outerClass: ConstantClass<true>|null
        innerName: ConstantUtf8|null
        innerClassAccessFlags: number
    }[]
}

export type EnclosingMethodAttribute = {
    name: 'EnclosingMethod'
    class: ConstantClass<true>
    method: ConstantNameAndType<true>|null
}

export type SyntheticAttribute = {
    name: 'Synthetic'
}

export type SignatureAttribute = {
    name: 'Signature'
    signature: ConstantUtf8
}

export type SourceFileAttribute = {
    name: 'SourceFile'
    sourceFile: ConstantUtf8
}

export type SourceDebugExtensionAttribute = {
    name: 'SourceDebugExtension'
    debugExtension: string
}

export type LineNumberTableAttribute = {
    name: 'LineNumberTable'
    lineNumberTable: {
        startPC: number
        lineNumber: number
    }[]
}

export type LocalVariableTableAttribute = {
    name: 'LocalVariableTable'
    localVariableTable: {
        startPC: number
        length: number
        name: ConstantUtf8
        descriptor: ConstantUtf8
        index: number
    }[]
}

export type LocalVariableTypeTableAttribute = {
    name: 'LocalVariableTypeTable'
    localVariableTypeTable: {
        startPC: number
        length: number
        name: ConstantUtf8
        signature: ConstantUtf8
        index: number
    }[]
}

export type DeprecatedAttribute = {
    name: 'Deprecated'
}

export type BootstrapMethodsAttribute = {
    name: 'BootstrapMethods'
    bootstrapMethods: {
        method: ConstantMethodHandle<true, MethodHandleKind>
        arguments: LoadableConstant<true>[]
    }[]
}

type KnownAttribute = 
    | ConstantValueAttribute
    | CodeAttribute
    | ExceptionsAttribute
    | InnerClassesAttribute
    | EnclosingMethodAttribute
    | SyntheticAttribute
    | SignatureAttribute
    | SourceFileAttribute
    | SourceDebugExtensionAttribute
    | LineNumberTableAttribute
    | LocalVariableTableAttribute
    | LocalVariableTypeTableAttribute
    | DeprecatedAttribute
    | BootstrapMethodsAttribute

export type Attribute = KnownAttribute | {name: string, data: Uint8Array}

const KNOWN_ATTRIBUTES: {[name in KnownAttribute['name']]: (reader: Reader, cp: ConstantPool<true>) => Omit<KnownAttribute & {name: name}, 'name'>} = {
    ConstantValue(reader, cp) {
        return {constantValue: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Integer, ConstantType.CONSTANT_Float, ConstantType.CONSTANT_Long, ConstantType.CONSTANT_Double, ConstantType.CONSTANT_String)}
    },
    Code(reader, cp) {
        const maxStack = reader.u2()
        const maxLocals = reader.u2()
        const code = reader.bytes(reader.u4())
        const exceptionTable = []
        const exceptionTableLength = reader.u2()
        for (let i = 0; i < exceptionTableLength; i++) {
            exceptionTable.push({
                start: reader.u2(),
                end: reader.u2(),
                handler: reader.u2(),
                catchType: getConstantOrNull(cp, reader.u2(), ConstantType.CONSTANT_Class)
            })
        }
        const attributes = readAttributes(reader, cp)
        return {maxStack, maxLocals, code, exceptionTable, attributes}
    },
    Exceptions(reader, cp) {
        const exceptions = []
        const count = reader.u2()
        for (let i = 0; i < count; i++) exceptions.push(getConstant(cp, reader.u2(), ConstantType.CONSTANT_Class))
        return {exceptions}
    },
    InnerClasses(reader, cp) {
        const count = reader.u2()
        const classes = []
        for (let i = 0; i < count; i++) {
            classes.push({
                innerClass: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Class),
                outerClass: getConstantOrNull(cp, reader.u2(), ConstantType.CONSTANT_Class),
                innerName: getConstantOrNull(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
                innerClassAccessFlags: reader.u2()
            })
        }
        return {classes}
    },
    EnclosingMethod(reader, cp) {
        return {
            class: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Class),
            method: getConstantOrNull(cp, reader.u2(), ConstantType.CONSTANT_NameAndType)
        }
    },
    Synthetic() { return {} },
    Signature(reader, cp) {
        return {signature: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8)}
    },
    SourceFile(reader, cp) {
        return {sourceFile: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8)}
    },
    SourceDebugExtension(reader) {
        return {debugExtension: convertModifiedUtf8(reader.bytes(reader.data.byteLength))}
    },
    LineNumberTable(reader) {
        const lineNumberTable = []
        const length = reader.u2()
        for (let i = 0; i < length; i++) {
            lineNumberTable.push({
                startPC: reader.u2(),
                lineNumber: reader.u2()
            })
        }
        return {lineNumberTable}
    },
    LocalVariableTable(reader, cp) {
        const localVariableTable = []
        const length = reader.u2()
        for (let i = 0; i < length; i++) {
            localVariableTable.push({
                startPC: reader.u2(),
                length: reader.u2(),
                name: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
                descriptor: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
                index: reader.u2()
            })
        }
        return {localVariableTable}
    },
    LocalVariableTypeTable(reader, cp) {
        const localVariableTypeTable = []
        const length = reader.u2()
        for (let i = 0; i < length; i++) {
            localVariableTypeTable.push({
                startPC: reader.u2(),
                length: reader.u2(),
                name: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
                signature: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8),
                index: reader.u2()
            })
        }
        return {localVariableTypeTable}
    },
    Deprecated() { return {} },
    BootstrapMethods(reader, cp) {
        const bootstrapMethods = []
        const count = reader.u2()
        for (let i = 0; i < count; i++) {
            const method = getConstant(cp, reader.u2(), ConstantType.CONSTANT_MethodHandle)
            const numArguments = reader.u2()
            const args = []
            for (let i = 0; i < numArguments; i++) {
                args.push(getConstant(cp, reader.u2(), ...LoadableConstantTypes))
            }
            bootstrapMethods.push({method, arguments: args})
        }
        return {bootstrapMethods}
    }
}

export function readAttribute(reader: Reader, cp: ConstantPool<true>): Attribute {
    const name = getConstant(cp, reader.u2(), ConstantType.CONSTANT_Utf8).value
    const data = reader.bytes(reader.u4())
    if (name in KNOWN_ATTRIBUTES) {
        const tmpReader = new Reader(data)
        const known = KNOWN_ATTRIBUTES[name as KnownAttribute['name']](tmpReader, cp) as Omit<KnownAttribute, 'name'>
        if (tmpReader.position < data.byteLength) throw new Error(`Unexpected length ${data.byteLength} of attribute ${name}, expected ${tmpReader.position}`)
        return {name, ...known} as KnownAttribute
    }
    return {name, data}
}

export function readAttributes(reader: Reader, cp: ConstantPool<true>): Attributes {
    // deno-lint-ignore no-explicit-any
    const attributes = [] as any as Attributes
    const count = reader.u2()
    for (let i = 0; i < count; i++) {
        const attribute = readAttribute(reader, cp)
        attributes.push(attribute)
        // deno-lint-ignore no-explicit-any
        attributes[attribute.name as any] = attribute
    }
    return attributes
}