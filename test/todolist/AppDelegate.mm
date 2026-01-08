#import "AppDelegate.h"

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    self.passwordAttempts = 0;
    [self showPasswordDialog];
}

- (void)applicationWillTerminate:(NSNotification *)aNotification {
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)showPasswordDialog {
    // Create password window
    NSRect frame = NSMakeRect(0, 0, 400, 200);
    NSUInteger styleMask = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable;
    self.passwordWindow = [[NSWindow alloc] initWithContentRect:frame
                                                     styleMask:styleMask
                                                       backing:NSBackingStoreBuffered
                                                         defer:NO];
    [self.passwordWindow setTitle:@"Authentication Required"];
    [self.passwordWindow center];
    [self.passwordWindow setReleasedWhenClosed:NO];

    // Create password label
    NSTextField *label = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 140, 360, 30)];
    [label setStringValue:@"Enter password to access Todo List:"];
    [label setBezeled:NO];
    [label setDrawsBackground:NO];
    [label setEditable:NO];
    [label setSelectable:NO];
    [label setAlignment:NSTextAlignmentCenter];
    [[self.passwordWindow contentView] addSubview:label];

    // Create password field
    self.passwordField = [[NSSecureTextField alloc] initWithFrame:NSMakeRect(20, 100, 360, 30)];
    [self.passwordField setTarget:self];
    [self.passwordField setAction:@selector(verifyPassword:)];
    [[self.passwordWindow contentView] addSubview:self.passwordField];

    // Create submit button
    NSButton *button = [[NSButton alloc] initWithFrame:NSMakeRect(150, 50, 100, 30)];
    [button setTitle:@"Submit"];
    [button setTarget:self];
    [button setAction:@selector(verifyPassword:)];
    [[self.passwordWindow contentView] addSubview:button];

    // Show window
    [self.passwordWindow makeKeyAndOrderFront:nil];
    [self.passwordField becomeFirstResponder];
}

- (void)verifyPassword:(id)sender {
    NSString *input = [self.passwordField stringValue];
    self.passwordAttempts++;

    if ([input isEqualToString:@"123456"]) {
        // Password correct - close password window and show main window
        [self.passwordWindow close];
        [self showMainWindow];
    } else {
        // Password incorrect
        [self.passwordField setStringValue:@""];

        if (self.passwordAttempts >= 3) {
            // Too many attempts - show error and exit
            NSAlert *alert = [[NSAlert alloc] init];
            [alert setMessageText:@"Authentication Failed"];
            [alert setInformativeText:@"Too many incorrect password attempts. Application will now exit."];
            [alert setAlertStyle:NSAlertStyleCritical];
            [alert runModal];
            [NSApp terminate:nil];
        } else {
            // Show error message
            NSAlert *alert = [[NSAlert alloc] init];
            [alert setMessageText:@"Incorrect Password"];
            [alert setInformativeText:[NSString stringWithFormat:@"Please try again. Attempts remaining: %ld", 3 - self.passwordAttempts]];
            [alert setAlertStyle:NSAlertStyleWarning];
            [alert runModal];
        }
    }
}

- (void)showMainWindow {
    self.mainWindow = [[MainWindow alloc] init];
    [self.mainWindow showWindow];
}

@end