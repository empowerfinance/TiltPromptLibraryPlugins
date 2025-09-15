package com.example.promptlibrary.sync

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import git4idea.commands.Git
import git4idea.commands.GitCommand
import git4idea.commands.GitLineHandler
import java.io.File

object GitUtils {
    fun isUnborn(project: Project, repoRoot: File): Boolean {
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return true
        val git = Git.getInstance()
        // rev-parse --verify HEAD returns non-zero on unborn
        val handler = GitLineHandler(project, vf, GitCommand.REV_PARSE).apply {
            addParameters("--verify", "HEAD")
            endOptions()
        }
        val result = git.runCommand(handler)
        return !result.success()
    }

    fun currentBranch(project: Project, repoRoot: File): String? {
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return null
        val git = Git.getInstance()
        val handler = GitLineHandler(project, vf, GitCommand.BRANCH).apply {
            addParameters("--show-current")
            endOptions()
        }
        val result = git.runCommand(handler)
        return if (result.success()) result.outputAsJoinedString.trim().ifEmpty { null } else null
    }
}

