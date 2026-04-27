# Changelog

## 1.0.1 - 2025-04-25

### Fixed
- **Flex.ts**: Fixed row layout calculations to ensure exact width matching
  - Added minimum width constraint (1 char) for flex children
  - Improved line padding logic to handle edge cases
- **Stack.ts**: Fixed transparent layer merging with ANSI codes
  - Rewrote `mergeLinesTransparent` to properly parse and preserve ANSI escape sequences
  - Now correctly handles colored background layers with transparent overlays
- **useSelect.ts**: Fixed scroll offset auto-adjustment
  - Scroll position now automatically updates when selection moves outside visible window
  - Ensures selected item is always visible within `maxVisible` bounds
- **Input.ts**: Fixed cursor position handling in password mode
  - Cursor now correctly positioned after masked characters
  - Proper handling of available width calculation with prefix

### Improved
- **package.json**: Added test scripts and enhanced metadata
  - Added `test`, `test:run`, and `typecheck` scripts
  - Enhanced keywords for discoverability
  - Added devDependencies for testing
- **index.ts**: Reorganized exports for cleaner structure
  - Separated type-only exports from value exports
  - Added explicit export paths for utilities
  - Re-exported useful types from `@mariozechner/pi-tui`

### Added
- **test/component.test.ts**: Comprehensive test suite covering:
  - All utility components (Text, Spacer)
  - Layout components (Box, Flex, Stack)
  - Widgets (Panel, Button, List, Input, Dialog, Tabs, ProgressBar, StepProgress, Toast, Tree, Table)
  - Hooks (useState, useSelect, useFocus, useInput)
  - Integration tests
  - Edge cases and performance tests

## 1.0.0 - 2025-04-25

### Initial Release
- Core components: Box, Text, Flex, Spacer, Stack
- Widgets: Panel, Button, List, Input, Dialog, Tabs, ProgressBar, StepProgress, Modal, Toast, Tree, Table
- Utilities: Borders, Themes, Text alignment helpers
- Hooks: useState, useSelect, useFocus, useInput
- Examples: SettingsPanelComponent
