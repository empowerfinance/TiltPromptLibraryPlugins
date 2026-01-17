package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.intellij.icons.AllIcons
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.*
import javax.swing.*

/**
 * A UI component that displays a single prompt card with expand/collapse, copy, edit, and delete actions.
 * 
 * This component is designed to be testable by accepting callbacks for all actions rather than
 * directly depending on repository or other services.
 */
class PromptCard(
    private val prompt: Prompt,
    private val isExpanded: Boolean,
    private val maxCardHeight: Int = 180,
    private val collapsedRowHeight: Int = 24,
    private val onToggleExpand: (String) -> Unit,
    private val onCopy: (String) -> Unit,
    private val onEdit: (Prompt) -> Unit,
    private val onDelete: (Prompt) -> Unit,
    private val onMove: (Prompt, Group) -> Unit,
    private val availableGroups: List<Group>
) {
    
    fun create(): JComponent {
        val expandButton = createIconButton(
            if (isExpanded) AllIcons.General.ArrowDown else AllIcons.General.ArrowRight,
            if (isExpanded) "Collapse" else "Expand"
        ) {
            onToggleExpand(prompt.id)
        }
        
        val card = JPanel(BorderLayout()).apply {
            // Modern card styling with rounded corners and subtle shadow effect
            border = BorderFactory.createCompoundBorder(
                JBUI.Borders.empty(4, 0, 4, 0), // Outer spacing
                BorderFactory.createCompoundBorder(
                    BorderFactory.createLineBorder(JBColor.border(), 1, true), // Rounded border
                    JBUI.Borders.empty(0) // Inner padding handled by components
                )
            )
            background = UIManager.getColor("Panel.background")
            maximumSize = Dimension(Int.MAX_VALUE, if (isExpanded) maxCardHeight + 80 else collapsedRowHeight)
            preferredSize = Dimension(Int.MAX_VALUE, if (isExpanded) maxCardHeight + 80 else collapsedRowHeight)

            // Add subtle hover effect
            val originalBg = background
            addMouseListener(object : java.awt.event.MouseAdapter() {
                override fun mouseEntered(e: java.awt.event.MouseEvent?) {
                    background = JBColor(
                        java.awt.Color(originalBg.red, originalBg.green, originalBg.blue, 250),
                        java.awt.Color(
                            Math.min(255, originalBg.red + 5),
                            Math.min(255, originalBg.green + 5),
                            Math.min(255, originalBg.blue + 5)
                        )
                    )
                    border = BorderFactory.createCompoundBorder(
                        JBUI.Borders.empty(4, 0, 4, 0),
                        BorderFactory.createCompoundBorder(
                            BorderFactory.createLineBorder(JBColor.namedColor("Component.focusColor", JBColor.BLUE), 1, true),
                            JBUI.Borders.empty(0)
                        )
                    )
                }
                override fun mouseExited(e: java.awt.event.MouseEvent?) {
                    background = originalBg
                    border = BorderFactory.createCompoundBorder(
                        JBUI.Borders.empty(4, 0, 4, 0),
                        BorderFactory.createCompoundBorder(
                            BorderFactory.createLineBorder(JBColor.border(), 1, true),
                            JBUI.Borders.empty(0)
                        )
                    )
                }
            })
        }

        // Title label (first 50 chars of text when title is blank)
        val titleLabel = JLabel(prompt.displayTitle()).apply {
            border = if (isExpanded) JBUI.Borders.empty(8, 8, 0, 8) else JBUI.Borders.empty(2, 8, 2, 8)
            font = font.deriveFont(font.style or Font.BOLD)
            maximumSize = Dimension(Int.MAX_VALUE, collapsedRowHeight)
            addMouseListener(MouseClickAdapter { onCopy(prompt.text) })
            toolTipText = "Click to copy"
        }
        
        // Header with expand button (left) and actions (right)
        val header = JPanel(BorderLayout()).apply {
            add(expandButton, BorderLayout.WEST)
            add(titleLabel, BorderLayout.CENTER)
            val headerActions = JPanel(FlowLayout(FlowLayout.RIGHT, 0, 0)).apply {
                val copyBtn = createIconButton(AllIcons.Actions.Copy, "Copy") { onCopy(prompt.text) }
                val editBtn = createIconButton(AllIcons.Actions.Edit, "Edit") { onEdit(prompt) }
                val delBtn = createIconButton(AllIcons.General.Remove, "Delete") {
                    val res = JOptionPane.showConfirmDialog(
                        card, 
                        "Delete this prompt?", 
                        "Confirm Delete", 
                        JOptionPane.YES_NO_OPTION
                    )
                    if (res == JOptionPane.YES_OPTION) {
                        onDelete(prompt)
                    }
                }
                add(copyBtn)
                add(editBtn)
                add(delBtn)
            }
            add(headerActions, BorderLayout.EAST)
        }
        card.add(header, BorderLayout.NORTH)
        
        // Attach popup to title
        attachPopup(titleLabel, createCardPopupMenu())

        // Text area that copies on click
        val textArea = JTextArea(prompt.text).apply {
            lineWrap = true
            wrapStyleWord = true
            isEditable = false
            border = JBUI.Borders.empty(8)
            background = UIManager.getColor("Panel.background")
            addMouseListener(MouseClickAdapter { onCopy(prompt.text) })
            // Attach right-click menu to text area
            attachPopup(this, createCardPopupMenu())
        }
        
        if (isExpanded) {
            val centerScroll = JScrollPane(textArea).apply {
                preferredSize = Dimension(10, maxCardHeight)
                maximumSize = Dimension(Int.MAX_VALUE, maxCardHeight)
                verticalScrollBarPolicy = ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED
                horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
                border = JBUI.Borders.empty()
            }
            card.add(centerScroll, BorderLayout.CENTER)
        }

        return card
    }
    
    private fun createIconButton(icon: Icon, tooltip: String, onClick: () -> Unit): JButton {
        return JButton(icon).apply {
            toolTipText = tooltip
            isBorderPainted = false
            isContentAreaFilled = false
            isFocusPainted = false
            preferredSize = Dimension(24, 24)
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)

            // Add hover effect for better visual feedback
            addMouseListener(object : java.awt.event.MouseAdapter() {
                override fun mouseEntered(e: java.awt.event.MouseEvent?) {
                    isContentAreaFilled = true
                    background = JBColor.namedColor("Button.hoverBackground",
                        JBColor(java.awt.Color(0, 0, 0, 10), java.awt.Color(255, 255, 255, 10)))
                }
                override fun mouseExited(e: java.awt.event.MouseEvent?) {
                    isContentAreaFilled = false
                }
                override fun mousePressed(e: java.awt.event.MouseEvent?) {
                    background = JBColor.namedColor("Button.pressedBackground",
                        JBColor(java.awt.Color(0, 0, 0, 20), java.awt.Color(255, 255, 255, 20)))
                }
            })

            addActionListener { onClick() }
        }
    }
    
    private fun buildMoveMenu(): JMenu {
        val menu = JMenu("Move To…")
        fun addGroupItems(groups: List<Group>, prefix: String = "") {
            groups.forEach { g ->
                val label = if (prefix.isEmpty()) g.name else "$prefix/${g.name}"
                menu.add(JMenuItem(label).apply {
                    addActionListener {
                        onMove(prompt, g)
                    }
                })
                if (g.children.isNotEmpty()) addGroupItems(g.children, label)
            }
        }
        addGroupItems(availableGroups)
        return menu
    }
    
    private fun createCardPopupMenu(): JPopupMenu {
        return JPopupMenu().apply {
            add(JMenuItem("Copy").apply { addActionListener { onCopy(prompt.text) } })
            add(JMenuItem("Open in Editor").apply { addActionListener { onEdit(prompt) } })
            addSeparator()
            add(buildMoveMenu())
            add(JMenuItem("Delete").apply {
                addActionListener {
                    val res = JOptionPane.showConfirmDialog(
                        null,
                        "Delete this prompt?",
                        "Confirm Delete",
                        JOptionPane.YES_NO_OPTION
                    )
                    if (res == JOptionPane.YES_OPTION) {
                        onDelete(prompt)
                    }
                }
            })
        }
    }

    private fun attachPopup(component: JComponent, popup: JPopupMenu) {
        component.addMouseListener(object : java.awt.event.MouseAdapter() {
            override fun mousePressed(e: java.awt.event.MouseEvent) {
                if (e.isPopupTrigger) popup.show(e.component, e.x, e.y)
            }
            override fun mouseReleased(e: java.awt.event.MouseEvent) {
                if (e.isPopupTrigger) popup.show(e.component, e.x, e.y)
            }
        })
    }
}

/**
 * Helper class for simple mouse click handling
 */
private class MouseClickAdapter(val onClick: () -> Unit) : java.awt.event.MouseAdapter() {
    override fun mouseClicked(e: java.awt.event.MouseEvent?) = onClick()
}

