#import <Cocoa/Cocoa.h>
#import "TodoListManager.h"

@interface MainWindow : NSObject <NSTableViewDataSource, NSTableViewDelegate, NSTextFieldDelegate>

@property (strong, nonatomic) NSWindow *window;
@property (strong, nonatomic) TodoListManager *todoManager;
@property (strong, nonatomic) NSTextField *inputField;
@property (strong, nonatomic) NSTableView *tableView;
@property (strong, nonatomic) NSTextField *statusField;

- (void)showWindow;
- (void)updateStatusBar;

@end