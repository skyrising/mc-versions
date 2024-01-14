import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'
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
    // deno-lint-ignore ban-types
    const keys = Object.keys(obj as {})
    keys.sort()
    // deno-lint-ignore no-explicit-any
    const newObj: any = {}
    for (const key of keys) {
        // deno-lint-ignore no-explicit-any
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

export async function exists(file: string): Promise<boolean> {
    try {
        await Deno.lstat(file)
        return true
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) return false
        throw e
    }
}

export function evaluateRules(rules: Rule[], context: RuleContext) {
    let action = 'disallow'
    for (const rule of rules) {
        if (evaluate(rule, context)) {
            action = rule.action
        }
    }
    return action
}

export function evaluate(rule: RuleValue, context: RuleContext) {
    for (const key in rule) {
        if (key === 'action') continue
        const ruleValue = rule[key]
        const contextValue = context[key]
        if (typeof ruleValue !== typeof contextValue) return false
        switch (typeof ruleValue) {
            case 'object':
                if (!evaluate(ruleValue, contextValue as RuleContext)) return false
                break
            case 'boolean':
                if (ruleValue !== contextValue) return false
                break
            case 'string':
                if (!RegExp(ruleValue).test(contextValue as string)) return false
                break
        }
    }
    return true
}