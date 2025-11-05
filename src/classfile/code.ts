import { ConstantClass, ConstantFieldref, ConstantInterfaceMethodref, ConstantInvokeDynamic, ConstantMethodref, ConstantPool, ConstantType, getConstant, LoadableConstant, LoadableConstantTypes } from './constants.ts'
import { Reader } from './utils.ts'

export enum Opcode {
    // Constants
    NOP = 0,
    ACONST_NULL = 1,
    ICONST_M1 = 2, ICONST_0, ICONST_1, ICONST_2, ICONST_3, ICONST_4, ICONST_5,
    LCONST_0 = 9, LCONST_1,
    FCONST_0 = 11, FCONST_1, FCONST_2,
    DCONST_0 = 14, DCONST_1,
    BIPUSH = 16, SIPUSH, LDC, LDC_W, LDC2_W,
    // Loads
    ILOAD = 21, LLOAD, FLOAD, DLOAD, ALOAD,
    ILOAD_0 = 26, ILOAD_1, ILOAD_2, ILOAD_3,
    LLOAD_0 = 30, LLOAD_1, LLOAD_2, LLOAD_3,
    FLOAD_0 = 34, FLOAD_1, FLOAD_2, FLOAD_3,
    DLOAD_0 = 38, DLOAD_1, DLOAD_2, DLOAT_3,
    ALOAD_0 = 42, ALOAD_1, ALOAD_2, ALOAD_3,
    IALOAD = 46, LALOAD, FALOAD, DALOAD, AALOAD, BALOAD, CALOAD,
    // Stores
    ISTORE = 54, LSTORE, FSTORE, DSTORE, ASTORE,
    ISTORE_0 = 59, ISTORE_1, ISTORE_2, ISTORE_3,
    LSTORE_0 = 63, LSTORE_1, LSTORE_2, LSTORE_3,
    FSTORE_0 = 67, FSTORE_1, FSTORE_2, FSTORE_3,
    DSTORE_0 = 71, DSTORE_1, DSTORE_2, DSTORE_3,
    ASTORE_0 = 75, ASTORE_1, ASTORE_2, ASTORE_3,
    IASTORE = 79, LASTORE, FASTORE, DASTORE, AASTORE, BASTORE, CASTORE,
    // Stack
    POP = 87, POP2, DUP, DUP_X1, DUP_X2, DUP2, DUP2_X1, DUP2_X2, SWAP,
    // Math
    IADD = 96, LADD, FADD, DADD,
    ISUB = 100, LSUB, FSUB, DSUB,
    IMUL = 104, LMUL, FMUL, DMUL,
    IDIV = 108, LDIV, FDIV, DDIV,
    IREM = 112, LREM, FREM, DREM,
    INEG = 116, LNEG, FNEG, DNEG,
    ISHL = 120, LSHL,
    ISHR = 122, LSHR,
    IUSHR = 124, LUSHR,
    IAND = 126, LAND,
    IOR = 128, LOR,
    IXOR = 130, LXOR,
    IINC = 132,
    // Conversions
    I2L = 133, I2F, I2D, L2I, L2F, L2D, F2I, F2L, F2D, D2I, D2L, D2F, I2B, I2C, I2S,
    // Comparisons
    LCMP = 148,
    FCMPL = 149, FCMPG,
    DCMPL = 151, DCMPG,
    IFEQ = 153, IFNE, IFLT, IFGE, IFGT, IFLE,
    IF_ICMPEQ = 159, IF_ICMPNE, IF_ICMPLT, IF_ICMPGE, IF_ICMPGT, IF_ICMPLE, IF_ACMPEQ, IF_ACMPNE,
    // Control
    GOTO = 167, JSR, RET,
    TABLESWITCH = 170, LOOKUPSWITCH,
    IRETURN = 172, LRETURN, FRETURN, DRETURN, ARETURN, RETURN,
    // References
    GETSTATIC = 178, PUTSTATIC, GETFIELD, PUTFIELD,
    INVOKEVIRTUAL = 182, INVOKESPECIAL, INVOKESTATIC, INVOKEINTERFACE, INVOKEDYNAMIC,
    NEW = 187, NEWARRAY, ANEWARRAY, ARRAYLENGTH,
    ATHROW = 191,
    CHECKCAST = 192, INSTANCEOF,
    MONITORENTER = 194, MONITOREXIT,
    // Extended
    WIDE = 196,
    MULTIANEWARRAY = 197,
    IFNULL = 198, IFNONNULL,
    GOTO_W = 200, JSR_W,
    // Reserved
    BREAKPOINT = 202,
    IMPDEP1 = 254, IMPDEP2,
}

export enum ArrayType {
    T_BOOLEAN = 4, T_CHAR, T_FLOAT, T_DOUBLE, T_BYTE, T_SHORT, T_INT, T_LONG
}

type IntInstruction = {
    op: (typeof Opcode)['BIPUSH'|'SIPUSH'|'NEWARRAY']
    operand: number
}

type LdcInstruction = {
    op: (typeof Opcode)['LDC'|'LDC_W'|'LDC2_W']
    value: LoadableConstant<true>
}

type VarInstruction = {
    op: (typeof Opcode)['ILOAD'|'LLOAD'|'FLOAD'|'DLOAD'|'ALOAD'|'ISTORE'|'LSTORE'|'FSTORE'|'DSTORE'|'ASTORE'|'RET']
    var: number
    wide: boolean
}

type JumpInstruction = {
    op: (typeof Opcode)['IFEQ'|'IFNE'|'IFLT'|'IFGE'|'IFGT'|'IFLT'|'IF_ICMPEQ'|'IF_ICMPNE'|'IF_ICMPLT'|'IF_ICMPGE'|'IF_ICMPGT'|'IF_ICMPLE'|'IF_ACMPEQ'|'IF_ACMPNE'|'GOTO'|'JSR'|'GOTO_W'|'JSR_W']
    target: number
}

type FieldInstruction = {
    op: (typeof Opcode)['GETSTATIC'|'PUTSTATIC'|'GETFIELD'|'PUTFIELD']
    field: ConstantFieldref<true>
}

type InvokeInstruction = {
    op: (typeof Opcode)['INVOKEVIRTUAL'|'INVOKESPECIAL'|'INVOKESTATIC'|'INVOKEINTERFACE']
    method: ConstantMethodref<true>|ConstantInterfaceMethodref<true>
}

type TypeInstruction = {
    op: (typeof Opcode)['NEW'|'CHECKCAST'|'INSTANCEOF'|'ANEWARRAY']
    type: ConstantClass<true>
}

type ComplexInstruction =
| IntInstruction
| LdcInstruction
| VarInstruction
| JumpInstruction
| FieldInstruction
| InvokeInstruction
| TypeInstruction
| {op: Opcode.TABLESWITCH, default: number, low: number, high: number, targets: number[]}
| {op: Opcode.LOOKUPSWITCH, default: number, cases: {match: number, target: number}[]}
| {op: Opcode.INVOKEDYNAMIC, callSite: ConstantInvokeDynamic<true>}
| {op: Opcode.IINC, var: number, increment: number, wide: boolean}
| {op: Opcode.NEWARRAY, type: ArrayType}
| {op: Opcode.MULTIANEWARRAY, type: ConstantClass<true>, dimensions: number}

export type Instruction =
| ComplexInstruction
| {op: Exclude<Opcode, ComplexInstruction['op']>}

export type InstructionNode = {
    bci: number
} & Instruction

function parseInstruction(reader: Reader, cp: ConstantPool<true>): Instruction {
    const bci = reader.position
    const op = reader.u1()
    switch(op) {
        case Opcode.BIPUSH: return {op, operand: reader.i1()}
        case Opcode.SIPUSH: return {op, operand: reader.i2()}
        case Opcode.LDC: return {op, value: getConstant(cp, reader.u1(), ...LoadableConstantTypes)}
        case Opcode.LDC_W: case Opcode.LDC2_W: return {op, value: getConstant(cp, reader.u2(), ...LoadableConstantTypes)}
        case Opcode.ILOAD: case Opcode.LLOAD: case Opcode.FLOAD: case Opcode.DLOAD: case Opcode.ALOAD:
        case Opcode.ISTORE: case Opcode.LSTORE: case Opcode.FSTORE: case Opcode.DSTORE: case Opcode.ASTORE: case Opcode.RET:
            return {op, var: reader.u1(), wide: false}
        case Opcode.IINC:
            return {op, var: reader.u1(), increment: reader.i1(), wide: false}
        case Opcode.IFEQ: case Opcode.IFNE: case Opcode.IFLT: case Opcode.IFGE: case Opcode.IFGT: case Opcode.IFLE:
        case Opcode.IF_ICMPEQ: case Opcode.IF_ICMPNE: case Opcode.IF_ICMPLT: case Opcode.IF_ICMPGE: case Opcode.IF_ICMPGT: case Opcode.IF_ICMPLE:
        case Opcode.IF_ACMPEQ: case Opcode.IF_ACMPNE: case Opcode.GOTO: case Opcode.JSR: case Opcode.IFNULL: case Opcode.IFNONNULL:
            return {op, target: reader.u2()}
        case Opcode.TABLESWITCH: {
            reader.position += (4 - (reader.position & 3)) & 3
            const def = bci + reader.i4()
            const low = reader.i4()
            const high = reader.i4()
            const targets = []
            for (let i = low; i <= high; i++) targets.push(bci + reader.i4())
            return {op, default: def, low, high, targets}
        }
        case Opcode.LOOKUPSWITCH: {
            reader.position += (4 - (reader.position & 3)) & 3
            const def = bci + reader.i4()
            const count = reader.u4()
            const cases = []
            for (let i = 0; i < count; i++) cases.push({match: reader.i4(), target: bci + reader.i4()})
            return {op, default: def, cases}
        }
        case Opcode.GETSTATIC: case Opcode.PUTSTATIC: case Opcode.GETFIELD: case Opcode.PUTFIELD:
            return {op, field: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Fieldref)}
        case Opcode.INVOKEVIRTUAL:
            return {op, method: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Methodref)}
        case Opcode.INVOKESPECIAL: case Opcode.INVOKESTATIC:
            return {op, method: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Methodref, ConstantType.CONSTANT_InterfaceMethodref)}
        case Opcode.INVOKEINTERFACE: {
            const method = getConstant(cp, reader.u2(), ConstantType.CONSTANT_InterfaceMethodref)
            reader.u1()
            reader.u1()
            return {op, method}
        }
        case Opcode.INVOKEDYNAMIC: {
            const callSite = getConstant(cp, reader.u2(), ConstantType.CONSTANT_InvokeDynamic)
            reader.u1()
            reader.u1()
            return {op, callSite}
        }
        case Opcode.NEW: case Opcode.ANEWARRAY:
        case Opcode.CHECKCAST: case Opcode.INSTANCEOF:
            return {op, type: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Class)}
        case Opcode.NEWARRAY:
            return {op, type: reader.u1()}
        case Opcode.MULTIANEWARRAY:
            return {op, type: getConstant(cp, reader.u2(), ConstantType.CONSTANT_Class), dimensions: reader.u1()}
        case Opcode.GOTO_W: case Opcode.JSR_W:
            return {op, target: reader.u4()}
        case Opcode.WIDE: {
            const op1 = reader.u1()
            switch (op1) {
                case Opcode.ILOAD: case Opcode.LLOAD: case Opcode.FLOAD: case Opcode.DLOAD: case Opcode.ALOAD:
                case Opcode.ISTORE: case Opcode.LSTORE: case Opcode.FSTORE: case Opcode.DSTORE: case Opcode.ASTORE: case Opcode.RET:
                    return {op: op1, var: reader.u2(), wide: true}
                case Opcode.IINC:
                    return {op: op1, var: reader.u2(), increment: reader.i2(), wide: true}
                default:
                    throw new Error(`Unknown wide op: ${Opcode[op1]}`)
            }
        }

        default: return {op}
    }
}

function addToStringTag(insn: InstructionNode) {
    Object.defineProperty(insn, Symbol.toStringTag, {
        enumerable: false,
        value: Opcode[insn.op]
    })
    return insn
}

export function parseInstructions(code: Uint8Array, cp: ConstantPool<true>, simplify = true): InstructionNode[] {
    const reader = new Reader(code)
    const instructions = []
    while (reader.position < code.length) {
        instructions.push(addToStringTag({bci: reader.position, ...parseInstruction(reader, cp)}))
    }
    return simplify ? simplifyInstructions(instructions) : instructions
}

export function simplifyInstruction(insn: InstructionNode) {
    if (insn.op >= Opcode.ILOAD_0 && insn.op <= Opcode.ALOAD_3) {
        const index = (insn.op - Opcode.ILOAD_0) & 3
        const op = ((insn.op - Opcode.ILOAD_0) >> 2) + Opcode.ILOAD
        return addToStringTag({...insn, op, var: index, wide: false} as InstructionNode & VarInstruction)
    }
    if (insn.op >= Opcode.ISTORE_0 && insn.op <= Opcode.ASTORE_3) {
        const index = (insn.op - Opcode.ISTORE_0) & 3
        const op = ((insn.op - Opcode.ISTORE_0) >> 2) + Opcode.ISTORE
        return addToStringTag({...insn, op, var: index, wide: false} as InstructionNode & VarInstruction)
    }
    if (insn.op === Opcode.LDC_W || insn.op === Opcode.LDC2_W) {
        return addToStringTag({...insn, op: Opcode.LDC})
    }
    return insn
}

export function simplifyInstructions(instructions: InstructionNode[]) {
    return instructions.map(simplifyInstruction)
}