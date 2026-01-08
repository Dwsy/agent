#import <Foundation/Foundation.h>

@interface TodoListManager : NSObject

- (instancetype)init;
- (void)addTodo:(NSString *)text;
- (void)removeTodoAtIndex:(NSUInteger)index;
- (void)toggleCompleteAtIndex:(NSUInteger)index;
- (NSString *)textAtIndex:(NSUInteger)index;
- (BOOL)isCompletedAtIndex:(NSUInteger)index;
- (NSUInteger)count;
- (NSUInteger)completedCount;
- (void)saveData;
- (void)loadData;

@end