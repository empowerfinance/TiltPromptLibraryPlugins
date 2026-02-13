package com.example.promptlibrary.sync

import com.intellij.ide.BrowserUtil
import java.net.URLEncoder

object PRActions {
    fun openCompare(owner: String, repo: String, base: String, head: String, title: String? = null) {
        var url = "https://github.com/${owner}/${repo}/compare/${base}...${head}?expand=1"
        if (!title.isNullOrBlank()) {
            url += "&title=${URLEncoder.encode(title, "UTF-8")}"
        }
        BrowserUtil.browse(url)
    }
}

