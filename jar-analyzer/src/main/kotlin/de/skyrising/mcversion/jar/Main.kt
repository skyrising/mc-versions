package de.skyrising.mcversion.jar

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import org.objectweb.asm.ClassReader
import org.objectweb.asm.Opcodes
import org.objectweb.asm.tree.*
import java.net.URI
import java.nio.file.*
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.io.path.name
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    if (args.isEmpty()) {
        System.err.println("Expected at least one file argument")
        exitProcess(1)
    }
    for (arg in args) {
        var version: String? = null
        val path = if (arg.contains(":")) {
            val colon = arg.indexOf(':')
            version = arg.substring(0, colon)
            Path.of(arg.substring(colon + 1))
        } else {
            Path.of(arg)
        }
        if (!Files.exists(path)) {
            System.err.println("$arg does not exist")
            exitProcess(2)
        }
        val json = Json.encodeToString(getJarFileSystem(path).use {
            analyze(version, it)
        })
        if (version != null) {
            println("$version:$json")
        } else {
            println(json)
        }
    }
}

fun getJarFileSystem(jar: Path): FileSystem {
    val uri = jar.toUri()
    val fsUri = URI("jar:${uri.scheme}", uri.userInfo, uri.host, uri.port, uri.path, uri.query, uri.fragment)
    return FileSystems.newFileSystem(fsUri, mapOf<String, Any>())
}

const val SNAPSHOT_PROTOCOL = 0x40000000

data class VersionInfo(
    var protocolType: String? = null,
    var protocolVersion: Int? = null,
    var worldFormat: String? = null,
    var worldVersion: Int? = null,
    var metaInfDate: ZonedDateTime? = null
) {
    fun toJson() = buildJsonObject {
        if (metaInfDate != null) {
            put("time", metaInfDate!!.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
        }
        if (worldVersion != null) {
            putJsonObject("world") {
                put("format", worldFormat ?: "anvil")
                put("version", worldVersion)
            }
        } else if (worldFormat != null) {
            putJsonObject("world") {
                put("format", worldFormat)
            }
        }
        if (protocolVersion != null) {
            if (protocolType == null) {
                protocolType = if (protocolVersion!! and SNAPSHOT_PROTOCOL != 0) "netty-snapshot" else "netty"
                protocolVersion = protocolVersion!! and SNAPSHOT_PROTOCOL.inv()
            }
            putJsonObject("protocol") {
                put("type", protocolType)
                put("version", protocolVersion)
            }
        }
    }

    fun isComplete() = protocolVersion != null && worldVersion != null && metaInfDate != null
}

private val PARSERS = mutableMapOf<String, (ClassNode, VersionInfo) -> Unit>().apply {
    put("version:") { node, info ->
        outer@ for (m in node.methods) {
            for (insn in m.instructions) {
                if (insn is LdcInsnNode) {
                    val value = insn.cst
                    if (value is String && value.startsWith("version:") && value.length > 8) {
                        info.worldVersion = value.substring(8).toInt()
                        break@outer
                    }
                }
            }
        }
    }
    put("Outdated server!") { node, info ->
        outer@ for (m in node.methods) {
            for (insn in m.instructions) {
                if (insn is LdcInsnNode && insn.cst == "Outdated server!") {
                    var i: AbstractInsnNode? = insn
                    while (i != null && getIntConstant(i) == null) {
                        i = i.previous
                    }
                    if (i != null) {
                        info.protocolVersion = getIntConstant(i)
                        info.protocolType = "modern"
                        break@outer
                    }
                }
            }
        }
    }
    put("DataVersion") { node, info ->
        outer@for (m in node.methods) {
            for (insn in m.instructions) {
                if (insn is LdcInsnNode && insn.cst == "DataVersion") {
                    val v = getIntConstant(insn.next)
                    if (v != null && v > 99) {
                        info.worldVersion = v
                        break@outer
                    }
                }
            }
        }
    }
    put(".mca") { _, info ->
        info.worldFormat = "anvil"
    }
    put(".mcr") { _, info ->
        if (info.worldFormat != "anvil") info.worldFormat = "region"
    }
    put("c.") { node, info ->
        if (info.worldFormat != null) return@put
        outer@for (m in node.methods) {
            if (m.desc != "(II)Ljava/io/File;") continue
            for (insn in m.instructions) {
                if (insn is LdcInsnNode && insn.cst == "c.") {
                    info.worldFormat = "alpha"
                }
            }
        }
    }
}

fun analyze(version: String?, fs: FileSystem): JsonObject {
    val info = VersionInfo()
    val metaInfPath = fs.getPath("META-INF", "MANIFEST.MF")
    if (Files.exists(metaInfPath)) {
        info.metaInfDate = Files.getLastModifiedTime(metaInfPath).toInstant().atZone(ZoneId.of("UTC"))
    }
    val versionJsonPath = fs.getPath("version.json")
    if (Files.exists(versionJsonPath)) {
        val versionJson = Json.decodeFromString<JsonObject>(Files.readString(versionJsonPath))
        info.protocolVersion = versionJson["protocol_version"]?.jsonPrimitive?.int
        info.worldVersion = versionJson["world_version"]?.jsonPrimitive?.int
    }
    val minecraftServerPath = fs.getPath("net", "minecraft", "server", "MinecraftServer.class")
    if (Files.exists(minecraftServerPath)) {
        val reader = ClassReader(Files.newInputStream(minecraftServerPath))
        val node = ClassNode()
        reader.accept(node, Opcodes.ASM9)
        for (m in node.methods) {
            if (m.name != "run" || m.desc != "()V") continue
            for (insn in m.instructions) {
                if (insn is LdcInsnNode && insn.cst is String) {
                    val id = insn.cst as String
                    if (version == null || id == version) {
                        info.protocolVersion = getIntConstant(insn.next)
                    }
                }
            }
        }
    }
    for (f in Files.list(fs.getPath("."))) {
        if (!f.name.endsWith(".class")) continue
        val bytes = Files.readAllBytes(f)
        val s = String(bytes)
        for ((k, v) in PARSERS) {
            if (s.contains(k)) {
                val reader = ClassReader(bytes)
                val node = ClassNode()
                reader.accept(node, Opcodes.ASM9)
                v(node, info)
            }
        }
        if (info.isComplete()) break
    }
    return info.toJson()
}

fun getIntConstant(insn: AbstractInsnNode): Int? = when (insn) {
    is IntInsnNode -> insn.operand
    is InsnNode -> {
        if (insn.opcode >= Opcodes.ICONST_0 && insn.opcode <= Opcodes.ICONST_5) {
            insn.opcode - Opcodes.ICONST_0
        } else {
            null
        }
    }
    else -> null
}
