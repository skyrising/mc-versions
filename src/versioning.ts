import * as semver from 'https://deno.land/x/semver@v1.4.0/mod.ts'
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

export function getReleaseTarget(data: VersionData) {
    if (data.releaseTarget !== undefined) return data.releaseTarget
    if (/^\d+(\.\d+)/.test(data.id)) {
        if (data.id.includes('_')) {
            return data.id.slice(0, data.id.indexOf('_'))
        } else if (data.id.includes('-')) {
            return data.id.slice(0, data.id.indexOf('-'))
        } else {
            return data.id
        }
    } else if (/^\d{2}w\d{2}/.test(data.id)) {
        const [, yearStr, weekStr] = data.id.match(/^(\d{2})w(\d{2})/)!
        return getSnapshotTarget(+yearStr, +weekStr)
    } else if (data.id.startsWith('b1.9')) {
        return '1.0.0'
    }
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

export function normalizeVersion(omniId: VersionId, releaseTarget: VersionId | undefined) {
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
        return properTarget + `-alpha.${numbers[0]}.${numbers[1]}.${letters[1] >= 'a' && letters[1] <= 'z' ? letters[1] : 'a'}${buildPart(1)}`
    }

    // Unobfuscated snapshot: {yy}w{ww}[a-z~]_unobfuscated
    if (/^\d{2}w\d{2}._unobfuscated$/.test(parts[0])) {
        return properTarget + `-alpha.${numbers[0]}.${numbers[1]}.${letters[1] >= 'a' && letters[1] <= 'z' ? letters[1] : 'a'}.unobfuscated${buildPart(1)}`
    }

    // Experimental snapshots: Upper-case to sort before lower-case 'alpha'
    // 1.18_experimental-snapshot-<n>
    if (letters[0] === 'experimental') return properTarget + '-Experimental.' + numbers[2]
    // 1.19_deep_dark_experimental_snapshot-<n>
    if (letters[2] === 'experimental') return properTarget + '-' + letters.slice(0, 3).map(part => part[0].toUpperCase() + part.slice(1)).join('.') + '.' + numbers[2]

    // Pre-releases and release candidates
    if (parts[0] === releaseTarget) {
        if (parts.length === 1) return properTarget
        if (parts[1] && parts[1].startsWith('pre')) {
            const pre = parts[1].substring(3)
            return `${properTarget}-pre${pre ? '.' + pre : ''}${buildPart(2)}`
        }
        if (parts[1] && parts[1].startsWith('rc')) {
            const rc = parts[1].substring(2)
            return `${properTarget}-rc${rc ? '.' + rc : ''}${buildPart(2)}`
        }
        return `${properTarget}+${parts.slice(1).join('.')}`
    }
    console.log(omniId, numbers, letters, parts, releaseTarget, properTarget)
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
    if (version.major === 1) {
        switch (version.prerelease[0]) {
            case 'alpha':
                if (version.minor === 0 && version.patch === 0) return 'alpha'
                if (version.prerelease.length === 4) return 'snapshot'
                break
            case 'beta': return 'beta'
            case 'pre': return 'pre-release'
            case 'rc': return 'release-candidate'
        }
    }
    return 'other'
}
