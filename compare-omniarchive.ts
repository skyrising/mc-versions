#!/usr/bin/env -S deno run -A
// deno-lint-ignore-file no-explicit-any

import './types.d.ts'
import { auth, Sheets } from 'https://googleapis.deno.dev/v1/sheets:v4.ts'

const account = auth.fromJSON(JSON.parse(await Deno.readTextFile('google-service-account.json')))
const sheetsApi = new Sheets(account)

const spreadsheet = await sheetsApi.spreadsheetsGet('1OCxMNQLeZJi4BlKKwHx2OlzktKiLEwFXnmCrSdAFwYQ', {includeGridData: true})
const omniVersions = []
for (const sheet of spreadsheet.sheets!) {
    if (sheet.properties!.sheetId === 1427179805) continue
    const grid = sheet.data![0]
    let title: (string|undefined)[] = []
    let previous: Record<string, any> = {}
    for (const row of grid.rowData!) {
        const colors = row.values!.map(cell => getStatus(cell.effectiveFormat?.backgroundColorStyle?.rgbColor || {}))
        const status = colors[colors.length - 1]
        const text = row.values!.map(cell => cell.formattedValue)
        if (status.type === 'header' && text[1] === 'ID') {
            title = text.map(it => it?.toLowerCase())
            continue
        }
        let data: Record<string, any> = {...status, category: title[0]!}
        for (let i = 0; i < title.length; i++) {
            if (i === 0) continue
            const cell = row.values![i]
            if (!cell) continue
            const value = cell.effectiveValue
            if (!value) continue
            let rawValue: string|number|Date|undefined = cell.hyperlink ?? value.numberValue ?? value.stringValue?.trim()
            if (cell.effectiveFormat?.numberFormat?.type === 'DATE') rawValue = new Date(cell.formattedValue!)
            if (typeof rawValue === 'string' && !rawValue.includes('.') && Number(rawValue).toString() === rawValue) rawValue = Number(rawValue)
            if (title[i] && rawValue !== undefined) data[title[i]!] = rawValue
        }
        const sheetId = sheet.properties?.sheetId
        const platform: string|undefined = data?.platform
        if (sheetId === 872531987 || sheetId === 804883379 || platform?.startsWith('Client')) data.type = 'client'
        else if (sheetId === 2126693093 || sheetId === 59329510 || platform?.startsWith('Server')) data.type = 'server'
        if (!data.id && !data.version) data = {...previous, ...data}
        omniVersions.push(data)
        //console.log(JSON.stringify(data))
        previous = data
    }
}

const mcVersions: VersionData[] = []
for await (const file of Deno.readDir('data/version')) {
    if (file.isDirectory) continue
    mcVersions.push(JSON.parse(await Deno.readTextFile('data/version/' + file.name)))
}

const allOmni = new Set(omniVersions.filter(version => {
    if (!version.found || !version.type) return false
    if (version.notes?.includes('Headache Type 3') && version.id.endsWith('-pre')) return false
    return true
}).map(version => `${version.type}-${omni2mcv(version.id)}`))
for (const version of omniVersions) {
    if (version.notes?.includes('Headache Type 3') && !version.id.endsWith('-pre')) {
        allOmni.delete('client-' + version.id + '-pre')
        allOmni.delete('server-' + version.id + '-pre')
    }
}
allOmni.delete('client-1.7.3')
allOmni.add('client-1.7.3-pre')
allOmni.add('server-1.7.3-pre')
// Oddballs
for (const type of ['client', 'server']) for (const variant of ['red', 'blue', 'purple']) allOmni.add(type + '-af-2013-' + variant)
allOmni.add('server-' + omni2mcv('b1.6-trailer'))

const allMcVersions = new Set(mcVersions.flatMap(v => {
    const result = []
    if (v.client) result.push('client-' + v.id)
    if (v.id.startsWith('server-')) result.push(v.id)
    else if (v.server || v.downloads.server_zip) result.push('server-' + v.id)
    return result
}))

const all = new Set([...allOmni, ...allMcVersions])
const diff: string[] = []
for (const version of all) {
    if (allOmni.has(version) && allMcVersions.has(version)) continue
    diff.push(`${version} ${allOmni.has(version) ? 'omni' : 'mc-versions'}`)
}
diff.sort()
for (const set of Object.values(groupBy(diff, d => {
    const v = d.slice(0, d.indexOf(' '))
    const dash = v.lastIndexOf('-')
    return dash > 7 ? v.slice(7, dash) : v.slice(7)
}))) {
    for (const d of set) console.log(d)
    console.log()
}

function omni2mcv(version: string) {
    const v2 = ({
        // TODO: Fix in mc-versions:
        '1.0.0-rc2-1633': '1.0.0-rc2-1',
        '1.0.0-rc2-1649': '1.0.0-rc2-2',
        '1.0.0-rc2-1656': '1.0.0-rc2-3',
        '1.16.5-rc1-1005': '1.16.5-rc1-1',
        '1.16.5-rc1-1558': '1.16.5-rc1-2',
        // Maybe adjust in mc-versions (not strictly wrong, but doesn't match omni):
        'b1.6-trailer': 'b1.6-pre-trailer',
        'b1.8-pre1-081459': 'b1.8-pre1-201109081459',
        'b1.8-pre1-091357': 'b1.8-pre1-201109091357',
        'b1.8-pre1-091358': 'b1.8-pre1-201109091357',
        'b1.9-pre3': 'b1.9-pre3-201110061350',
        'b1.9-pre3-1350': 'b1.9-pre3-201110061350',
        'b1.9-pre3-1402': 'b1.9-pre3-201110061402',
        'b1.9-pre4-1425': 'b1.9-pre4-201110131425',
        'b1.9-pre4-1434': 'b1.9-pre4-201110131434',
        'b1.9-pre4-1435': 'b1.9-pre4-201110131434',
        'b1.9-pre4-1441': 'b1.9-pre4-201110131440',
        '1.3-pre-1249': '1.3-pre-07261249',
        '1.4.1-pre-1338': '1.4.1-pre-10231538',
        '1.6-pre-1517': '1.6-pre-06251516',
        '1.16-221349': '1.16-1149',
        '1.16-231620': '1.16-1420',
        '13w16a-192037': '13w16a-04192037',
        '13w16b-2151': '13w16b-04232151',
        '13w23b-0101': '13w23b-06080101',
        '13w23b-0102': '13w23b-06080101',
        '13w36a-1446': '13w36a-09051446',
        '13w36b-1310': '13w36b-09061310',
        '14w27b-1646': '14w27b-07021646',
        '14w34c-1549': '14w34c-08191549',
        'combat7': 'combat-7a',
        // Found versions are not ambiguous (can stay like that until the other version is found):
        'c0.0.12a_03-200018': 'c0.0.12a_03',
        'c0.0.16a_02-081047': 'c0.0.16a_02',
        'c0.0.17a-2014': 'c0.0.17a',
        'c0.0.21a-2008': 'c0.0.21a',
        '1.7-pre-1602': '1.7-pre',
        '1.7.10-pre2-1045': '1.7.10-pre2',
        '12w17a-04261424': '12w17a',
        '12w17a-1424': '12w17a',
        '12w32a-1532': '12w32a',
        '12w39a-1243': '12w39a',
        '13w12~-1439': '13w12~',
        '13w38c-1516': '13w38c',
        '14w04a-1740': '14w04a',
        '14w11b-1650': '14w11b',
        // Versions where omniarchive has different versions for client and server, while mc-versions combines some of them:
        'b1.1': 'b1.1-1245',
        'b1.4': 'b1.4-1507',
        '1.6.2': '1.6.2-091847',
        '1.7.7': '1.7.7-101331',
        '1.14.2-pre4-270721': '1.14.2-pre4-270720',
        '13w05a-1503': '13w05a-1504',
        '13w05a-1537': '13w05a-1538',
        '13w06a-1558': '13w06a-1559',
        '13w36b': '13w36b-09061310',
        '13w41b': '13w41b-1523',
        '14w04b-1555': '14w04b-1554',
        '17w18a-1331': '17w18a',
        '17w18a-1450': '17w18a',
        // Pretty sure the UTC conversion was done incorrectly for omniarchive:
        'in-20091231-2255': 'in-20091231-2257',
        'in-20100104-2258': 'in-20100105',
        'in-20100218-0016': 'in-20100218',
        'inf-20100616-1808': 'inf-20100616',
        // Other
        '1.2-pre': '1.2',
    })[version]
    if (v2) return v2
    if (version.startsWith('combat')) return 'combat-' + version.slice(6)
    if (version.startsWith('1.18-exp')) return '1.18_experimental-snapshot-' + version.slice(8)
    if (version.startsWith('1.19-exp')) return '1.19_deep_dark_experimental_snapshot-' + version.slice(8)
    return version
}

function rgb2hsv(color: {red?: number, green?: number, blue?: number}) {
    const red = color.red || 0; const green = color.green || 0; const blue = color.blue || 0
    const value = Math.max(red, green, blue)
    const chroma = value - Math.min(red, green, blue)
    const hue = chroma === 0 ? 0 :
        value === red ? 60 * (((green - blue) / chroma) % 6) :
        value === green ? 60 * ((blue - red) / chroma + 2) :
        60 * ((red - green) / chroma + 4)
    const saturation = value === 0 ? 0 : chroma / value
    return {hue, saturation, value}
}

function getStatus(color: {red?: number, green?: number, blue?: number}) {
    const hsv = rgb2hsv(color)
    if (hsv.value === 0) return {type: 'header'}
    return [
        // 0°
        {found: false, hasProof: true}, // red
        {found: false, hasProof: false}, // yellow
        // 60°
        {},
        {found: true}, // green
        // 120°
        {},
        {},
        // 180°
        {found: true, modified: true}, // blue
        {found: true, modified: true}, // blue
        // 240°
        {},
        {},
        // 300°
        {},
        {},
        // 360°
    ][Math.floor(hsv.hue / 30)]
}

function groupBy<T, K extends keyof any>(values: T[], groupBy: (value: T) => K) {
    const groups: Record<K, T[]> = {} as any
    for (const v of values) {
        const group = groupBy(v)
        ;(groups[group] = groups[group] || []).push(v)
    }
    return groups
}