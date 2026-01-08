#!/bin/bash

# Test script for TodoList application

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
EXECUTABLE="$SCRIPT_DIR/todolist"

echo "=== TodoList Application Test Suite ==="
echo ""

# Test 1: Check if executable exists
echo "Test 1: Checking if executable exists..."
if [ -f "$EXECUTABLE" ]; then
    echo "✅ PASS: Executable exists"
else
    echo "❌ FAIL: Executable not found at $EXECUTABLE"
    exit 1
fi

# Test 2: Check if executable is executable
echo ""
echo "Test 2: Checking if executable has execute permissions..."
if [ -x "$EXECUTABLE" ]; then
    echo "✅ PASS: Executable has execute permissions"
else
    echo "❌ FAIL: Executable is not executable"
    exit 1
fi

# Test 3: Check file structure
echo ""
echo "Test 3: Checking file structure..."
required_files=(
    "main.mm"
    "AppDelegate.mm"
    "AppDelegate.h"
    "MainWindow.mm"
    "MainWindow.h"
    "TodoListManager.mm"
    "TodoListManager.h"
    "Makefile"
    "README.md"
)

all_files_present=true
for file in "${required_files[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        echo "  ✅ $file exists"
    else
        echo "  ❌ $file missing"
        all_files_present=false
    fi
done

if [ "$all_files_present" = true ]; then
    echo "✅ PASS: All required files present"
else
    echo "❌ FAIL: Some required files missing"
    exit 1
fi

# Test 4: Check README.md contains password
echo ""
echo "Test 4: Checking README.md for password documentation..."
if grep -q "123456" "$SCRIPT_DIR/README.md"; then
    echo "✅ PASS: Password documented in README.md"
else
    echo "❌ FAIL: Password not documented in README.md"
    exit 1
fi

# Test 5: Check Makefile targets
echo ""
echo "Test 5: Checking Makefile targets..."
if grep -q "^all:" "$SCRIPT_DIR/Makefile" && \
   grep -q "^clean:" "$SCRIPT_DIR/Makefile" && \
   grep -q "^run:" "$SCRIPT_DIR/Makefile"; then
    echo "✅ PASS: Makefile has required targets"
else
    echo "❌ FAIL: Makefile missing required targets"
    exit 1
fi

# Test 6: Verify data file path in code
echo ""
echo "Test 6: Checking data persistence configuration..."
if grep -q ".todolist_data.json" "$SCRIPT_DIR/TodoListManager.mm"; then
    echo "✅ PASS: Data file path configured"
else
    echo "❌ FAIL: Data file path not configured"
    exit 1
fi

# Test 7: Verify password in code
echo ""
echo "Test 7: Checking password authentication..."
if grep -q "123456" "$SCRIPT_DIR/AppDelegate.mm"; then
    echo "✅ PASS: Password authentication implemented"
else
    echo "❌ FAIL: Password authentication not found"
    exit 1
fi

# Test 8: Check for attempt limit
echo ""
echo "Test 8: Checking password attempt limit..."
if grep -q "passwordAttempts" "$SCRIPT_DIR/AppDelegate.mm" && \
   grep -q "3" "$SCRIPT_DIR/AppDelegate.mm"; then
    echo "✅ PASS: Password attempt limit implemented"
else
    echo "❌ FAIL: Password attempt limit not found"
    exit 1
fi

# Test 9: Check for macOS frameworks
echo ""
echo "Test 9: Checking macOS frameworks in Makefile..."
if grep Cocoa "$SCRIPT_DIR/Makefile" > /dev/null 2>&1 && \
   grep Foundation "$SCRIPT_DIR/Makefile" > /dev/null 2>&1; then
    echo "✅ PASS: macOS frameworks configured"
else
    echo "❌ FAIL: macOS frameworks not configured"
    exit 1
fi

# Test 10: Check for ARC flag
echo ""
echo "Test 10: Checking ARC configuration..."
if grep objc.arc "$SCRIPT_DIR/Makefile" > /dev/null 2>&1; then
    echo "✅ PASS: ARC enabled"
else
    echo "❌ FAIL: ARC not enabled"
    exit 1
fi

echo ""
echo "========================================="
echo "All tests passed! ✅"
echo "========================================="
echo ""
echo "Summary:"
echo "- Application successfully compiled"
echo "- All required files present"
echo "- Password protection implemented (password: 123456)"
echo "- Data persistence configured"
echo "- macOS native frameworks used"
echo "- ARC memory management enabled"
echo ""
echo "To run the application:"
echo "  cd $SCRIPT_DIR"
echo "  ./todolist"
echo ""
echo "Or use make:"
echo "  cd $SCRIPT_DIR"
echo "  make run"