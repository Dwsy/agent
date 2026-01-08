# TodoList - macOS Native Application

A simple, elegant todo list application built with C++ and Apple's native macOS Cocoa/AppKit frameworks.

## Features

- **Password Protection**: Secure access with password authentication (default: `123456`)
- **Native macOS UI**: Built with Cocoa/AppKit for authentic macOS experience
- **Task Management**: Add, complete, and delete todo items
- **Data Persistence**: Automatic save/load to `~/.todolist_data.json`
- **Status Tracking**: Real-time display of total and completed items
- **Keyboard Support**: Press Enter to quickly add new todos

## Building

### Prerequisites

- macOS operating system
- Xcode Command Line Tools (includes clang)
- Make utility

### Build Instructions

1. Open Terminal and navigate to the project directory:
   ```bash
   cd ./test/todolist
   ```

2. Build the application:
   ```bash
   make
   ```

3. Run the application:
   ```bash
   make run
   ```

### Build Targets

- `make` - Build the application
- `make clean` - Remove compiled binary
- `make run` - Build and run the application
- `make install` - Install to `/usr/local/bin/` (requires sudo)

## Usage

### Starting the Application

1. Launch the application by running:
   ```bash
   ./todolist
   ```

2. Enter the password when prompted:
   - **Password**: `123456`

3. After successful authentication, the main todo list window will appear.

### Adding Todos

1. Type your todo item in the text field at the top
2. Click the "Add" button or press Enter
3. The todo will appear in the list below

### Managing Todos

- **Mark as Complete**: Click the checkbox next to any todo item
- **Delete**: Click the ✕ button to remove a todo
- **View Status**: The status bar at the bottom shows total items and completed count

### Data Persistence

All todos are automatically saved to `~/.todolist_data.json`. Changes are saved immediately when you:
- Add a new todo
- Mark a todo as complete/incomplete
- Delete a todo

The data will be loaded automatically when you restart the application.

## Security

- The application requires a password to access
- After 3 failed password attempts, the application will exit
- Default password: `123456`

## File Structure

```
./test/todolist/
├── main.mm              # Application entry point
├── AppDelegate.h        # Application delegate header
├── AppDelegate.mm       # Application delegate implementation
├── MainWindow.h         # Main window controller header
├── MainWindow.mm        # Main window controller implementation
├── TodoListManager.h    # Data manager header
├── TodoListManager.mm   # Data manager implementation
├── Makefile             # Build configuration
└── README.md            # This file
```

## Technical Details

### Technologies Used

- **Language**: C++ (Objective-C++ for Cocoa integration)
- **UI Framework**: Apple Cocoa/AppKit
- **Build System**: Make with clang compiler
- **Data Format**: JSON

### Key Components

- **NSApplication**: Application lifecycle management
- **NSWindow**: Native macOS windows
- **NSTableView**: Todo list display
- **NSAlert**: Password dialog and error messages
- **JSON Serialization**: Data persistence

### Memory Management

The application uses ARC (Automatic Reference Counting) for automatic memory management, ensuring efficient and safe memory handling.

## Troubleshooting

### Build Errors

If you encounter build errors, ensure you have Xcode Command Line Tools installed:
```bash
xcode-select --install
```

### Data File Issues

If you need to reset your data, delete the data file:
```bash
rm ~/.todolist_data.json
```

The application will create a new empty data file on the next launch.

## License

This is a demonstration project for learning macOS native development with C++.

## Author

Created as a showcase of macOS native application development using C++ and Cocoa frameworks.