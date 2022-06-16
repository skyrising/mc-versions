type VersionId = string

interface MainManifest {
    latest: {[branch: string]: string}
    versions: ShortVersion[]
}

interface ShortVersion {
    omniId?: VersionId
    id: VersionId
    type: string
    url: string
    time: string
    releaseTime: string
    details?: string
}

type ProtocolType = 'classic' | 'alpha' | 'netty' | 'netty-snapshot'

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

type WorldFormat = 'anvil'

interface WorldVersion {
    format: WorldFormat
    version: number
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
}

interface Library {
    name: string
    rules?: Rule[]
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
    assets?: string
    assetIndex?: {id: string, sha1: string, size: number, totalSize: number, url: string}
    downloads?: {[id: string]: DownloadInfo}
    libraries: Library[]
}

type ShortManifest = Omit<BaseVersionManifest, 'id' | 'releaseTime'> & {
    downloadsId?: number
    assetIndex: string
    assetHash: string
    hash: string
    url: string
}

type TempVersionManifest = {
    omniId: VersionId
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
}

type VersionData = BaseVersionManifest & {
    omniId: VersionId
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
        omniId: string;
        id: string;
        type: string;
        url: string;
        time: string;
        releaseTime: string;
        details: string;
    };
    data: VersionData;
    file: string;
}

type VersionType = 'release' | 'snapshot' | 'pre-release' | 'release-candidate' | 'beta' | 'alpha' | 'infdev' | 'indev' | 'classic' | 'pre-classic' | 'other'