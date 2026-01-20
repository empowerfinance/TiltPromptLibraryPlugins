# Composer Panel Redesign

## Overview
Updated the "View, Add and Edit" composer panel to match the Rider plugin's clean, unified design with tight margins, simple borders, and no elevation effects.

## Changes Made

### Visual Design
- **Removed box-shadow**: Eliminated the elevated card effect for a flat, simple design
- **Reduced border-radius**: Changed from 10px to 4px for sharper, cleaner corners
- **Tighter padding**: Reduced card padding from 12px to 8px
- **Tighter margins**: Reduced container padding from 16px to 4px, gap from 16px to 4px
- **Smaller fonts**: Labels now use 10px font size for a more compact look

### Unified Card Structure
**Before:**
- Separate sections with individual spacing
- Larger gaps between elements

**After:**
- Single unified card with header section
- "View, Add and Edit" title at the top (14px bold)
- Selected group info below title (10px, muted)
- Consistent 4-8px spacing throughout

### Form Elements
- **Input/Textarea padding**: Reduced from 10-12px to 6-8px
- **Font size**: Reduced to 12px for consistency
- **Border radius**: Changed from 8px to 4px
- **Textarea min-height**: Reduced from 120px to 70px
- **Focus style**: Simple outline instead of box-shadow

### Buttons
- **Padding**: Reduced from 6px 10px to 4px 8px
- **Border radius**: Changed from 8px to 4px
- **Font size**: 12px
- **Removed transform effects**: No more translateY on active
- **Simpler hover**: Just background color change
- **Button gap**: Reduced from 8px to 4px

### Typography
- **Title**: 14px bold, no letter-spacing
- **Labels**: 10px, muted color
- **Inputs**: 12px
- **Placeholders**: Muted with 0.6 opacity

## Design Principles
1. **Tight spacing**: Minimal padding and margins throughout
2. **Flat design**: No shadows or elevation effects
3. **Simple borders**: 1px solid borders with subtle contrast
4. **Consistent sizing**: 4px border-radius, 4-8px padding/margins
5. **Clean typography**: Smaller, tighter text with clear hierarchy

## Result
A clean, compact composer panel that matches the Rider plugin's aesthetic while maintaining full functionality.

