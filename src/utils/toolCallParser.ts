import { v4 as uuidv4 } from 'uuid';

export interface ParsedToolCall {
    id: string;
    tool: string;
    args: Record<string, any>;
    rawJson: string;
    startIndex: number;
    endIndex: number;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
}

export interface ContentSegment {
    type: 'text' | 'tool';
    content?: string;
    toolCall?: ParsedToolCall;
}

export interface ParseResult {
    toolCalls: ParsedToolCall[];
    cleanContent: string;
    segments: ContentSegment[];
}

export function parseToolCalls(content: string): ParseResult {
    const toolCalls: ParsedToolCall[] = [];
    let cleanContent = content;
    
    // We maintain a list of ranges that have been identified as tool calls
    // to avoid double-processing and to remove them later.
    const replacements: {start: number, end: number, toolCall: ParsedToolCall}[] = [];

    // Helper to add tool call
    const addToolCall = (jsonStr: string, start: number, end: number) => {
        try {
            // Basic cleanup for common LLM JSON syntax errors
            const cleanJson = jsonStr
                .replace(/,\s*}/g, '}') // Remove trailing comma
                .replace(/,\s*]/g, ']');
                
            const parsed = JSON.parse(cleanJson);
            
            // Validate basic structure
            if (parsed.tool && parsed.args) {
                // Check if this range overlaps with existing ones
                const isOverlap = replacements.some(r => 
                    (start >= r.start && start < r.end) ||
                    (end > r.start && end <= r.end)
                );
                
                if (!isOverlap) {
                    const toolCall: ParsedToolCall = {
                        id: uuidv4(),
                        tool: String(parsed.tool).trim(),
                        args: parsed.args,
                        rawJson: jsonStr,
                        startIndex: start,
                        endIndex: end,
                        status: 'pending'
                    };
                    toolCalls.push(toolCall);
                    replacements.push({ start, end, toolCall });
                    return true;
                }
            }
        } catch (e) {
            // Ignore parse errors, it might just be text that looks like JSON
        }
        return false;
    };

    // Strategy 1: Markdown Code Blocks containing JSON
    // Matches ```json { ... } ``` or ``` { ... } ```
    // We capture the full block to remove it entirely
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/gi;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
        // match[0] is the full code block, match[1] is the JSON content
        // We want to remove the full block
        addToolCall(match[1], match.index, match.index + match[0].length);
    }

    // Strategy 2: Bare JSON Objects
    // Look for { "tool": ... } pattern outside of code blocks
    // This is a manual scan because regex for nested braces is impossible in JS
    const bareJsonStartRegex = /\{\s*"tool"\s*:/g;
    
    while ((match = bareJsonStartRegex.exec(content)) !== null) {
        const start = match.index;
        
        // Skip if this index is already covered by Strategy 1
        if (replacements.some(r => start >= r.start && start < r.end)) continue;

        let braceCount = 0;
        let inString = false;
        let escape = false;
        let end = -1;

        // Scan forward to find the matching closing brace
        for (let i = start; i < content.length; i++) {
            const char = content[i];
            
            if (escape) {
                escape = false;
                continue;
            }
            
            if (char === '\\') {
                escape = true;
                continue;
            }
            
            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') braceCount++;
                if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        end = i + 1; // Include the closing brace
                        break;
                    }
                }
            }
        }

        if (end !== -1) {
            const potentialJson = content.substring(start, end);
            addToolCall(potentialJson, start, end);
        }
    }

    // Generate segments based on sorted replacements
    const segments: ContentSegment[] = [];
    const sortedReplacements = [...replacements].sort((a, b) => a.start - b.start);
    
    let currentIndex = 0;
    for (const { start, end, toolCall } of sortedReplacements) {
        // Add text before the tool call if any
        if (start > currentIndex) {
            const text = content.substring(currentIndex, start);
            if (text) { // Keep whitespace? Yes, markdown needs it.
                segments.push({ type: 'text', content: text });
            }
        }
        
        // Add the tool call
        segments.push({ type: 'tool', toolCall });
        
        currentIndex = end;
    }
    
    // Add remaining text
    if (currentIndex < content.length) {
        segments.push({ type: 'text', content: content.substring(currentIndex) });
    }

    // Perform removal of tool call text from content
    // Sort descending by start index to keep indices valid during slicing
    replacements.sort((a, b) => b.start - a.start);
    
    for (const { start, end } of replacements) {
        // We replace with an empty string, effectively removing it.
        // We might want to leave a small marker or newline?
        // For now, clean removal is best for UI.
        cleanContent = cleanContent.slice(0, start) + cleanContent.slice(end);
    }

    return {
        toolCalls,
        cleanContent: cleanContent.trim(),
        segments
    };
}

// Helpers for UI components
export function getToolLabel(toolName: string): string {
    const name = toolName.trim();
    if (name.includes('write_file')) return 'Create/Edit File';
    if (name.includes('read_file')) return 'Read File';
    if (name.includes('list_dir')) return 'List Directory';
    if (name.includes('execute_command')) return 'Run Command';
    if (name.includes('search')) return 'Search';
    if (name.includes('delete_file')) return 'Delete File';
    return name;
}

export function getToolColor(toolName: string): string {
    const name = toolName.trim();
    if (name.includes('write_file')) return 'text-green-400';
    if (name.includes('read_file')) return 'text-blue-400';
    if (name.includes('execute_command')) return 'text-yellow-400';
    if (name.includes('delete_file')) return 'text-red-400';
    return 'text-gray-400';
}
