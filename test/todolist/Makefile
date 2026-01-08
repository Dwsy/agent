# Makefile for TodoList macOS Application

CC = clang++
CFLAGS = -std=c++11 -fobjc-arc -framework Cocoa -framework Foundation
TARGET = todolist
SOURCES = main.mm AppDelegate.mm MainWindow.mm TodoListManager.mm
HEADERS = AppDelegate.h MainWindow.h TodoListManager.h

all: $(TARGET)

$(TARGET): $(SOURCES) $(HEADERS)
	$(CC) $(CFLAGS) -o $(TARGET) $(SOURCES)

clean:
	rm -f $(TARGET)

install: $(TARGET)
	cp $(TARGET) /usr/local/bin/

run: $(TARGET)
	./$(TARGET)

.PHONY: all clean install run