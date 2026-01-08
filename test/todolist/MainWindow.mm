#import "MainWindow.h"

@implementation MainWindow

- (instancetype)init {
    self = [super init];
    if (self) {
        self.todoManager = [[TodoListManager alloc] init];
        [self setupWindow];
        [self setupUI];
    }
    return self;
}

- (void)setupWindow {
    NSRect frame = NSMakeRect(0, 0, 600, 400);
    NSUInteger styleMask = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                           NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:styleMask
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    [self.window setTitle:@"Todo List"];
    [self.window center];
    [self.window setReleasedWhenClosed:NO];
}

- (void)setupUI {
    NSView *contentView = [self.window contentView];

    // Input field and button at top
    self.inputField = [[NSTextField alloc] initWithFrame:NSMakeRect(10, 350, 440, 30)];
    [self.inputField setPlaceholderString:@"Enter new todo..."];
    [self.inputField setTarget:self];
    [self.inputField setAction:@selector(addTodo:)];
    [self.inputField setDelegate:self];
    [contentView addSubview:self.inputField];

    NSButton *addButton = [[NSButton alloc] initWithFrame:NSMakeRect(460, 350, 130, 30)];
    [addButton setTitle:@"Add"];
    [addButton setTarget:self];
    [addButton setAction:@selector(addTodo:)];
    [contentView addSubview:addButton];

    // Table view for todos
    NSScrollView *scrollView = [[NSScrollView alloc] initWithFrame:NSMakeRect(10, 40, 580, 300)];
    [scrollView setHasVerticalScroller:YES];
    [scrollView setHasHorizontalScroller:NO];
    [scrollView setAutohidesScrollers:YES];
    [scrollView setBorderType:NSBezelBorder];

    NSSize contentSize = [scrollView contentSize];
    self.tableView = [[NSTableView alloc] initWithFrame:NSMakeRect(0, 0, contentSize.width, contentSize.height)];
    [self.tableView setDataSource:self];
    [self.tableView setDelegate:self];

    // Create columns
    NSTableColumn *completeColumn = [[NSTableColumn alloc] initWithIdentifier:@"complete"];
    [[completeColumn headerCell] setStringValue:@"Done"];
    [completeColumn setWidth:50];
    [self.tableView addTableColumn:completeColumn];

    NSTableColumn *textColumn = [[NSTableColumn alloc] initWithIdentifier:@"text"];
    [[textColumn headerCell] setStringValue:@"Task"];
    [textColumn setWidth:480];
    [self.tableView addTableColumn:textColumn];

    NSTableColumn *deleteColumn = [[NSTableColumn alloc] initWithIdentifier:@"delete"];
    [[deleteColumn headerCell] setStringValue:@""];
    [deleteColumn setWidth:50];
    [self.tableView addTableColumn:deleteColumn];

    [scrollView setDocumentView:self.tableView];
    [contentView addSubview:scrollView];

    // Status bar at bottom
    self.statusField = [[NSTextField alloc] initWithFrame:NSMakeRect(10, 10, 580, 25)];
    [self.statusField setBezeled:YES];
    [self.statusField setEditable:NO];
    [self.statusField setSelectable:NO];
    [self.statusField setAlignment:NSTextAlignmentCenter];
    [self.statusField setBackgroundColor:[NSColor colorWithWhite:0.95 alpha:1.0]];
    [contentView addSubview:self.statusField];

    [self updateStatusBar];

    // Cleanup
    // No manual release needed with ARC
}

- (void)showWindow {
    [self.window makeKeyAndOrderFront:nil];
}

- (void)addTodo:(id)sender {
    NSString *text = [self.inputField stringValue];
    if (text && text.length > 0) {
        [self.todoManager addTodo:text];
        [self.inputField setStringValue:@""];
        [self.tableView reloadData];
        [self updateStatusBar];
    }
}

- (void)toggleComplete:(NSUInteger)index {
    [self.todoManager toggleCompleteAtIndex:index];
    [self.tableView reloadData];
    [self updateStatusBar];
}

- (void)deleteTodo:(NSUInteger)index {
    [self.todoManager removeTodoAtIndex:index];
    [self.tableView reloadData];
    [self updateStatusBar];
}

- (void)updateStatusBar {
    NSInteger total = [self.todoManager count];
    NSInteger completed = [self.todoManager completedCount];
    [self.statusField setStringValue:[NSString stringWithFormat:@"%ld items, %ld completed", (long)total, (long)completed]];
}

#pragma mark - NSTableViewDataSource

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView {
    return [self.todoManager count];
}

- (id)tableView:(NSTableView *)tableView objectValueForTableColumn:(NSTableColumn *)tableColumn row:(NSInteger)row {
    NSString *identifier = [tableColumn identifier];

    if ([identifier isEqualToString:@"complete"]) {
        return @([self.todoManager isCompletedAtIndex:row]);
    } else if ([identifier isEqualToString:@"text"]) {
        NSString *text = [self.todoManager textAtIndex:row];
        if ([self.todoManager isCompletedAtIndex:row]) {
            NSMutableAttributedString *attributedString = [[NSMutableAttributedString alloc] initWithString:text];
            [attributedString addAttribute:NSStrikethroughStyleAttributeName value:@1 range:NSMakeRange(0, text.length)];
            return attributedString;
        }
        return text;
    } else if ([identifier isEqualToString:@"delete"]) {
        return @"✕";
    }

    return nil;
}

- (void)tableView:(NSTableView *)tableView setObjectValue:(id)object forTableColumn:(NSTableColumn *)tableColumn row:(NSInteger)row {
    NSString *identifier = [tableColumn identifier];

    if ([identifier isEqualToString:@"complete"]) {
        [self toggleComplete:row];
    }
}

#pragma mark - NSTableViewDelegate

- (NSCell *)tableView:(NSTableView *)tableView dataCellForTableColumn:(NSTableColumn *)tableColumn row:(NSInteger)row {
    NSString *identifier = [tableColumn identifier];

    if ([identifier isEqualToString:@"complete"]) {
        NSButtonCell *cell = [[NSButtonCell alloc] init];
        [cell setButtonType:NSButtonTypeSwitch];
        [cell setTitle:@""];
        [cell setAllowsMixedState:NO];
        return cell;
    } else if ([identifier isEqualToString:@"delete"]) {
        NSButtonCell *cell = [[NSButtonCell alloc] init];
        [cell setButtonType:NSButtonTypeMomentaryPushIn];
        [cell setTitle:@"✕"];
        [cell setBezelStyle:NSBezelStyleSmallSquare];
        [cell setTarget:self];
        [cell setAction:@selector(deleteButtonClicked:)];
        return cell;
    }

    return [tableColumn dataCellForRow:row];
}

- (void)tableView:(NSTableView *)tableView willDisplayCell:(id)cell forTableColumn:(NSTableColumn *)tableColumn row:(NSInteger)row {
    if ([[tableColumn identifier] isEqualToString:@"delete"]) {
        [cell setRepresentedObject:@(row)];
    }
}

- (void)deleteButtonClicked:(id)sender {
    NSInteger row = [[sender representedObject] integerValue];
    [self deleteTodo:row];
}

#pragma mark - NSTextFieldDelegate

- (BOOL)control:(NSControl *)control textView:(NSTextView *)fieldEditor doCommandBySelector:(SEL)commandSelector {
    if (commandSelector == @selector(insertNewline:)) {
        [self addTodo:nil];
        return YES;
    }
    return NO;
}

@end