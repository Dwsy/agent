#import "TodoListManager.h"

@interface TodoItem : NSObject
@property (copy, nonatomic) NSString *text;
@property (assign, nonatomic) BOOL completed;
@end

@implementation TodoItem
@end

@interface TodoListManager ()
@property (strong, nonatomic) NSMutableArray *todos;
@property (copy, nonatomic) NSString *dataFilePath;
@end

@implementation TodoListManager

- (instancetype)init {
    self = [super init];
    if (self) {
        self.todos = [[NSMutableArray alloc] init];
        NSString *homeDir = NSHomeDirectory();
        self.dataFilePath = [homeDir stringByAppendingPathComponent:@".todolist_data.json"];
        [self loadData];
    }
    return self;
}

- (void)addTodo:(NSString *)text {
    TodoItem *item = [[TodoItem alloc] init];
    item.text = text;
    item.completed = NO;
    [self.todos addObject:item];
    [self saveData];
}

- (void)removeTodoAtIndex:(NSUInteger)index {
    if (index < self.todos.count) {
        [self.todos removeObjectAtIndex:index];
        [self saveData];
    }
}

- (void)toggleCompleteAtIndex:(NSUInteger)index {
    if (index < self.todos.count) {
        TodoItem *item = self.todos[index];
        item.completed = !item.completed;
        [self saveData];
    }
}

- (NSString *)textAtIndex:(NSUInteger)index {
    if (index < self.todos.count) {
        TodoItem *item = self.todos[index];
        return item.text;
    }
    return @"";
}

- (BOOL)isCompletedAtIndex:(NSUInteger)index {
    if (index < self.todos.count) {
        TodoItem *item = self.todos[index];
        return item.completed;
    }
    return NO;
}

- (NSUInteger)count {
    return self.todos.count;
}

- (NSUInteger)completedCount {
    NSUInteger count = 0;
    for (TodoItem *item in self.todos) {
        if (item.completed) {
            count++;
        }
    }
    return count;
}

- (void)saveData {
    NSMutableArray *array = [[NSMutableArray alloc] init];

    for (TodoItem *item in self.todos) {
        NSDictionary *dict = @{
            @"text": item.text,
            @"completed": @(item.completed)
        };
        [array addObject:dict];
    }

    NSDictionary *data = @{
        @"todos": array
    };

    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:data
                                                       options:NSJSONWritingPrettyPrinted
                                                         error:&error];

    if (error) {
        NSLog(@"Error creating JSON: %@", error.localizedDescription);
        return;
    }

    [jsonData writeToFile:self.dataFilePath atomically:YES];
}

- (void)loadData {
    NSFileManager *fileManager = [NSFileManager defaultManager];

    if (![fileManager fileExistsAtPath:self.dataFilePath]) {
        return; // No data file yet
    }

    NSData *jsonData = [NSData dataWithContentsOfFile:self.dataFilePath];
    if (!jsonData) {
        NSLog(@"Error reading data file");
        return;
    }

    NSError *error = nil;
    NSDictionary *data = [NSJSONSerialization JSONObjectWithData:jsonData
                                                         options:0
                                                           error:&error];

    if (error) {
        NSLog(@"Error parsing JSON: %@", error.localizedDescription);
        return;
    }

    NSArray *array = data[@"todos"];
    if (!array) {
        NSLog(@"No todos array in JSON");
        return;
    }

    [self.todos removeAllObjects];

    for (NSDictionary *dict in array) {
        TodoItem *item = [[TodoItem alloc] init];
        item.text = dict[@"text"];
        item.completed = [dict[@"completed"] boolValue];
        [self.todos addObject:item];
    }
}

@end