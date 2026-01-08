#import <Cocoa/Cocoa.h>
#import "MainWindow.h"

@interface AppDelegate : NSObject <NSApplicationDelegate>

@property (strong, nonatomic) NSWindow *passwordWindow;
@property (strong, nonatomic) NSTextField *passwordField;
@property (assign, nonatomic) NSInteger passwordAttempts;
@property (strong, nonatomic) MainWindow *mainWindow;

@end