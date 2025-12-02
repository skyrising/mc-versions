import * as semver from 'https://deno.land/x/semver@v1.4.0/mod.ts'
import { assertEquals, assertNotEquals } from 'jsr:@std/assert'
import type {VersionType} from './types.d.ts'
import SNAPSHOT_TARGETS_DATA from './snapshots.json' with {type: 'json'}

function getYearAndWeek(date: Date): [number, number] {
    date = new Date(date.getTime())
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
    const week1 = new Date(date.getFullYear(), 0, 4)
    return [date.getFullYear() % 100, 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)]
}

const SNAPSHOT_TARGETS = Object.fromEntries(Object.entries(SNAPSHOT_TARGETS_DATA.releaseWeeks).map(
    ([version, date]) => [version, getYearAndWeek(new Date(date))] as [string, [number, number]]
))

const NEXT_TARGET = SNAPSHOT_TARGETS_DATA.next

function getReleaseTargetForId(id: string) {
    if (/^\d+(\.\d+)/.test(id)) {
        let end = id.length
        if (id.includes('_')) end = id.indexOf('_')
        if (id.includes('-')) end = Math.min(end, id.indexOf('-'))
        return id.slice(0, end)
    } else if (/^\d{2}w\d{2}/.test(id)) {
        const [, yearStr, weekStr] = id.match(/^(\d{2})w(\d{2})/)!
        return getSnapshotTarget(+yearStr, +weekStr)
    } else if (id.startsWith('b1.9')) {
        return '1.0.0'
    } else if (id.startsWith('combat-')) {
        return {
            1: '1.14.3-pre.4',
            2: '1.14.5',
            3: '1.14.5',
            4: '1.15.0-pre.3',
            5: '1.15.2-pre.1',
            6: '1.16.2-pre.3',
            7: '1.16.3',
            8: '1.16.3',
        }[parseInt(id.slice(7))]
    }
}

export function getReleaseTarget(data: VersionData) {
    if (data.releaseTarget !== undefined) return data.releaseTarget
    return getReleaseTargetForId(data.id)
}

export function getSnapshotTarget(year: number, week: number): string | undefined {
    for (const version in SNAPSHOT_TARGETS) {
        const end = SNAPSHOT_TARGETS[version]
        if (year < end[0] || (year === end[0] && week < end[1])) {
            return version
        }
    }
    return NEXT_TARGET
}

Deno.test("normalizeVersion", async t => {
    const MAPPING = {
        'rd-132211-launcher': '0.0.0-rd.132211+launcher',
        'c0.0.11a-launcher': '0.11.0+a.launcher',
        'c0.0.12a_03': '0.12.3+a',
        'c0.0.13a-launcher': '0.13.0+a.launcher',
        'c0.0.13a_03-launcher': '0.13.3+a.launcher',
        'server-c1.2': '0.30.0-classic.server.1.2.0',
        'c0.0.19a_06-0137': '0.19.6+a.0137',
        'c0.0.23a_01': '0.23.1+a',
        'c0.24_st_03': '0.24.3+st',
        'c0.25_05_st': '0.25.5+st',
        'c0.30-c-renew': '0.30.0+c.renew',
        'in-20091223-1459': '0.31.20091223+1459',
        'a1.0.1_01': '1.0.0-alpha.1.0.1.1',
        'a1.0.4-launcher': '1.0.0-alpha.1.0.4+launcher',
        'a1.0.5-2149': '1.0.0-alpha.1.0.5+2149',
        'server-a0.1.2_01': '1.0.0-alpha.server.0.1.2.1',
        'b1.0': '1.0.0-beta.1.0.0',
        'b1.0_01': '1.0.0-beta.1.0.1',
        'b1.0.2': '1.0.0-beta.1.0.2',
        'b1.1-1245': '1.0.0-beta.1.1.0+1245',
        'b1.2_02-launcher': '1.0.0-beta.1.2.2+launcher',
        'b1.2_02-20110517': '1.0.0-beta.1.2.2+20110517',
        'b1.6-pre-trailer': '1.0.0-beta.1.6.0.pre+trailer',
        'b1.6': '1.0.0-beta.1.6.0.z',
        'b1.6-tb3': '1.0.0-beta.1.6.0.test.3',
        'b1.8-pre1-201109081459': '1.0.0-beta.1.8.0.pre.1+201109081459',
        'b1.9-pre1': '1.0.0-pre.1',
        '1.0.0-rc1': '1.0.0-rc.1',
        '1.0.0-rc2-1': '1.0.0-rc.2+1',
        '1.0.0': '1.0.0',
        '11w47a': '1.1.0-alpha.11.47.a',
        '1.1': '1.1.0',
        '12w05a-1354': '1.2.0-alpha.12.5.a+1354',
        'af-2013-red': '2.0.0-april.fools.2.red',
        '1.6-pre-06251516': '1.6.0-pre+06251516',
        'af-2015': '1.8.4-april.fools',
        'af-2019': '1.14.0-alpha.19.14.april.fools',
        'combat-1': '1.14.3-pre.4.combat.1',
        'af-2020': '1.16.0-alpha.20.14.april.fools',
        '1.18_experimental-snapshot-1': '1.18.0-Experimental.1',
        '1.19_deep_dark_experimental_snapshot-1': '1.19.0-Deep.Dark.Experimental.1',
        'af-2022': '1.19.0-alpha.22.14.april.fools',
        'af-2023-1': '1.20.0-alpha.23.13.april.fools.1',
        'af-2024': '1.20.5-alpha.24.14.april.fools',
        'af-2024-2': '1.20.5-alpha.24.14.april.fools.2',
        'af-2025': '1.21.6-alpha.25.14.april.fools',
        '25w45a_unobfuscated': '1.21.11-alpha.25.45.a.unobfuscated',
        '1.21.11-pre1_unobfuscated': '1.21.11-pre.1.unobfuscated',
        '26.1': '26.1.0',
        '26.1.1': '26.1.1',
        '26.1-snapshot-1': '26.1.0-alpha.1',
        '26.1-pre-1': '26.1.0-pre.1',
        '26.1-rc-1': '26.1.0-rc.1',
    }
    for (const [k, v] of Object.entries(MAPPING)) {
        await t.step(k, () => {
            const normalized = normalizeVersion(k, getReleaseTargetForId(k))
            assertEquals(normalized, v)
            if (!k.startsWith('af-')) assertNotEquals(getType(normalized!), 'other')
        })
    }
})

export function normalizeVersion(omniId: VersionId, releaseTarget?: VersionId | undefined) {
    const unobfuscated = omniId.endsWith('_unobfuscated') ? '.unobfuscated' : ''
    if (unobfuscated) omniId = omniId.slice(0, -13)
    // Extract all the numeric parts
    const numbers = (omniId.match(/\d+/g) || []).map(n => Number(n))
    // Extract all the non-numeric parts (Used for classic where this can contain 'a', 'st' etc.)
    const letters = omniId.split(/[\d._\-]/).filter(Boolean)
    const parts = omniId.split('-')
    const properTarget = releaseTarget && (releaseTarget.split('.').length < 3 ? releaseTarget + '.0' : releaseTarget)
    const server = parts[0] === 'server'
    if (server) parts.shift()
    if (parts[0] === 'b1.9') {
        parts[0] = '1.0.0'
    }
    function buildPart(index: number) {
        if (parts.length <= index) return ''
        return '+' + parts.slice(index).join('.')
    }

    // Beta
    if (parts[0].startsWith('b')) {
        const betaVersion = semver.coerce(parts[0].substring(1).replaceAll('_0', '.'))?.toString()
        if (parts[1] && parts[1].startsWith('pre')) {
            return `1.0.0-beta.${betaVersion}.pre${parts[1].length > 3 ? '.' + parts[1].substring(3) : ''}${buildPart(2)}`
        }
        if (parts[1] && parts[1].startsWith('tb')) {
            return `1.0.0-beta.${betaVersion}.test.${parts[1].substring(2)}${buildPart(2)}`
        }
        if (betaVersion === '1.8.0' || betaVersion === '1.6.0') {
            // Since we're already in the pre-release part we need to fix lexicographic ordering for these
            return `1.0.0-beta.${betaVersion}.z${buildPart(1)}`
        }
        return `1.0.0-beta.${betaVersion}${buildPart(1)}`
    }

    // Alpha
    if (parts[0].startsWith('a') && parts[0] !== 'af') {
        if (server) return '1.0.0-alpha.server.' + parts[0].substring(1).replaceAll('_0', '.') + buildPart(1)
        return '1.0.0-alpha.' + parts[0].substring(1).replaceAll('_0', '.') + buildPart(1)
    }

    // Indev / Infdev
    if (parts[0].startsWith('in')) return '0.31.' + omniId.substring(omniId.indexOf('-') + 1).replace('-', '+')

    // combat-\d+[a-z]?
    if (parts[0] === 'combat') {
        return `${releaseTarget}${releaseTarget?.includes('-') ? '.' : '-'}combat.${[...parts[1]].join('.')}`
    }

    // Classic
    if (parts[0].startsWith('c')) {
        // replace 0.0.x.y with 0.x.y
        if (numbers[1] === 0) numbers.shift()
        letters.shift()
        if (server) letters.shift()
        const plusComponents = [...new Set([...letters, ...parts.slice(1)])]
        if (server) return `0.30.0-classic.server.${numbers[0]}.${numbers[1]}.${numbers[2] || 0}${plusComponents.length ? '+' + plusComponents.join('.') : ''}`
        return `${numbers[0]}.${numbers[1]}.${numbers[2] || 0}${plusComponents.length ? '+' + plusComponents.join('.') : ''}`
    }

    // Pre-classic / RubyDung
    if (parts[0] === 'rd') {
        return `0.0.0-rd.${parts[1]}${buildPart(2)}`
    }

    // Regular snapshot: {yy}w{ww}[a-z~]
    if (/^\d{2}w\d{2}.$/.test(parts[0])) {
        return properTarget + `-alpha.${numbers[0]}.${numbers[1]}.${letters[1] >= 'a' && letters[1] <= 'z' ? letters[1] : 'a'}${unobfuscated}${buildPart(1)}`
    }

    // Experimental snapshots: Upper-case to sort before lower-case 'alpha'
    // 1.18_experimental-snapshot-<n>
    if (letters[0] === 'experimental') return properTarget + '-Experimental.' + numbers[2]
    // 1.19_deep_dark_experimental_snapshot-<n>
    if (letters[2] === 'experimental') return properTarget + '-' + letters.slice(0, 3).map(part => part[0].toUpperCase() + part.slice(1)).join('.') + '.' + numbers[2]

    // (Pre-)Releases and release candidates
    if (parts[0] === releaseTarget) {
        if (parts.length === 1) return properTarget
        // <year>.<drop>-<snapshot-type>-<build>
        if (numbers[0] >= 26 && (parts[1] === 'snapshot' || parts[1] === 'pre' || parts[1] === 'rc')) {
            return `${properTarget}-${parts[1] === 'snapshot' ? 'alpha' : parts[1]}.${parts[2]}${unobfuscated}${buildPart(3)}`
        }
        if (parts[1] && parts[1].startsWith('pre')) {
            const pre = parts[1].substring(3)
            return `${properTarget}-pre${pre ? '.' + pre : ''}${unobfuscated}${buildPart(2)}`
        }
        if (parts[1] && parts[1].startsWith('rc')) {
            const rc = parts[1].substring(2)
            return `${properTarget}-rc${rc ? '.' + rc : ''}${unobfuscated}${buildPart(2)}`
        }
        return `${properTarget}+${parts.slice(1).join('.')}`
    }

    // April Fools
    if (parts[0] === 'af') {
        switch (numbers[0]) {
            case 2013: return `2.0.0-april.fools.2.${letters[1]}`
            case 2015: return '1.8.4-april.fools'
            case 2019: return '1.14.0-alpha.19.14.april.fools'
            case 2020: return '1.16.0-alpha.20.14.april.fools'
            case 2022: return '1.19.0-alpha.22.14.april.fools'
            case 2023: return `1.20.0-alpha.23.13.april.fools.${parts[2]}`
            case 2024: return `1.20.5-alpha.24.14.april.fools${parts[2] ? '.' + parts[2] : ''}`
            case 2025: return '1.21.6-alpha.25.14.april.fools'
        }
    }
    console.log({omniId, numbers, letters, parts, releaseTarget, properTarget, unobfuscated})
    return undefined
}

export function getType(normalizedVersion: string): VersionType {
    const version = semver.parse(normalizedVersion)
    if (!version) throw Error(`Invalid SemVer: ${normalizedVersion}`)
    if (version.major === 0) {
        if (version.minor === 0) return 'pre-classic'
        if (version.minor <= 30) return 'classic'
        if (version.minor == 31) return version.patch < 20100227 ? 'indev' : 'infdev'
    }
    if (!version.prerelease.length) return 'release'
    if (version.major >= 1) {
        switch (version.prerelease[0]) {
            case 'alpha':
                if (version.minor === 0 && version.patch === 0) return 'alpha'
                if (version.prerelease.length === 4 || version.major >= 26 || version.prerelease.at(-1) === 'unobfuscated') return 'snapshot'
                break
            case 'beta': return 'beta'
            case 'pre': return 'pre-release'
            case 'rc': return 'release-candidate'
            case 'Experimental': case 'Deep': return 'experimental'
        }
    }
    console.log(version)
    return 'other'
}
