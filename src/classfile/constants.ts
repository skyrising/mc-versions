import {type Reader, convertModifiedUtf8} from './utils.ts'

export enum ConstantType {
    CONSTANT_Utf8 = 1,
    CONSTANT_Integer = 3,
    CONSTANT_Float = 4,
    CONSTANT_Long = 5,
    CONSTANT_Double = 6,
    CONSTANT_Class = 7,
    CONSTANT_String = 8,
    CONSTANT_Fieldref = 9,
    CONSTANT_Methodref = 10,
    CONSTANT_InterfaceMethodref = 11,
    CONSTANT_NameAndType = 12,
    CONSTANT_MethodHandle = 15,
    CONSTANT_MethodType = 16,
    CONSTANT_Dynamic = 17 ,
    CONSTANT_InvokeDynamic = 18,
    CONSTANT_Module = 19,
    CONSTANT_Package = 20,
}

export type ConstantRef<Type, Resolved extends boolean> = Resolved extends true ? Type : number

type PrimitiveConstant<Tag extends ConstantType, ValueType> = {
    tag: Tag
    value: ValueType
}

export type ConstantUtf8 = PrimitiveConstant<ConstantType.CONSTANT_Utf8, string>
export type ConstantInteger = PrimitiveConstant<ConstantType.CONSTANT_Integer, number>
export type ConstantFloat = PrimitiveConstant<ConstantType.CONSTANT_Float, number>
export type ConstantLong = PrimitiveConstant<ConstantType.CONSTANT_Long, bigint>
export type ConstantDouble = PrimitiveConstant<ConstantType.CONSTANT_Double, number>

type NamedConstant<Tag extends ConstantType, Resolved extends boolean> = {
    tag: Tag
    name: ConstantRef<ConstantUtf8, Resolved>
}

export type ConstantClass<Resolved extends boolean> = NamedConstant<ConstantType.CONSTANT_Class, Resolved>

export type ConstantString<Resolved extends boolean> = {
    tag: ConstantType.CONSTANT_String
    value: ConstantRef<ConstantUtf8, Resolved>
}

type MemberrefConstant<Resolved extends boolean, Tag extends ConstantType> = {
    tag: Tag
    class: ConstantRef<ConstantClass<true>, Resolved>
    nameAndType: ConstantRef<ConstantNameAndType<true>, Resolved>
}

export type ConstantFieldref<Resolved extends boolean> = MemberrefConstant<Resolved, ConstantType.CONSTANT_Fieldref>
export type ConstantMethodref<Resolved extends boolean> = MemberrefConstant<Resolved, ConstantType.CONSTANT_Methodref>
export type ConstantInterfaceMethodref<Resolved extends boolean> = MemberrefConstant<Resolved, ConstantType.CONSTANT_InterfaceMethodref>

export type ConstantNameAndType<Resolved extends boolean> = {
    tag: ConstantType.CONSTANT_NameAndType
    name: ConstantRef<ConstantUtf8, Resolved>
    descriptor: ConstantRef<ConstantUtf8, Resolved>
}

export enum MethodHandleKind {
    REF_getField = 1,
    REF_getStatic = 2,
    REF_putField = 3,
    REF_putStatic = 4,
    REF_invokeVirtual = 5,
    REF_invokeStatic = 6,
    REF_invokeSpecial = 7,
    REF_newInvokeSpecial = 8,
    REF_invokeInterface = 9,
}

type MethodHandleReferenceType<Kind extends MethodHandleKind, Resolved extends boolean>
    = Kind extends MethodHandleKind.REF_getField|MethodHandleKind.REF_getStatic|MethodHandleKind.REF_putField|MethodHandleKind.REF_putStatic ? ConstantFieldref<Resolved>
    : Kind extends MethodHandleKind.REF_invokeVirtual|MethodHandleKind.REF_newInvokeSpecial ? ConstantMethodref<Resolved>
    : Kind extends MethodHandleKind.REF_invokeStatic|MethodHandleKind.REF_invokeSpecial ? ConstantMethodref<Resolved>|ConstantInterfaceMethodref<Resolved>
    : Kind extends MethodHandleKind.REF_invokeInterface ? ConstantInterfaceMethodref<Resolved>
    : never

export type ConstantMethodHandle<Resolved extends boolean, Kind extends MethodHandleKind> = {
    tag: ConstantType.CONSTANT_MethodHandle
    kind: Kind
    reference: ConstantRef<MethodHandleReferenceType<Kind, true>, Resolved>
}

export type ConstantMethodType<Resolved extends boolean> = {
    tag: ConstantType.CONSTANT_MethodType
    descriptor: ConstantRef<ConstantUtf8, Resolved>
}

type DynamicConstant<Tag extends ConstantType, Resolved extends boolean> = {
    tag: Tag
    bootstrapMethodIndex: number
    nameAndType: ConstantRef<ConstantNameAndType<true>, Resolved>
}

export type ConstantDynamic<Resolved extends boolean> = DynamicConstant<ConstantType.CONSTANT_Dynamic, Resolved>
export type ConstantInvokeDynamic<Resolved extends boolean> = DynamicConstant<ConstantType.CONSTANT_InvokeDynamic, Resolved>

export type ConstantModule<Resolved extends boolean> = NamedConstant<ConstantType.CONSTANT_Module, Resolved>
export type ConstantPackage<Resolved extends boolean> = NamedConstant<ConstantType.CONSTANT_Package, Resolved>


export type Constant<Resolved extends boolean> =
    | ConstantUtf8
    | ConstantInteger
    | ConstantFloat
    | ConstantLong
    | ConstantDouble
    | ConstantClass<Resolved>
    | ConstantString<Resolved>
    | ConstantFieldref<Resolved>
    | ConstantMethodref<Resolved>
    | ConstantInterfaceMethodref<Resolved>
    | ConstantNameAndType<Resolved>
    | ConstantMethodHandle<Resolved, MethodHandleKind>
    | ConstantMethodType<Resolved>
    | ConstantDynamic<Resolved>
    | ConstantInvokeDynamic<Resolved>
    | ConstantModule<Resolved>
    | ConstantPackage<Resolved>

export const LoadableConstantTypes = [
    ConstantType.CONSTANT_Integer,
    ConstantType.CONSTANT_Float,
    ConstantType.CONSTANT_Long,
    ConstantType.CONSTANT_Double,
    ConstantType.CONSTANT_Class,
    ConstantType.CONSTANT_String,
    ConstantType.CONSTANT_MethodHandle,
    ConstantType.CONSTANT_MethodType,
    ConstantType.CONSTANT_Dynamic,
] as const

export type LoadableConstant<Resolved extends boolean> = Extract<Constant<Resolved>, {tag: typeof LoadableConstantTypes[number]}>

export type ConstantPool<Resolved extends boolean> = (Constant<Resolved>|null)[]


export function readConstant(reader: Reader): Constant<false> {
    const tag = reader.u1()
    switch (tag) {
        case ConstantType.CONSTANT_Utf8: return {tag, value: convertModifiedUtf8(reader.bytes(reader.u2()))}
        case ConstantType.CONSTANT_Integer: return {tag, value: reader.i4()}
        case ConstantType.CONSTANT_Float: return {tag, value: reader.f4()}
        case ConstantType.CONSTANT_Long: return {tag, value: reader.i8()}
        case ConstantType.CONSTANT_Double: return {tag, value: reader.f8()}
        case ConstantType.CONSTANT_Class: return {tag, name: reader.u2()}
        case ConstantType.CONSTANT_String: return {tag, value: reader.u2()}
        case ConstantType.CONSTANT_Fieldref:
        case ConstantType.CONSTANT_Methodref:
        case ConstantType.CONSTANT_InterfaceMethodref:
            return {tag, class: reader.u2(), nameAndType: reader.u2()}
        case ConstantType.CONSTANT_NameAndType: return {tag, name: reader.u2(), descriptor: reader.u2()}
        case ConstantType.CONSTANT_MethodHandle: return {tag, kind: reader.u1(), reference: reader.u2()}
        case ConstantType.CONSTANT_MethodType: return {tag, descriptor: reader.u2()}
        case ConstantType.CONSTANT_Dynamic:
        case ConstantType.CONSTANT_InvokeDynamic:
            return {tag, bootstrapMethodIndex: reader.u2(), nameAndType: reader.u2()}
        case ConstantType.CONSTANT_Module:
        case ConstantType.CONSTANT_Package:
            return {tag, name: reader.u2()}
    }
    throw new Error('Invalid constant pool tag ' + tag)
}

export function getConstantOrNull<Tag extends ConstantType>(cp: ConstantPool<true>, index: number, ...tags: Tag[]): (Constant<true> & {tag: Tag}) | null {
    if (index === 0) return null
    return getConstant(cp, index, ...tags)
}

export function getConstant<Tag extends ConstantType>(cp: ConstantPool<true>, index: number, ...tags: Tag[]): Constant<true> & {tag: Tag} {
    const entry = cp[index]
    if (entry === undefined) {
        throw new Error(`Invalid reference to unresolved constant #${index}`)
    }
    if (entry === null) throw new Error(`Invalid reference to null constant #${index}`)
    for (const tag of tags) if (entry.tag === tag) return entry as Constant<true> & {tag: Tag}
    throw new Error(`Invalid reference to constant #${index} of type ${ConstantType[entry.tag]}, expected ${tags.map(tag => ConstantType[tag])}`)
}

export function resolveConstants(cp: ConstantPool<false>): ConstantPool<true> {
    const resolved: ConstantPool<true> = []
    function resolve<Tag extends ConstantType>(index: number, ...tags: Tag[]): Constant<true> & {tag: Tag} {
        if (resolved[index] === undefined) resolveAt(index)
        return getConstant(resolved, index, ...tags)
    }
    function resolveAt(index: number) {
        if (resolved[index]) return
        const entry = cp[index]
        if (entry === null) {
            resolved[index] = null
            return
        }
        switch (entry.tag) {
            case ConstantType.CONSTANT_Utf8:
            case ConstantType.CONSTANT_Integer:
            case ConstantType.CONSTANT_Float:
            case ConstantType.CONSTANT_Long:
            case ConstantType.CONSTANT_Double:
                resolved[index] = entry
                break
            case ConstantType.CONSTANT_Class:
            case ConstantType.CONSTANT_Module:
            case ConstantType.CONSTANT_Package:
                resolved[index] = {
                    tag: entry.tag,
                    name: resolve(entry.name, ConstantType.CONSTANT_Utf8),
                }
                break
            case ConstantType.CONSTANT_String:
                resolved[index] = {
                    tag: entry.tag,
                    value: resolve(entry.value, ConstantType.CONSTANT_Utf8),
                }
                break
            case ConstantType.CONSTANT_NameAndType:
                resolved[index] = {
                    tag: entry.tag,
                    name: resolve(entry.name, ConstantType.CONSTANT_Utf8),
                    descriptor: resolve(entry.descriptor, ConstantType.CONSTANT_Utf8),
                }
                break
            case ConstantType.CONSTANT_MethodType:
                resolved[index] = {
                    tag: entry.tag,
                    descriptor: resolve(entry.descriptor, ConstantType.CONSTANT_Utf8),
                }
                break
            case ConstantType.CONSTANT_Fieldref:
            case ConstantType.CONSTANT_Methodref:
            case ConstantType.CONSTANT_InterfaceMethodref:
                resolved[index] = {
                    tag: entry.tag,
                    class: resolve(entry.class, ConstantType.CONSTANT_Class),
                    nameAndType: resolve(entry.nameAndType, ConstantType.CONSTANT_NameAndType),
                }
                break
            case ConstantType.CONSTANT_MethodHandle: {
                const reference = resolve(entry.reference, ConstantType.CONSTANT_Fieldref, ConstantType.CONSTANT_Methodref, ConstantType.CONSTANT_InterfaceMethodref)
                resolved[index] = {tag: entry.tag, kind: entry.kind, reference}
                break
            }
            case ConstantType.CONSTANT_Dynamic:
            case ConstantType.CONSTANT_InvokeDynamic:
                resolved[index] = {
                    tag: entry.tag,
                    bootstrapMethodIndex: entry.bootstrapMethodIndex,
                    nameAndType: resolve(entry.nameAndType, ConstantType.CONSTANT_NameAndType)
                }
                break
        }
        if (!resolved[index]) {
            throw new Error('oops')
        }
    }
    for (let i = 0; i < cp.length; i++) {
        resolveAt(i)
    }
    return resolved
}