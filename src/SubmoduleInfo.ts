export interface SubmoduleInfo {
    name: string; // Submodule name, leaf folder name in the path
    path: string; // Submodule path, full path
    url: string; // Remote repository URL
    branch?: string; // Branch to check (optional)
    currentCommitSha: string; // Current commit SHA (short, 8 chars)
    latestCommitSha: string; // Latest commit SHA (short, 8 chars)
    currentTags: string[]; // Git tags for current commit
    latestTags: string[]; // Git tags for latest commit
    currentDisplayVersion: string; // Display version (SHA and tag)
    latestDisplayVersion: string; // Display version for latest (SHA and tag)
    needsUpdate: boolean; // Whether update is needed
    error?: string; // Error message if any
}
