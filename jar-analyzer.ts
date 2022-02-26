import * as path from 'https://deno.land/std@0.113.0/path/mod.ts'

export function shouldCheckJar(data: VersionData) {
    if (data.protocol === undefined) return true
    if (!data.world && data.releaseTime > '2010-06-27') return true
    if (!data.releaseTarget && !data.id.startsWith('af-') && data.releaseTime > '2011-11-13') return true
    return false
}

export async function parseJarInfo(file: string): Promise<Partial<VersionData>> {
    const javaHome = Deno.env.get('JAVA_HOME')
    const javaPath = javaHome ? path.resolve(javaHome, 'bin', 'java') : 'java'
    const c = Deno.run({
        cmd: [javaPath, '-jar', 'jar-analyzer/build/libs/jar-analyzer-all.jar', file],
        stdout: 'piped',
        stderr: 'piped'
    })
    const {code} = await c.status()
    const stdout = await c.output()
    const stderr = await c.stderrOutput()
    if (code) {
        throw Error(new TextDecoder().decode(stderr))
    }
    return JSON.parse(new TextDecoder().decode(stdout))
}