import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { AzureDevOpsApi } from './azureDevOpsApi';

interface SubmoduleInfo {
    name: string;                    // Submodule name, leaf folder name in the path
    path: string;                    // Submodule path, full path
    url: string;                     // Remote repository URL
    branch?: string;                 // Branch to check (optional)
    currentCommitSha: string;        // Current commit SHA (short, 8 chars)
    latestCommitSha: string;         // Latest commit SHA (short, 8 chars)
    currentTags: string[];           // Git tags for current commit
    latestTags: string[];            // Git tags for latest commit
    currentDisplayVersion: string;   // Display version (SHA and tag)
    latestDisplayVersion: string;    // Display version for latest (SHA and tag)
    needsUpdate: boolean;            // Whether update is needed
    error?: string;                  // Error message if any
}

interface GitmodulesEntry {
    path: string;
    url: string;
    branch?: string;
}

class GitSubmoduleChecker {
    private workingDirectory: string;
    private gitmodulesPath: string;
    private defaultBranch: string;
    private suppressTagNames: string[];

    private git: SimpleGit;

    constructor(workingDir: string, gitmodulesPath: string, defaultBranch: string = 'main', suppressTagNames: string = 'NoSubmoduleCheck,NoBuild') {
        this.workingDirectory = workingDir;
        this.gitmodulesPath = path.resolve(workingDir, gitmodulesPath);
        this.defaultBranch = defaultBranch;
        this.suppressTagNames = suppressTagNames.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        this.git = simpleGit(workingDir);
    }

    public async checkSubmodules(): Promise<SubmoduleInfo[]> {
        tl.debug(`Starting Git Submodule Updater analysis`);
        tl.debug(`Working directory: ${this.workingDirectory}`);
        tl.debug(`Gitmodules path: ${this.gitmodulesPath}`);
        tl.debug(`Default branch: ${this.defaultBranch}`);
        tl.debug(`Suppress tag names: ${this.suppressTagNames.join(', ')}`);

        console.log('🔍 Git Submodule Updater - Starting Analysis');
        console.log(`📁 Working Directory: ${this.workingDirectory}`);
        console.log(`📄 .gitmodules Path: ${this.gitmodulesPath}`);
        console.log(`🌿 Default Branch: ${this.defaultBranch}`);
        console.log(`🚫 Suppress Tag Names: ${this.suppressTagNames.join(', ') || '(none)'}`);
        console.log('');

        // Check for suppression tags on current PR
        if (this.suppressTagNames.length > 0) {
            try {
                const azDoApi = new AzureDevOpsApi();
                if (azDoApi.isPullRequest()) {
                    console.log(`🔍 Checking PR tags for suppression...`);
                    
                    // Get PR labels directly
                    const labels = await azDoApi.getCurrentPullRequestLabels();                        
                    if (labels && labels.length > 0) {
                        const prTagNames = labels.filter(label => label.active).map(label => label.name);
                            
                        const suppressTag = this.suppressTagNames.find(suppressTag => 
                            prTagNames.some(prTag => prTag.toLowerCase() === suppressTag.toLowerCase())
                        );
                        
                        if (suppressTag) {
                            console.log(`🚫 Submodule check suppressed due to PR tag: ${suppressTag}`);
                            console.log('✅ Skipping submodule analysis');
                            console.log('');
                            tl.debug(`Submodule check skipped due to PR tag: ${suppressTag}`);
                            return [];
                        } else {
                            console.log(`✅ No matching suppression tags found - continuing with analysis`);
                        }
                    } else {
                        console.log(`ℹ️  No labels found on PR - continuing with analysis`);
                    }
                } else {
                    console.log(`ℹ️  Not running in PR context - suppression check skipped`);
                }
            } catch (error) {
                console.log(`⚠️  Could not check PR tags for suppression: ${error instanceof Error ? error.message : String(error)}`);
                tl.debug(`Failed to check PR tags, continuing with normal analysis: ${error}`);
            }
        }

        if (!fs.existsSync(this.gitmodulesPath)) {
            tl.warning(`No .gitmodules file found at ${this.gitmodulesPath}`);
            console.log('⚠️ No .gitmodules file found - no submodules to check');
            return [];
        }

        const submodules = this.parseGitmodules();
        console.log(`📦 Found ${submodules.length} submodule(s) configured in .gitmodules`);
        console.log('');

        const results: SubmoduleInfo[] = [];

        for (const [index, submodule] of submodules.entries()) {
            console.log(`[${index + 1}/${submodules.length}] Checking submodule: ${submodule.path}`);
            
            try {
                const result = await this.checkSubmodule(submodule);
                results.push(result);
                
                console.log(`  📍 URL: ${result.url}`);
                console.log(`  📌 Current commit: ${result.currentDisplayVersion}`);
                console.log(`  🏷️ Latest commit:  ${result.latestDisplayVersion}`);
                
                if (result.needsUpdate) {
                    console.log('  ⚠️ Status: NEEDS UPDATE');
                } else {
                    console.log('  ✅ Status: UP TO DATE');
                }
            } catch (error) {
                const errorResult: SubmoduleInfo = {
                    name: path.basename(submodule.path),
                    path: submodule.path,
                    url: submodule.url,
                    branch: submodule.branch,
                    currentCommitSha: '',
                    latestCommitSha: '',
                    currentDisplayVersion: 'unknown',
                    latestDisplayVersion: 'unknown',
                    currentTags: [],
                    latestTags: [],
                    needsUpdate: false,
                    error: error instanceof Error ? error.message : String(error)
                };
                results.push(errorResult);
                console.log(`  ❌ Error: ${errorResult.error}`);
                tl.warning(`Error checking submodule ${submodule.path}: ${errorResult.error}`);
            }
            
            console.log('');
        }

        this.printSummary(results);
        this.setOutputVariables(results);
        return results;
    }

    private parseGitmodules(): GitmodulesEntry[] {
        const content = fs.readFileSync(this.gitmodulesPath, 'utf-8');
        const submodules: GitmodulesEntry[] = [];
        
        const lines = content.split('\n');
        let currentSubmodule: Partial<GitmodulesEntry> = {};
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('[submodule ')) {
                if (currentSubmodule.path && currentSubmodule.url) {
                    submodules.push(currentSubmodule as GitmodulesEntry);
                }
                currentSubmodule = {};
            } else if (trimmedLine.startsWith('path = ')) {
                currentSubmodule.path = trimmedLine.substring(7).trim();
            } else if (trimmedLine.startsWith('url = ')) {
                currentSubmodule.url = trimmedLine.substring(6).trim();
            } else if (trimmedLine.startsWith('branch = ')) {
                currentSubmodule.branch = trimmedLine.substring(9).trim();
            }
        }
        
        // Add the last submodule if it exists
        if (currentSubmodule.path && currentSubmodule.url) {
            submodules.push(currentSubmodule as GitmodulesEntry);
        }
        
        return submodules;
    }

    private async checkSubmodule(submodule: GitmodulesEntry): Promise<SubmoduleInfo> {
        // Get current commit from the main repository's index
        const currentCommit = await this.getCurrentSubmoduleCommit(submodule.path);
        
        // Get latest commit from remote repository
        const branchToCheck = submodule.branch || this.defaultBranch;
        const latestCommit = await this.getLatestRemoteCommit(submodule.url, branchToCheck);
        
        // Get git tags for both commits
        const currentCommitTags = await this.getTagsForCommit(submodule.url, currentCommit);
        const latestCommitTags = await this.getTagsForCommit(submodule.url, latestCommit);
        
        const needsUpdate = currentCommit !== latestCommit;
        
        const currentCommitDisplay = this.formatCommitWithTags(currentCommit, currentCommitTags);
        const latestCommitDisplay = this.formatCommitWithTags(latestCommit, latestCommitTags);
        
        return {
            name: path.basename(submodule.path),
            path: submodule.path,
            url: submodule.url,
            branch: branchToCheck,
            currentCommitSha: currentCommit.substring(0, 8),
            latestCommitSha: latestCommit.substring(0, 8),
            currentDisplayVersion: currentCommitDisplay,
            latestDisplayVersion: latestCommitDisplay,
            currentTags: currentCommitTags,
            latestTags: latestCommitTags,
            needsUpdate
        };
    }

    private async getCurrentSubmoduleCommit(submodulePath: string): Promise<string> {
        try {
            // Use git ls-tree to get the commit hash referenced by the main repo
            const result = await this.git.raw(['ls-tree', 'HEAD', submodulePath]);
            const match = result.match(/^\d+ commit ([a-f0-9]+)\t/);
            
            if (match && match[1]) {
                return match[1];
            }
            
            throw new Error('Could not parse submodule commit from ls-tree output');
        } catch (error) {
            throw new Error(`Failed to get current submodule commit for ${submodulePath}: ${error}`);
        }
    }

    private async getLatestRemoteCommit(repoUrl: string, branch: string): Promise<string> {
        try {
            // Use git ls-remote to get the latest commit from the remote repository
            const result = await this.git.raw(['ls-remote', repoUrl, `refs/heads/${branch}`]);
            const lines = result.trim().split('\n');
            
            if (lines.length > 0 && lines[0]) {
                const match = lines[0].match(/^([a-f0-9]+)\s+/);
                if (match && match[1]) {
                    return match[1];
                }
            }
            
            throw new Error(`Could not find branch '${branch}' in remote repository`);
        } catch (error) {
            throw new Error(`Failed to get latest remote commit from ${repoUrl} (branch: ${branch}): ${error}`);
        }
    }

    private async getTagsForCommit(repoUrl: string, commitSha: string): Promise<string[]> {
        try {
            // Get all tags from the remote repository
            const result = await this.git.raw(['ls-remote', '--tags', repoUrl]);
            const lines = result.trim().split('\n').filter(line => line.trim());
            const tags: string[] = [];
            
            for (const line of lines) {
                const match = line.match(/^([a-f0-9]+)\s+refs\/tags\/(.+)$/);
                if (match && match[1] && match[2]) {
                    const tagCommit = match[1];
                    const tagName = match[2];
                    
                    // For annotated tags, we want the dereferenced version (ending with ^{})
                    // For lightweight tags, we use the tag reference directly
                    let actualTagName = tagName;
                    let useThis = true;
                    
                    if (tagName.endsWith('^{}')) {
                        // This is the dereferenced commit for an annotated tag
                        actualTagName = tagName.substring(0, tagName.length - 3);
                    } else {
                        // This might be a tag object reference - check if there's a corresponding ^{} version
                        const hasDerefVersion = lines.some(l => l.includes(`refs/tags/${tagName}^{}`));
                        if (hasDerefVersion) {
                            // Skip this tag object reference, we'll use the ^{} version
                            useThis = false;
                        }
                    }
                    
                    if (!useThis) {
                        continue;
                    }
                    
                    // Check if this tag points to our commit
                    if (tagCommit === commitSha) {
                        tags.push(actualTagName);
                    }
                }
            }
            
            // Sort tags in reverse order (newer versions first, assuming semantic versioning)
            return tags.sort((a, b) => {
                // Try to sort semantically if they look like version numbers
                const aMatch = a.match(/^v?(\d+)\.(\d+)\.(\d+)/);
                const bMatch = b.match(/^v?(\d+)\.(\d+)\.(\d+)/);
                
                if (aMatch && bMatch) {
                    const aMajor = parseInt(aMatch[1]);
                    const aMinor = parseInt(aMatch[2]);
                    const aPatch = parseInt(aMatch[3]);
                    const bMajor = parseInt(bMatch[1]);
                    const bMinor = parseInt(bMatch[2]);
                    const bPatch = parseInt(bMatch[3]);
                    
                    if (aMajor !== bMajor) return bMajor - aMajor;
                    if (aMinor !== bMinor) return bMinor - aMinor;
                    return bPatch - aPatch;
                }
                
                // Fallback to alphabetical sorting
                return b.localeCompare(a);
            });
        } catch (error) {
            tl.debug(`Could not fetch tags for commit ${commitSha} from ${repoUrl}: ${error}`);
            return [];
        }
    }

    private formatCommitWithTags(commitSha: string, tags: string[]): string {
        const shortSha = commitSha.substring(0, 8);
        if (tags.length === 0) {
            return shortSha;
        }
        
        // Limit to the first 3 tags to avoid overly long output
        const displayTags = tags.slice(0, 3);
        const tagsString = displayTags.join(', ');
        const moreTagsIndicator = tags.length > 3 ? ` (+${tags.length - 3} more)` : '';
        
        return `${shortSha} (${tagsString}${moreTagsIndicator})`;
    }

    private printSummary(results: SubmoduleInfo[]): void {
        console.log('📊 SUMMARY');
        console.log('═'.repeat(50));
        
        const total = results.length;
        const upToDate = results.filter(r => !r.needsUpdate && !r.error).length;
        const needsUpdate = results.filter(r => r.needsUpdate).length;
        const errors = results.filter(r => r.error).length;
        
        console.log(`📦 Total submodules: ${total}`);
        console.log(`✅ Up to date: ${upToDate}`);
        console.log(`⚠️ Need updating: ${needsUpdate}`);
        console.log(`❌ Errors: ${errors}`);
        
        if (needsUpdate > 0) {
            console.log('');
            console.log('⚠️  SUBMODULES NEEDING UPDATES:');
            const outdatedSubmodules = results.filter(r => r.needsUpdate);
            for (const submodule of outdatedSubmodules) {
                console.log(`   • ${submodule.path}: ${submodule.currentDisplayVersion} → ${submodule.latestDisplayVersion}`);
            }
        }
        
        if (errors > 0) {
            console.log('');
            console.log('❌ SUBMODULES WITH ERRORS:');
            const errorSubmodules = results.filter(r => r.error);
            for (const submodule of errorSubmodules) {
                console.log(`   • ${submodule.path}: ${submodule.error}`);
            }
        }
        
        console.log('═'.repeat(50));
        console.log('');
    }

    private setOutputVariables(results: SubmoduleInfo[]): void {
        const total = results.length;
        const upToDate = results.filter(r => !r.needsUpdate && !r.error).length;
        const needsUpdate = results.filter(r => r.needsUpdate).length;
        const needsUpdateList = results.filter(r => r.needsUpdate).map(r => r.path).join(',');

        tl.setVariable('SubmodulesTotal', total.toString());
        tl.setVariable('SubmodulesUpToDate', upToDate.toString());
        tl.setVariable('SubmodulesNeedingUpdate', needsUpdate.toString());
        tl.setVariable('SubmodulesNeedingUpdateList', needsUpdateList);

        tl.debug(`Set output variables - Total: ${total}, UpToDate: ${upToDate}, NeedingUpdate: ${needsUpdate}`);
    }
}

function createPullRequestCommentContent(submodule: SubmoduleInfo, createdPullRequests?: Map<string, number>): string {
    
    let comment = `⚠ Submodule needs update:\n[${submodule.path}](${submodule.url}): ${submodule.currentDisplayVersion} → ${submodule.latestDisplayVersion}`;
    
    // Add PR link if a PR was created for this submodule
    if (createdPullRequests && createdPullRequests.has(submodule.path)) {
        const prId = createdPullRequests.get(submodule.path);
        comment += `\n\n🔄 **Update PR:** !${prId}`;
    }
    
    return comment;
}

async function addPullRequestCommentsForOutdatedSubmodules(results: SubmoduleInfo[], azDoApi: AzureDevOpsApi, createdPullRequests?: Map<string, number>): Promise<void> {
    const outdatedSubmodules = results.filter(r => r.needsUpdate);
    
    if (outdatedSubmodules.length === 0) {
        console.log('✅ No submodules need updating - no PR comments required');
        tl.debug('No outdated submodules found, no PR comments to add');
        return;
    }

    console.log(`💬 Adding PR comments for ${outdatedSubmodules.length} outdated submodule(s)...`);

    for (const submodule of outdatedSubmodules) {
        const commentContent = createPullRequestCommentContent(submodule, createdPullRequests);
        const added = await azDoApi.addPullRequestCommentIfNotExists(commentContent);
        
        if (added) {
            console.log(`  ✅ Added PR comment for ${submodule.path}`);
        } else {
            console.log(`  ℹ️ PR comment already exists for ${submodule.path}`);
        }
    }
}

async function createPullRequestsForOutdatedSubmodules(
    submodules: SubmoduleInfo[], 
    workingDirectory: string
): Promise<Map<string, number>> {
    const outdatedSubmodules = submodules.filter(r => r.needsUpdate);
    const createdPRs = new Map<string, number>();
    
    if (outdatedSubmodules.length === 0) {
        console.log('ℹ️ All submodules are up to date - no PRs to create');
        return createdPRs;
    }

    const azDoApi = new AzureDevOpsApi();
    if (!azDoApi.isPullRequest()) {
        const buildReason = process.env.BUILD_REASON || 'unknown';
        console.log(`ℹ️  Build reason (${buildReason}) indicates this is not a Pull Request - no PR creation needed`);
        tl.debug('Not running in a Pull Request build context, skipping PR creation');
        return createdPRs;
    }

    // Get PR information from API
    console.log(`🔍 Fetching PR information from Azure DevOps API...`);
    let currentPR: any;
    try {
        currentPR = await azDoApi.getCurrentPullRequest();
        console.log(`✅ Retrieved PR information: Source Branch: ${currentPR.sourceRefName}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`⚠️  Failed to fetch PR information: ${errorMessage}`);
        throw new Error(`Cannot create PRs without current PR information: ${errorMessage}`);
    }
                        
    console.log(`🚀 Creating PRs for ${outdatedSubmodules.length} outdated submodule(s)`);
    
    for (const submodule of outdatedSubmodules) {
        try {
            const prId = await createOrFindPullRequestForSubmodule(submodule, azDoApi, workingDirectory, currentPR);
            if (prId) {
                createdPRs.set(submodule.path, prId);
                console.log(`✅ Created or found PR #${prId} for submodule: ${submodule.path}`);
            }
        } catch (error) {
            console.log(`⚠️  Failed to create PR for ${submodule.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    return createdPRs;
}

async function createOrFindPullRequestForSubmodule(
    submodule: SubmoduleInfo,
    azDoApi: AzureDevOpsApi,
    workingDirectory: string,
    currentPR: any
): Promise<number | null> {
    const git = simpleGit(workingDirectory);
        
    // Get the source branch to use as base
    const sourceBranch = currentPR.sourceRefName;
    if (!sourceBranch) {
        throw new Error('Cannot determine source branch from current PR');
    }
    
    // Create branch name with GitSubmoduleUpdate prefix
    const sanitizedPath = sanitizeForBranchName(submodule.name);
    const version = submodule.latestTags.length > 0 ? submodule.latestTags[0] : submodule.latestCommitSha;
    const sanitizedVersion = sanitizeForBranchName(version);
    const branchName = `GitSubmoduleUpdate-${sanitizedPath}-${sanitizedVersion}`;
    
    console.log(`📝 Creating branch: ${branchName} for submodule: ${submodule.path}`);
    
    // Get the current branch to return to later
    const originalBranch = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
    const originalBranchName = originalBranch.trim();
    console.log(`💾 Current branch: ${originalBranchName} (will return here after update)`);
    
    try {
        // Check if branch already exists and find existing PR
        const existingPRId = await findPullRequest(git, branchName, azDoApi);
        if (existingPRId !== null) {
            return existingPRId;
        }
        
        // Create and checkout new branch
        await git.checkoutLocalBranch(branchName);
        
        // Update the specific submodule to remote
        await git.raw(['submodule', 'update', '--remote', submodule.path]);
        
        // Stage and commit the changes
        await git.add(`${submodule.path}`);
        
        // Build commit message with tags
        const currentCommitShort = submodule.currentCommitSha;
        const latestCommitShort = submodule.latestCommitSha;
        const currentTagsText = submodule.currentTags.length > 0 ? ` [${submodule.currentTags.join(', ')}]` : '';
        const latestTagsText = submodule.latestTags.length > 0 ? ` [${submodule.latestTags.join(', ')}]` : '';
        
        const commitMessage = `Update submodule ${submodule.path}\n\nUpdate from ${currentCommitShort}${currentTagsText} to ${latestCommitShort}${latestTagsText}`;
        await git.commit(commitMessage);
        
        // Push the branch
        await git.push('origin', branchName);
        console.log(`📤 Pushed branch: ${branchName}`);
        
        // Create the pull request with enhanced version information
        const title = `Update submodule ${submodule.path} to ${sanitizedVersion}`;
        
        // Use tag information from submodule object
        let currentCommitInfo = submodule.currentCommitSha;
        let latestCommitInfo = submodule.latestCommitSha;
        
        if (submodule.currentTags.length > 0) {
            currentCommitInfo = `${submodule.currentTags[0]} (${submodule.currentCommitSha})`;
        }
        
        if (submodule.latestTags.length > 0) {
            latestCommitInfo = `${submodule.latestTags[0]} (${submodule.latestCommitSha})`;
        }
        
        const description = `Automated update of submodule **[${submodule.path}](${submodule.url})**.` +
                           `  Review the release notes of the submodule to verify if any manual changes are required for the new submodule version.\n\n` +
                           `**Current:** \`${currentCommitInfo}\`\n` +
                           `**Latest:** \`${latestCommitInfo}\`\n` +
                           `**Branch:** \`${submodule.branch}\`\n` +
                           `This PR was automatically created to keep the submodule up to date.`;
        
        const reviewers = [];
        const createdBy = currentPR.createdBy?.id;
        if (createdBy) {
            reviewers.push({
                id: createdBy,
                isRequired: true
            });
        }
        
        const prRequest = {
            sourceRefName: `refs/heads/${branchName}`,
            targetRefName: sourceBranch,
            title: title,
            description: description,
            reviewers: reviewers
        };
        
        const pullRequest = await azDoApi.createPullRequest(prRequest);
        
        // Set auto-complete with delete source branch option
        if (createdBy) {
            try {
                await azDoApi.setAutoComplete(pullRequest.pullRequestId, createdBy, true);
                console.log(`✅ Auto-complete enabled for PR #${pullRequest.pullRequestId}`);
            } catch (autoCompleteError) {
                console.log(`⚠️  Warning: Could not set auto-complete for PR #${pullRequest.pullRequestId}: ${autoCompleteError instanceof Error ? autoCompleteError.message : String(autoCompleteError)}`);
            }
        }
        
        return pullRequest.pullRequestId;
        
    } catch (error) {
        // Error will be re-thrown after cleanup in finally block
        throw error;
    } finally {
        // Always ensure we return to the original branch
        try {
            console.log(`🔙 Returning to original branch: ${originalBranchName}`);
            await git.checkout(originalBranchName);
        } catch (checkoutError) {
            console.log(`⚠️  Warning: Could not return to original branch ${originalBranchName}: ${checkoutError instanceof Error ? checkoutError.message : String(checkoutError)}`);
            // If we can't checkout the original branch, try to cleanup the created branch
            try {
                await git.branch(['-D', branchName]);
                console.log(`🗑️  Cleaned up created branch: ${branchName}`);
            } catch (cleanupError) {
                console.log(`⚠️  Warning: Could not cleanup branch ${branchName}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
            }
        }
    }
    
}

function sanitizeForBranchName(input: string): string {
    // Remove or replace characters not allowed in Git branch names
    // Git branch names cannot contain: spaces, ~, ^, :, ?, *, [, \, .., @{, //
    return input
        .replace(/[\/\\:*?"<>|~^[\]@{}]/g, '-')  // Replace forbidden chars with dash
        .replace(/\s+/g, '-')                     // Replace spaces with dash
        .replace(/\.{2,}/g, '-')                  // Replace multiple dots with dash
        .replace(/-+/g, '-')                      // Replace multiple dashes with single dash
        .replace(/^-+|-+$/g, '');                  // Remove leading/trailing dashes
}

async function findPullRequest(
    git: SimpleGit,
    branchName: string,
    azDoApi: AzureDevOpsApi
): Promise<number | null> {
    try {
        await git.raw(['show-ref', '--verify', `refs/heads/${branchName}`]);
        console.log(`ℹ️  Branch ${branchName} already exists - checking for existing PR...`);
        
        // Look for existing open PR for this branch
        try {
            const existingPR = await azDoApi.findPullRequestBySourceBranch(`refs/heads/${branchName}`);
            if (existingPR) {
                console.log(`✅ Found existing PR #${existingPR.pullRequestId} for branch ${branchName}`);
                return existingPR.pullRequestId;
            } else {
                console.log(`⚠️  Branch ${branchName} exists but no open PR found - skipping creation`);
                return null;
            }
        } catch (prSearchError) {
            console.log(`⚠️  Could not search for existing PR: ${prSearchError instanceof Error ? prSearchError.message : String(prSearchError)}`);
            console.log(`ℹ️  Assuming PR already exists for branch ${branchName}, skipping creation`);
            return null;
        }
    } catch {
        // Branch doesn't exist
        return null;
    }
}

async function run(): Promise<void> {
    try {
        // Get task inputs
        const workingDirectory = tl.getPathInput('workingDirectory') || process.cwd();
        const gitmodulesPath = tl.getInput('gitmodulesPath') || '.gitmodules';
        const defaultBranch = tl.getInput('defaultBranch') || 'main';
        const failOnOutdated = tl.getBoolInput('failOnOutdated') || false;
        const addPullRequestComments = tl.getBoolInput('addPullRequestComments') ?? true;
        const createPullRequests = tl.getBoolInput('createPullRequests') ?? true;
        const suppressTagNames = tl.getInput('suppressTagNames') || 'NoSubmoduleCheck,NoBuild';
        tl.debug(`Task inputs - workingDirectory: ${workingDirectory}, gitmodulesPath: ${gitmodulesPath}, defaultBranch: ${defaultBranch}, failOnOutdated: ${failOnOutdated}, addPullRequestComments: ${addPullRequestComments}, createPullRequests: ${createPullRequests}, suppressTagNames: ${suppressTagNames}`);

        const checker = new GitSubmoduleChecker(workingDirectory, gitmodulesPath, defaultBranch, suppressTagNames);
        const submodules = await checker.checkSubmodules();

        // Create PRs for updates if enabled and in a pull request build
        let createdPullRequests: Map<string, number> = new Map();
        console.log(`🔄 Create Pull Requests for Updates: ${createPullRequests}`);
        if (createPullRequests) {
            try {
                createdPullRequests = await createPullRequestsForOutdatedSubmodules(submodules, workingDirectory);
            } catch (error) {
                tl.warning(`Failed to create PRs: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Add PR comments if enabled and in a pull request build
        console.log(``);
        console.log(`💬 Add Pull Request Comments: ${addPullRequestComments}`);
        if (addPullRequestComments) {
            try {
                const azDoApi = new AzureDevOpsApi();
                if (azDoApi.isPullRequest()) {
                    await addPullRequestCommentsForOutdatedSubmodules(submodules, azDoApi, createdPullRequests);
                } else {
                    console.log(`ℹ️  Build reason (${process.env.BUILD_REASON || 'unknown'}) indicates this is not a Pull Request - no PR to add comments to`);
                    tl.debug('Not running in a Pull Request build, skipping PR comments');
                }
            } catch (error) {
                tl.warning(`Failed to add PR comments: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Check if we should fail the task
        const needsUpdateCount = submodules.filter(r => r.needsUpdate).length;
        if (failOnOutdated && needsUpdateCount > 0) {
            tl.setResult(tl.TaskResult.Failed, `Task configured to fail when submodules are outdated. ${needsUpdateCount} submodule(s) need updating.`);
            return;
        }

        // Check for errors
        const errorCount = submodules.filter(r => r.error).length;
        if (errorCount > 0) {
            tl.setResult(tl.TaskResult.SucceededWithIssues, `Task completed with ${errorCount} error(s) while checking submodules.`);
            return;
        }

        tl.setResult(tl.TaskResult.Succeeded, 'Git submodule check completed successfully.');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        tl.setResult(tl.TaskResult.Failed, `Task failed: ${errorMessage}`);
    }
}

// Run the task
run();