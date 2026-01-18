package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.yaml.GroupYaml
import com.example.promptlibrary.yaml.PromptYaml
import java.io.File

/** Writes Shared groups to the repo tree.
 * Structure per group:
 *   <root>/<groupName>/
 *     _group.yaml   (meta only: prompts/children omitted)
 *     prompts/
 *       p-<id>.yaml (public prompts only)
 *     <child>/...
 */
object GitYamlWriter {
    private const val GITIGNORE_CONTENT = """# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.idea/
*.iml
.vscode/
"""

    // Returns triple of (added, updated, deleted) file counts across the Shared tree
    fun writeSharedGroups(rootDir: File, groups: List<Group>): Triple<Int, Int, Int> {
        val before = snapshotFiles(rootDir)
        // Clean rewrite to reflect current Shared state (removes stale groups like prior synthetic ones)
        if (rootDir.exists()) rootDir.deleteRecursively()
        rootDir.mkdirs()

        // Ensure .gitignore exists in the parent (repo root)
        ensureGitignore(rootDir.parentFile ?: rootDir)

        groups.forEach { writeGroupDir(rootDir, it) }
        val after = snapshotFiles(rootDir)

        val added = after.keys.count { it !in before.keys }
        val deleted = before.keys.count { it !in after.keys }
        val updated = after.keys.intersect(before.keys).count { k -> before[k] != after[k] }
        return Triple(added, updated, deleted)
    }

    private fun snapshotFiles(root: File): Map<String, String> {
        if (!root.exists() || !root.isDirectory) return emptyMap()
        val map = mutableMapOf<String, String>()
        root.walkTopDown().filter { it.isFile }.forEach { f ->
            val rel = root.toPath().relativize(f.toPath()).toString().replace('\\', '/')
            map[rel] = sha256(f)
        }
        return map
    }

    private fun sha256(file: File): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        file.inputStream().use { ins ->
            val buf = ByteArray(8192)
            while (true) {
                val r = ins.read(buf)
                if (r <= 0) break
                md.update(buf, 0, r)
            }
        }
        return md.digest().joinToString("") { b -> "%02x".format(b) }
    }

    private fun writeGroupDir(parent: File, g: Group) {
        val dir = File(parent, sanitize(g.name))
        dir.mkdirs()
        // Write meta without prompts/children to keep files clean
        val meta = File(dir, "_group.yaml")
        GroupYaml.writeGroup(g.copy(children = emptyList(), prompts = emptyList()), meta)

        // Prompts directory
        val promptsDir = File(dir, "prompts").apply { mkdirs() }
        // Write all prompts under Shared groups, regardless of isPrivate flag in storage
        g.prompts.forEach { p ->
            val file = File(promptsDir, "p-${p.id}.yaml")
            PromptYaml.writePrompt(stripPrivateFields(p), file)
        }
        // Children
        g.children.forEach { child -> writeGroupDir(dir, child) }
    }

    private fun stripPrivateFields(p: Prompt): Prompt {
        // Ensure we never write private prompts
        return if (!p.isPrivate) p else p.copy(isPrivate = false)
    }

    private fun sanitize(name: String): String = name.replace(Regex("[^A-Za-z0-9._-]"), "-")

    private fun ensureGitignore(repoRoot: File) {
        val gitignore = File(repoRoot, ".gitignore")
        if (!gitignore.exists()) {
            gitignore.writeText(GITIGNORE_CONTENT)
        }
    }
}

