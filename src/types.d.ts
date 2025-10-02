type VersionId = string

interface MainManifest {
    latest: {[branch: string]: string}
    versions: ShortVersion[]
}

interface ShortVersion {
    id: VersionId
    type: string
    url: string
    sha1: string
    time: string
    releaseTime: string
    details?: string
    detailsHash?: string
}

type ProtocolType = 'classic' | 'alpha' | 'modern' | 'netty' | 'netty-snapshot'

interface ProtocolVersion {
    type: ProtocolType
    version: number
    incompatible?: boolean
}

interface ProtocolVersionInfo {
    version: number
    clients: VersionId[]
    servers: VersionId[]
}

interface ProtocolData {
    type: ProtocolType
    versions: ProtocolVersionInfo[]
}

type WorldFormat = 'alpha' | 'region' | 'anvil'

interface WorldVersion {
    format: WorldFormat
    version?: number
}

interface BaseVersionManifest {
    id: VersionId
    type: string
    time: string
    releaseTime: string
    releaseTarget?: VersionId
}

interface DownloadInfo {
    sha1: string
    url: string
    size?: number
}

interface Library {
    name: string
    rules?: Rule[]
    downloads?: Record<string, DownloadInfo>
}

interface RuleValue {
    [key: string]: RuleValue|string|boolean
}

type Rule = {
    action: 'allow' | 'disallow'
} & RuleValue

interface RuleContext {
    [key: string]: RuleContext|string|boolean
}

type VersionManifest = BaseVersionManifest & {
    arguments?: {game?: any[], jvm?: []}
    assets?: string
    assetIndex?: {id: string, sha1: string, size: number, totalSize: number, url: string}
    downloads?: {[id: string]: DownloadInfo}
    javaVersion?: {
        component: string
        majorVersion: number
    }
    libraries: Library[]
    logging?: Record<string, any>
    mainClass?: string
    minimumLauncherVersion?: number
}

type ShortManifest = Omit<BaseVersionManifest, 'id' | 'releaseTime'> & {
    downloadsId?: number
    assetIndex: string
    assetHash: string
    hash: string
    url: string
}

type TempVersionManifest = {
    id: VersionId
    type: string
    hash: string
    url: string
    time: string
    releaseTime: string
    lastModified?: string
    downloadsHash: string
    downloads: {[id: string]: DownloadInfo}
    downloadsId?: number
    assetIndex?: string
    assetHash?: string
    launcher: boolean
    localMirror: {[id: string]: string}
    libraries: Library[]
    original: VersionManifest
}

type VersionData = BaseVersionManifest & {
    omniId: VersionId
    displayVersion?: string|null,
    client: boolean
    server: boolean
    downloads: {[id: string]: DownloadInfo}
    launcher: boolean
    sharedMappings: boolean
    normalizedVersion?: VersionId
    manifests: ShortManifest[]
    libraries: string[]
    protocol?: ProtocolVersion
    world?: WorldVersion
    previous: VersionId[]
    next: VersionId[]
}

type HashMap<T> = Record<string, T>

type Protocols = Partial<Record<ProtocolType, {[version: number]: ProtocolVersionInfo}>>

type VersionInfo = {
    info: {
        id: string
        type: string
        url: string
        sha1: string
        time: string
        releaseTime: string
        details: string
        detailsHash: string
    }
    data: VersionData
    file: string
    manifests: Array<TempVersionManifest>
}

type VersionType = 'release' | 'snapshot' | 'pre-release' | 'release-candidate' | 'beta' | 'alpha' | 'infdev' | 'indev' | 'classic' | 'pre-classic' | 'other'

type Database = {
    omniVersions: HashMap<VersionId>
    renameMap: Record<string, string>
    hashMap: HashMap<string>
    lastModified: HashMap<Date|null>
    sources: HashMap<string>
}

type UpdatedDatabase = Database & {
    manifest: MainManifest
    allVersions: TempVersionManifest[]
    protocols: Protocols
    byReleaseTarget: Record<string, Array<string>>
    normalizedVersions: Record<string, string>
    displayVersions: Record<string, string|null>
}