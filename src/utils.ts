import * as tl from 'azure-pipelines-task-lib/task';

export function debugLog(message: string): void {
    tl.debug(message);
    // Also output to console for VS Code debugging
    if (process.env.SYSTEM_DEBUG === 'true') {
        console.log(`[DEBUG] ${message}`);
    }
}