#!/usr/bin/env -S deno run --allow-read

const MAIN_MANIFEST = JSON.parse(await Deno.readTextFile('data/version_manifest.json'))
const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Stats = [number[], number[], number[], number[], number[], number[], number[]]
const stats: Record<string, Stats> = {}
for (let i = MAIN_MANIFEST.versions.length - 1; i >= 0; i--) {
    const info = MAIN_MANIFEST.versions[i]
    const details = JSON.parse(await Deno.readTextFile(`data/version/${info.omniId}.json`))
    if (!details.publicTime) continue
    const releaseTime = new Date(details.publicTime || details.releaseTime)
    if (releaseTime.getUTCHours() === 0 && releaseTime.getUTCMinutes() === 0) continue
    const age = releaseTime.valueOf() - Date.parse(details.releaseTime)
    const tags = ['all', info.type]
    if (/^\d{2}w\d{2}/.test(info.id)) {
        tags.push('real-snapshot')
        tags.push(info.id[5] + '-snapshot')
    }
    const dayOfWeek = releaseTime.getDay()
    const timeOfDay = releaseTime.getHours() * 60 + releaseTime.getMinutes()
    for (const tag of tags) {
        const statsOfType = stats[tag] = stats[tag] || [[], [], [], [], [], [], []]
        statsOfType[dayOfWeek].push(timeOfDay)
        if (tag === 'a-snapshot') console.log(tag, minutesToTime(timeOfDay), DAY_OF_WEEK[dayOfWeek], info.omniId, `${Math.round(age / 60e3)}m`, formatStats(statsOfType[dayOfWeek]))
    }
}
for (const type in stats) {
    console.log(type + '\n' + stats[type].map((s, i) => DAY_OF_WEEK[i] + ' ' + formatStats(s)).join('\n'))
}

function formatStats(stats: number[]) {
    const [mean, stdDev, min, max] = calcStats(stats.slice(Math.max(0, stats.length - 30)))
    return `${minutesToTime(min)}-${minutesToTime(max)} ${stats.length}*${minutesToTime(mean)}~${Math.round(stdDev)}`
}

function calcStats(values: number[]) {
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const x of values) {
        sum += x
        min = Math.min(min, x)
        max = Math.max(max, x)
    }
    const mean = values.length ? sum / values.length : 0
    let varSum = 0
    for (const x of values) varSum += (x - mean) ** 2
    const stdDev = values.length ? Math.sqrt(varSum / values.length) : 0
    return [mean, stdDev, min, max]
}

function minutesToTime(minutes: number) {
    if (!isFinite(minutes)) return '00:00'
    minutes = Math.round(minutes)
    return `${(100 + Math.floor(minutes / 60)).toString().slice(1)}:${(100 + minutes % 60).toString().slice(1)}`
}