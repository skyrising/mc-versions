type VersionId = string

interface MainManifest {
    latest: {[branch: string]: string}
    versions: Array<ShortVersion>
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
    clients: Array<VersionId>
    servers: Array<VersionId>
}

interface ProtocolData {
    type: ProtocolType
    versions: Array<ProtocolVersionInfo>
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

type VersionManifest = BaseVersionManifest & {
    assets?: string
    assetIndex?: {id: string, sha1: string, size: number, totalSize: number, url: string}
    downloads?: {[id: string]: DownloadInfo}
}

type ShortManifest = Omit<BaseVersionManifest, 'id' | 'releaseTime'> & {
    downloadsId?: number
    assetIndex: string
    assetHash: string
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
}

type VersionData = BaseVersionManifest & {
    omniId: VersionId
    client: boolean
    server: boolean
    downloads: Record<string, DownloadInfo>
    launcher: boolean
    sharedMappings: boolean
    normalizedVersion?: VersionId
    manifests: Array<ShortManifest>
    protocol?: ProtocolVersion
    world?: WorldVersion
    previous: Array<VersionId>
    next: Array<VersionId>
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