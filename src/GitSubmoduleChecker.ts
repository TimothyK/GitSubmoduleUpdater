import * as tl from 'azure-pipelines-task-lib';
import * as fs from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { AzureDevOpsApi } from './azureDevOpsApi';
import { SubmoduleInfo } from './SubmoduleInfo';

export class GitSubmoduleChecker {
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

                        const suppressTag = this.suppressTagNames.find(suppressTag => prTagNames.some(prTag => prTag.toLowerCase() === suppressTag.toLowerCase())
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
export interface GitmodulesEntry {
    path: string;
    url: string;
    branch?: string;
}

