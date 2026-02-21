# RTK Token Reduction Techniques

This document describes the token reduction techniques used by the Rust Token Killer (RTK) CLI proxy. These techniques are presented in pseudo-code for easy re-implementation in other languages.

## Overview

RTK is a command proxy that intercepts CLI tool output and applies intelligent filtering to reduce token consumption by 60-90% while preserving essential information. The core philosophy is: **Keep what matters, remove what doesn't**.

## Core Techniques

### 1. Language-Aware Source Code Filtering

When reading source code files, RTK applies three levels of filtering:

```
enum FilterLevel:
    NONE       # Pass through unchanged
    MINIMAL    # Remove comments, normalize whitespace
    AGGRESSIVE # Keep only signatures and structure

function filterSourceCode(content, language, level):
    patterns = getCommentPatterns(language)
    result = empty string
    inBlockComment = false
    inDocstring = false
    
    for each line in content:
        trimmed = line.trim()
        
        # Handle block comments
        if patterns.blockStart exists and trimmed contains patterns.blockStart:
            if not a doc comment:
                inBlockComment = true
        
        if inBlockComment:
            if trimmed contains patterns.blockEnd:
                inBlockComment = false
            skip to next line
        
        # Handle Python docstrings (keep in minimal mode)
        if language is PYTHON and trimmed starts with '"""':
            inDocstring = not inDocstring
            append line to result
            continue
        
        if inDocstring:
            append line to result
            continue
        
        # Skip single-line comments (but keep doc comments)
        if patterns.lineComment exists:
            if trimmed starts with patterns.lineComment:
                if patterns.docComment exists and trimmed starts with patterns.docComment:
                    append line to result
                skip to next line
        
        # Skip empty lines temporarily
        if trimmed is empty:
            append newline to result
            continue
        
        append line to result
    
    # Normalize multiple blank lines to max 2
    result = replace 3+ consecutive newlines with 2 newlines
    return result.trim()
```

**Aggressive Mode Extension:**

```
function aggressiveFilter(content, language):
    minimal = filterSourceCode(content, language, MINIMAL)
    result = empty string
    braceDepth = 0
    inImplementation = false
    
    # Patterns to preserve
    importPattern = regex "^(use |import |from |require\(|#include)"
    signaturePattern = regex "^(pub\s+)?(async\s+)?(fn|def|function|func|class|struct|enum|trait|interface|type)\s+\w+"
    
    for each line in minimal:
        trimmed = line.trim()
        
        # Always keep imports
        if importPattern matches trimmed:
            append line to result
            continue
        
        # Keep function/type signatures
        if signaturePattern matches trimmed:
            append line to result
            inImplementation = true
            braceDepth = 0
            continue
        
        # Track brace depth for bodies
        if inImplementation:
            openBraces = count '{' in trimmed
            closeBraces = count '}' in trimmed
            braceDepth += openBraces - closeBraces
            
            # Only keep opening/closing braces
            if braceDepth <= 1 and (trimmed is "{" or trimmed is "}" or trimmed ends with "{"):
                append line to result
            
            if braceDepth <= 0:
                inImplementation = false
                if trimmed is not empty and trimmed is not "}":
                    append "    // ... implementation" to result
            continue
        
        # Keep constants and type definitions
        if trimmed starts with "const " or "static " or "let " or "pub const " or "pub static ":
            append line to result
    
    return result.trim()
```

**Smart Truncation for Large Files:**

```
function smartTruncate(content, maxLines, language):
    lines = content.split into array
    if lines.length <= maxLines:
        return content
    
    result = empty array
    keptLines = 0
    skippedSection = false
    
    # Patterns for important lines
    importantPattern = regex for signatures, imports, exports, braces
    
    for each line in lines:
        trimmed = line.trim()
        isImportant = importantPattern matches trimmed
        
        if isImportant or keptLines < maxLines / 2:
            if skippedSection:
                append "    // ... N lines omitted" to result
                skippedSection = false
            append line to result
            keptLines += 1
        else:
            skippedSection = true
        
        if keptLines >= maxLines - 1:
            break
    
    if skippedSection or keptLines < lines.length:
        append "// ... N more lines (total: X)" to result
    
    return result.join("\n")
```

### 2. ANSI Escape Sequence Stripping

Remove color codes and formatting from terminal output:

```
function stripAnsi(text):
    ansiPattern = regex "\\x1b\\[[0-9;]*[a-zA-Z]"
    return replace all matches of ansiPattern with empty string
```

### 3. Text Truncation

```
function truncate(text, maxLength):
    charCount = count characters in text
    if charCount <= maxLength:
        return text
    
    if maxLength < 3:
        return "..."
    
    return first (maxLength - 3) characters + "..."
```

### 4. Test Output Filtering

#### 4.1 Test Result Aggregation

```
function aggregateTestResults(output):
    # Parse test result lines
    resultPattern = regex "test result: (\w+)\\.\\s+(\\d+) passed;\\s+(\\d+) failed;"
    
    aggregated = new TestSummary
    
    for each line in output:
        if resultPattern matches line:
            matches = resultPattern.capture(line)
            status = matches[1]
            passed = parseInt(matches[2])
            failed = parseInt(matches[3])
            
            aggregated.passed += passed
            aggregated.failed += failed
            aggregated.suites += 1
    
    if aggregated.failed == 0:
        return compactFormat(aggregated)
    else:
        return detailedFailureFormat(output)
```

#### 4.2 Failure-Only Mode

```
function filterTestFailures(output):
    failures = empty list
    inFailureBlock = false
    currentFailure = empty list
    
    for each line in output:
        if line starts with "FAIL" or line contains "FAILED":
            if inFailureBlock and currentFailure not empty:
                add currentFailure to failures
            inFailureBlock = true
            currentFailure = [line]
        else if inFailureBlock:
            if line is empty and currentFailure.length > 3:
                add currentFailure to failures
                inFailureBlock = false
            else if line starts with whitespace or line starts with "----":
                add line to currentFailure
            else:
                add currentFailure to failures
                inFailureBlock = false
    
    if inFailureBlock and currentFailure not empty:
        add currentFailure to failures
    
    return formatFailures(failures)
```

### 5. Git Output Compaction

#### 5.1 Diff Compaction

```
function compactDiff(diffOutput, maxLines):
    result = empty list
    currentFile = ""
    added = 0
    removed = 0
    inHunk = false
    hunkLines = 0
    maxHunkLines = 10
    
    for each line in diffOutput:
        if line starts with "diff --git":
            # New file - flush previous
            if currentFile not empty and (added > 0 or removed > 0):
                append "  +N -M" to result
            
            currentFile = extract filename from line
            append "\\n📄 " + currentFile to result
            added = 0
            removed = 0
            inHunk = false
        
        else if line starts with "@@":
            inHunk = true
            hunkLines = 0
            hunkInfo = extract between @@ markers
            append "  @@ " + hunkInfo + " @@" to result
        
        else if inHunk:
            if line starts with "+" and not "+++":
                added += 1
                if hunkLines < maxHunkLines:
                    append "  " + line to result
                    hunkLines += 1
            
            else if line starts with "-" and not "---":
                removed += 1
                if hunkLines < maxHunkLines:
                    append "  " + line to result
                    hunkLines += 1
            
            else if hunkLines < maxHunkLines and not line starts with "\\":
                if hunkLines > 0:
                    append "  " + line to result
                    hunkLines += 1
            
            if hunkLines == maxHunkLines:
                append "  ... (truncated)" to result
                hunkLines += 1
        
        if result.length >= maxLines:
            append "\\n... (more changes truncated)" to result
            break
    
    # Flush last file stats
    if currentFile not empty and (added > 0 or removed > 0):
        append "  +N -M" to result
    
    return result.join("\\n")
```

#### 5.2 Status Compaction

```
function compactStatus(porcelainOutput):
    lines = porcelainOutput.split into array
    
    if lines is empty:
        return "Clean working tree"
    
    staged = 0
    modified = 0
    untracked = 0
    conflicts = 0
    
    stagedFiles = empty list
    modifiedFiles = empty list
    untrackedFiles = empty list
    
    for each line in lines skip first (branch line):
        if line.length < 3:
            continue
        
        status = line[0..1]
        filename = line[3..]
        
        # Parse two-character status
        indexStatus = status[0]
        worktreeStatus = status[1]
        
        if indexStatus in ['M', 'A', 'D', 'R', 'C']:
            staged += 1
            add filename to stagedFiles
        
        if indexStatus == 'U':
            conflicts += 1
        
        if worktreeStatus in ['M', 'D']:
            modified += 1
            add filename to modifiedFiles
        
        if status == "??":
            untracked += 1
            add filename to untrackedFiles
    
    # Build summary output
    result = "📌 " + branchName + "\\n"
    
    if staged > 0:
        result += "✅ Staged: N files\\n"
        show up to 5 files from stagedFiles
        if more than 5: "... +N more"
    
    if modified > 0:
        result += "📝 Modified: N files\\n"
        show up to 5 files from modifiedFiles
        if more than 5: "... +N more"
    
    if untracked > 0:
        result += "❓ Untracked: N files\\n"
        show up to 3 files from untrackedFiles
        if more than 3: "... +N more"
    
    if conflicts > 0:
        result += "⚠️  Conflicts: N files\\n"
    
    return result
```

#### 5.3 Log Compaction

```
function compactLog(logOutput, limit):
    lines = logOutput.split into array
    result = empty list
    
    for each line in lines take limit:
        if line.length > 80:
            line = first 77 characters + "..."
        add line to result
    
    return result.join("\\n")
```

### 6. Build Output Filtering

#### 6.1 Compilation Noise Removal

```
function filterBuildOutput(output):
    result = empty list
    errors = empty list
    warnings = empty list
    compiled = 0
    inErrorBlock = false
    currentError = empty list
    
    skipPatterns = [
        starts with "Compiling",
        starts with "Checking", 
        starts with "Downloading",
        starts with "Downloaded",
        starts with "Finished"
    ]
    
    for each line in output:
        if any pattern matches line:
            if line starts with "Compiling" or line starts with "Checking":
                compiled += 1
            continue
        
        # Detect errors
        if line starts with "error[" or line starts with "error:":
            if inErrorBlock and currentError not empty:
                add currentError to errors
            inErrorBlock = true
            currentError = [line]
        
        else if line starts with "warning:" or line starts with "warning[":
            add line to warnings
        
        else if inErrorBlock:
            if line.trim() is empty and currentError.length > 3:
                add currentError to errors
                inErrorBlock = false
            else:
                add line to currentError
    
    if inErrorBlock and currentError not empty:
        add currentError to errors
    
    if errors is empty and warnings is empty:
        return "✓ Build successful (N crates compiled)"
    
    return formatErrorsAndWarnings(errors, warnings, compiled)
```

### 7. Search Result Grouping

```
function compactSearchResults(pattern, output, maxResults):
    results = parse lines into (file, lineNumber, content) tuples
    
    # Group by file
    byFile = new Map<file, list of (lineNumber, content)>
    for each result in results:
        byFile.getOrCreate(result.file).add(result)
    
    # Build output
    output = "🔍 N matches in F files:\\n\\n"
    
    files = sort by key(byFile)
    shown = 0
    
    for each (file, matches) in files:
        if shown >= maxResults:
            break
        
        compactFile = compactPath(file, 50)
        output += "📄 " + compactFile + " (N matches):\\n"
        
        for each (lineNum, content) in matches take 10:
            cleaned = content.trim()
            if cleaned.length > maxLineLength:
                cleaned = truncate(cleaned, maxLineLength)
            output += "    " + lineNum + ": " + cleaned + "\\n"
            shown += 1
        
        if matches.length > 10:
            output += "  +" + (matches.length - 10) + "\\n"
        
        output += "\\n"
    
    if results.length > shown:
        output += "... +" + (results.length - shown) + " more\\n"
    
    return output
```

### 8. Path Compaction

```
function compactPath(path, maxLength):
    if path.length <= maxLength:
        return path
    
    parts = path.split by '/'
    if parts.length <= 3:
        return path
    
    return parts[0] + "/.../" + parts[parts.length - 2] + "/" + parts[parts.length - 1]
```

### 9. JSON Structure Extraction

```
function extractJsonSchema(jsonString, maxDepth):
    value = parse jsonString
    return extractSchema(value, depth=0, maxDepth)

function extractSchema(value, depth, maxDepth):
    if depth > maxDepth:
        return indent(depth) + "..."
    
    indent = "  " repeated depth times
    
    switch value.type:
        case NULL:
            return indent + "null"
        
        case BOOLEAN:
            return indent + "bool"
        
        case NUMBER:
            if value is integer:
                return indent + "int"
            else:
                return indent + "float"
        
        case STRING:
            if value looks like URL:
                return indent + "url"
            else if value looks like date:
                return indent + "date?"
            else:
                return indent + "string"
        
        case ARRAY:
            if value is empty:
                return indent + "[]"
            else:
                firstSchema = extractSchema(value[0], depth + 1, maxDepth)
                if value.length == 1:
                    return indent + "[\\n" + firstSchema + "\\n" + indent + "]"
                else:
                    return indent + "[" + firstSchema.trim() + "] (" + value.length + ")"
        
        case OBJECT:
            if value is empty:
                return indent + "{}"
            
            lines = [indent + "{"]
            keys = sort(value.keys)
            
            for each key in keys take 15:
                childSchema = extractSchema(value[key], depth + 1, maxDepth)
                if value[key] is simple type:
                    lines.add(indent + "  " + key + ": " + childSchema.trim() + ",")
                else:
                    lines.add(indent + "  " + key + ":")
                    lines.add(childSchema)
            
            if keys.length > 15:
                lines.add(indent + "  ... +" + (keys.length - 15) + " more keys")
            
            lines.add(indent + "}")
            return lines.join("\\n")
```

### 10. Linter Output Aggregation

```
function aggregateLinterOutput(output, linterType):
    # Parse based on linter type (ESLint, Ruff, Pylint, etc.)
    issues = parseIssues(output, linterType)
    
    if issues is empty:
        return "✓ " + linterType + ": No issues found"
    
    # Count by severity
    errors = count where issue.severity == ERROR
    warnings = count where issue.severity == WARNING
    
    # Group by rule
    byRule = new Map<rule, count>
    for each issue in issues:
        byRule[issue.rule] += 1
    
    # Group by file
    byFile = new Map<file, count>
    for each issue in issues:
        byFile[issue.file] += 1
    
    # Build output
    result = linterType + ": " + errors + " errors, " + warnings + " warnings in " + byFile.length + " files\\n"
    result += "═══════════════════════════════════════\\n"
    
    # Top rules
    sortedRules = sort by value descending(byRule)
    result += "Top rules:\\n"
    for each (rule, count) in sortedRules take 10:
        result += "  " + rule + " (" + count + "x)\\n"
    
    # Top files
    result += "\\nTop files:\\n"
    sortedFiles = sort by value descending(byFile)
    for each (file, count) in sortedFiles take 10:
        compact = compactPath(file)
        result += "  " + compact + " (" + count + " issues)\\n"
        
        # Show top 3 rules per file
        fileRules = filter issues where issue.file == file, group by rule
        sortedFileRules = sort by count descending(fileRules)
        for each (rule, count) in sortedFileRules take 3:
            result += "    " + rule + " (" + count + ")\\n"
    
    return result
```

### 11. Generic Output Summarization

```
function summarizeOutput(output, command):
    lines = output.split into array
    
    # Detect output type
    if command contains "test" or output contains "passed" and "failed":
        return summarizeTests(output)
    
    else if command contains "build" or output contains "compiling":
        return summarizeBuild(output)
    
    else if output starts with "{" or output starts with "[":
        return summarizeJson(output)
    
    else if all lines are short and not tab-separated:
        return summarizeList(output)
    
    else:
        return summarizeGeneric(output)

function summarizeTests(output):
    passed = extract count from "N passed"
    failed = extract count from "N failed"
    skipped = extract count from "N skipped"
    
    result = "📋 Test Results:\\n"
    result += "   ✅ " + passed + " passed\\n"
    if failed > 0:
        result += "   ❌ " + failed + " failed\\n"
    if skipped > 0:
        result += "   ⏭️  " + skipped + " skipped\\n"
    
    # Collect failure details
    failures = extract lines containing "FAIL" or failure markers
    if failures not empty:
        result += "\\n   Failures:\\n"
        for each failure in failures take 5:
            result += "   • " + truncate(failure, 70) + "\\n"
    
    return result
```

### 12. Tee Recovery System

When filtering fails, save raw output for recovery:

```
function teeRawOutput(raw, commandSlug, exitCode, config):
    if not shouldTee(config, raw.length, exitCode):
        return null
    
    # Sanitize filename
    sanitized = commandSlug
        .replace non-alphanumeric chars (except _ and -) with _
        .truncate to 40 chars
    
    filename = timestamp + "_" + sanitized + ".log"
    filepath = teeDirectory + "/" + filename
    
    # Truncate if exceeds max file size
    if raw.length > config.maxFileSize:
        content = raw[0..config.maxFileSize] + "\\n\\n--- truncated at N bytes ---"
    else:
        content = raw
    
    write content to filepath
    
    # Rotate old files
    cleanupOldFiles(teeDirectory, config.maxFiles)
    
    return filepath

function shouldTee(config, rawLength, exitCode):
    if not config.enabled:
        return false
    
    if config.mode == NEVER:
        return false
    
    if config.mode == FAILURES and exitCode == 0:
        return false
    
    if rawLength < minimumTeeSize:
        return false
    
    return true
```

### 13. Multi-Tier Parsing Strategy

For maximum compatibility with changing output formats:

```
enum ParseResult:
    FULL(data)        # Tier 1: Complete structured parse
    DEGRADED(data, warnings)  # Tier 2: Partial/regex-based parse
    PASSTHROUGH(raw)  # Tier 3: Fallback to truncated raw output

function parseOutput(output, parsers):
    # Tier 1: Try structured parsing (JSON, XML, etc.)
    for each structuredParser in parsers.structured:
        try:
            data = structuredParser.parse(output)
            return ParseResult.FULL(data)
        catch ParseError:
            continue
    
    # Tier 2: Try regex extraction
    for each regexParser in parsers.regex:
        data = regexParser.extract(output)
        if data is valid:
            warnings = ["Structured parse failed, using regex fallback"]
            return ParseResult.DEGRADED(data, warnings)
    
    # Tier 3: Passthrough with truncation
    return ParseResult.PASSTHROUGH(truncate(output, 500))
```

### 14. Error Pattern Detection

```
function filterErrors(output):
    errorPatterns = [
        regex "(?i)^.*error[\\s:\\[].*$",
        regex "(?i)^.*\\berr\\b.*$",
        regex "(?i)^.*warning[\\s:\\[].*$",
        regex "(?i)^.*\\bwarn\\b.*$",
        regex "(?i)^.*failed.*$",
        regex "(?i)^.*failure.*$",
        regex "(?i)^.*exception.*$",
        regex "(?i)^.*panic.*$",
        # Language-specific patterns
        regex "^error\\[E\\d+\\]:.*$",  # Rust
        regex "^\\s*--> .*:\\d+:\\d+$",  # Rust location
        regex "^Traceback.*$",  # Python
        regex "^\\s*File \".*\", line \\d+.*$",  # Python traceback
        regex "^\\s*at .*:\\d+:\\d+.*$",  # JS/TS stack trace
        regex "^.*\\.go:\\d+:.*$"  # Go error
    ]
    
    result = empty list
    inErrorBlock = false
    blankCount = 0
    
    for each line in output:
        isErrorLine = any pattern matches line
        
        if isErrorLine:
            inErrorBlock = true
            blankCount = 0
            add line to result
        else if inErrorBlock:
            if line.trim() is empty:
                blankCount += 1
                if blankCount >= 2:
                    inErrorBlock = false
                else:
                    add line to result
            else if line starts with whitespace:
                # Continuation of error context
                add line to result
                blankCount = 0
            else:
                inErrorBlock = false
    
    return result.join("\\n")
```

### 15. Confirmation Message Formatting

```
function okConfirmation(action, detail):
    if detail is empty:
        return "ok " + action
    else:
        return "ok " + action + " " + detail

# Examples:
# okConfirmation("merged", "#42") => "ok merged #42"
# okConfirmation("created", "PR #5 ...") => "ok created PR #5 ..."
# okConfirmation("commented", "") => "ok commented"
```

### 16. Token Counting

```
function countTokens(text):
    # Approximate token count using whitespace and punctuation splitting
    # This is a rough approximation - actual LLM tokenizers vary
    words = text.split by whitespace and punctuation
    
    # Apply token ratio (typically 0.75 tokens per word for English)
    return words.length * 0.75

function calculateSavings(original, filtered):
    originalTokens = countTokens(original)
    filteredTokens = countTokens(filtered)
    
    if originalTokens == 0:
        return 0
    
    savings = (originalTokens - filteredTokens) / originalTokens * 100
    return savings
```

### 17. Tracking and Metrics

```
function trackCommand(originalCommand, rtkCommand, originalOutput, filteredOutput):
    record = {
        timestamp: now(),
        original_command: originalCommand,
        rtk_command: rtkCommand,
        input_tokens: countTokens(originalOutput),
        output_tokens: countTokens(filteredOutput),
        savings_percent: calculateSavings(originalOutput, filteredOutput)
    }
    
    save record to tracking database
    
    return record.savings_percent
```

## Summary of Key Patterns

1. **Remove noise**: Strip compilation messages, download progress, and other non-actionable output
2. **Group by category**: Aggregate results by file, rule, or error type rather than listing individually
3. **Show counts, not details**: Replace long lists with "N items" summaries
4. **Truncate intelligently**: Keep beginnings and ends of important sections, omit middle
5. **Preserve structure**: Keep file paths, line numbers, and error messages, remove surrounding context
6. **Fallback gracefully**: When parsing fails, provide degraded output rather than failing completely
7. **Track metrics**: Measure and report token savings to validate effectiveness
