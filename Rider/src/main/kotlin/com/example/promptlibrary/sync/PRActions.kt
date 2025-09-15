package com.example.promptlibrary.sync

import com.intellij.ide.BrowserUtil

object PRActions {
    fun openCompare(owner: String, repo: String, base: String, head: String) {
        val url = "https://github.com/${owner}/${repo}/compare/${base}...${head}"
        BrowserUtil.browse(url)
    }
}

