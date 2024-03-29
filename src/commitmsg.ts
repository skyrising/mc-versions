#!/usr/bin/env -S deno run --allow-run

const STATUS_CHARS: Record<string, string> = {
    A: 'Added',
    M: 'Updated',
    R: 'Renamed',
    C: 'Copied'
}

const cp = Deno.run({cmd: ['git', 'status', '--porcelain=v2'], stdout: 'piped'})
const statusText = new TextDecoder().decode(await cp.output())
const {code} = await cp.status()
if (code) {
    Deno.exit(code)
}
const status = statusText.split('\n').filter(Boolean).map(line => {
    const parts = line.split(' ')
    if (parts[0] !== '1') return undefined
    const [_type, xy, _sub, _modeHead, _modeIndex, _modeWorktree, _nameHead, _nameIndex, path] = parts
    const fileStatus = STATUS_CHARS[xy[0]]
    if (!fileStatus) return undefined
    return {status: fileStatus, path}

}).filter(Boolean) as {status: string, path: string}[]

const versionChanges: Record<string, string[]> = {}
for (const file of status) {
    if (!file.path.startsWith('data/version/') || file.path.startsWith('data/version/manifest') || !file.path.endsWith('.json')) continue
    (versionChanges[file.status] = versionChanges[file.status] ?? []).push(file.path.slice(13, file.path.length - 5))
}

let message = ''
if (versionChanges.Added) {
    message += `Add ${versionChanges.Added.sort().join(', ')}`
}
if (versionChanges.Updated) {
    if (versionChanges.Added) {
        message += '\n\nUpdate:\n' + versionChanges.Updated.sort().map(v => '- ' + v).join('\n')
    } else if (versionChanges.Updated.length > 15) {
        message += `Update ${versionChanges.Updated.length} versions\n\n`
        message += versionChanges.Updated.sort().map(v => '- ' + v).join('\n')
    } else {
        message += `Update ${versionChanges.Updated.sort().join(', ')}`
    }
}
if (!message) message = 'Automatic update'

console.log(message)