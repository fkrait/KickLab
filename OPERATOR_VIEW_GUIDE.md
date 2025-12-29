# KickLab Operator View Guide

## Overview
The operator view has been redesigned for mobile landscape use during Taekwondo matches. It provides a fast, scroll-free interface optimized for in-match scoring.

## Features

### Two-Column Layout
- **Blue Column (Left)**: Scoring controls for the blue corner fighter
- **Red Column (Right)**: Scoring controls for the red corner fighter

### Sticky Top Bar
Located at the top of the screen, always visible:
- **Fighter Names**: Tap to edit blue and red fighter names inline
- **Timer Display**: Large, easy-to-read countdown timer (MM:SS format)
- **Round Info**: Current round, total rounds, and round wins (🔵/🔴)
- **Control Buttons**:
  - ▶ Start timer
  - ⏸ Pause timer
  - ⏹ End current round
  - ☰ Open settings menu

### Scoring Buttons
Each column has 6 large, touch-optimized buttons:
- **👊 +1**: Punch to body (slag)
- **🦺 +2**: Kick to body (kropp)
- **🪖 +3**: Kick to head (huvud)
- **🌀 +4**: Spinning kick to body
- **⭐ +5**: Spinning kick to head
- **⚠️ GJ**: Gam-jeom (penalty - adds 1 point to opponent)

### Score Display
Above the buttons, each fighter shows:
- **Main Score**: Large number showing current round points
- **Hit Counters**: 
  - 👊 Punches
  - 🦺 Body kicks
  - 🪖 Head kicks
  - ⚠️ Gam-jeom penalties

### Bottom Action Bar
- **↶ Ångra**: Undo last action
- **Status Text**: Shows current match status
- **Rest Indicator**: Displays pause timer when active

### Settings Menu
Click the ☰ button to access:
- Match title
- Round duration (seconds)
- Rest duration (seconds)
- Maximum rounds (1-3)
- Quick actions: Next round, Reset match, Open audience view, Exit

## Touch Optimization
- All buttons are minimum 44x44px for easy touch targets
- Large font sizes for visibility
- High contrast colors for quick recognition
- No vertical scrolling required on landscape mobile (480-820px height)

## Usage Flow

### Starting a Match
1. Enter fighter names in the top bar
2. Click ☰ to adjust settings if needed
3. Click ▶ to start the timer
4. Award points by tapping scoring buttons

### During Match
- Tap scoring buttons as points are scored
- Use ↶ Ångra to undo mistakes
- Timer counts down automatically
- No modals interrupt scoring flow

### Ending a Round
1. Click ⏹ to end round
2. System determines round winner
3. Click "Nästa rond" in menu to start next round
4. Round wins are tracked in top bar

### Match Completion
- Best of 3 rounds
- Winner announced when 2 rounds won
- Use "Nollställ" to reset for new match

## Keyboard Shortcuts
While not primarily designed for keyboard use, basic controls work:
- Space: Start/Pause timer
- Esc: Open/Close menu

## Audience View
Click "Publikvy" in the menu to open a separate window showing:
- Large scores
- Fighter names and countries
- Match timer
- Round information
- Hit statistics

The audience view updates in real-time via BroadcastChannel API.

## Device Compatibility

### Optimal
- Mobile landscape: 896x414 (iPhone 11 landscape)
- Mobile landscape: 1136x640 (iPhone SE landscape)
- Tablet landscape: 1024x768

### Minimum
- 854x480 (small phone landscape)

### Maximum
- Desktop: Any size, layout scales appropriately

## Browser Support
- Chrome/Edge 54+
- Firefox 38+
- Safari 10.1+
- Opera 41+

Note: BroadcastChannel API (for audience view sync) requires:
- Chrome/Edge 54+
- Firefox 38+
- Safari 15.4+

## Tips for Operators

1. **Use landscape orientation** for best experience
2. **Keep screen brightness high** for outdoor matches
3. **Test buttons** before match starts
4. **Use undo liberally** - it's faster than manual correction
5. **Watch the timer** - it's always visible at top
6. **Quick scoring** - buttons are large and responsive
7. **No confirmation modals** - all actions are immediate

## Troubleshooting

### Timer not starting
- Ensure you clicked ▶ (not just opened the view)
- Check browser console for errors

### Buttons not responding
- Ensure touch is enabled
- Try refreshing the page
- Check for JavaScript errors

### Audience view not syncing
- Ensure both windows are from same origin
- Check browser supports BroadcastChannel API
- Try closing and reopening audience view

### Layout issues
- Rotate device to landscape
- Check viewport is at least 854x480
- Try zooming out if content appears cut off

## Development Notes

The operator view uses:
- CSS Grid for two-column layout
- Flexbox for button arrangement
- Position: fixed for full-screen layout
- CSS media queries for responsive sizing
- Vanilla JavaScript (no framework dependencies)

All code is in `index.html` (HTML/CSS) and `main.js` (JavaScript).
