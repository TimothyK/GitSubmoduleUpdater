import * as tl from 'azure-pipelines-task-lib';
import simpleGit, { SimpleGit } from 'simple-git';
import { AzureDevOpsApi } from './azureDevOpsApi';
import { SubmoduleInfo } from './SubmoduleInfo';
import { debugLog } from './utils';

export class PullRequestCreator {

    public async createPullRequestsForOutdatedSubmodules(
        submodules: SubmoduleInfo[],
        workingDirectory: string
    ): Promise<void> {
        const outdatedSubmodules = submodules.filter(r => r.needsUpdate);

        if (outdatedSubmodules.length === 0) {
            console.log('ℹ️ All submodules are up to date - no PRs to create');
            return;
        }

        const azDoApi = new AzureDevOpsApi();
        if (!azDoApi.isPullRequest()) {
            const buildReason = process.env.BUILD_REASON || 'unknown';
            console.log(`ℹ️  Build reason (${buildReason}) indicates this is not a Pull Request - no PR creation needed`);
            debugLog('Not running in a Pull Request build context, skipping PR creation');
            return;
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
                const prId = await this.createOrFindPullRequestForSubmodule(submodule, azDoApi, workingDirectory, currentPR);
                if (prId) {
                    submodule.pullRequestId = prId;
                    console.log(`✅ Created or found PR #${prId} for submodule: ${submodule.path}`);
                }
            } catch (error) {
                console.log(`⚠️  Failed to create PR for ${submodule.path}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    private async createOrFindPullRequestForSubmodule(
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
        const sanitizedPath = this.sanitizeForBranchName(submodule.name);
        const version = submodule.latestTags.length > 0 ? submodule.latestTags[0] : submodule.latestCommitSha;
        const sanitizedVersion = this.sanitizeForBranchName(version);
        const branchName = `GitSubmoduleUpdate-${sanitizedPath}-${sanitizedVersion}`;

        console.log(`📝 Creating branch: ${branchName} for submodule: ${submodule.path}`);

        // Get the current branch to return to later
        const originalBranch = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
        const originalBranchName = originalBranch.trim();
        console.log(`💾 Current branch: ${originalBranchName} (will return here after update)`);

        try {
            // Check if branch already exists and find existing PR
            const existingPRId = await this.findPullRequest(git, branchName, azDoApi);
            if (existingPRId !== null) {
                return existingPRId;
            }

            // Create and checkout new branch
            await git.checkoutLocalBranch(branchName);

            // Update the specific submodule to remote
            await git.raw(['submodule', 'update', '--remote', submodule.path]);

            // Stage and commit the changes
            await git.add(`${submodule.path}`);
            const commitMessage = `Update submodule ${submodule.path}\n\nUpdate from ${submodule.currentDisplayVersion} to ${submodule.latestDisplayVersion}`;
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
            try {
                await azDoApi.setAutoComplete(pullRequest.pullRequestId, true);
                console.log(`✅ Auto-complete enabled for PR #${pullRequest.pullRequestId}`);
            } catch (autoCompleteError) {
                console.log(`⚠️  Warning: Could not set auto-complete for PR #${pullRequest.pullRequestId}: ${autoCompleteError instanceof Error ? autoCompleteError.message : String(autoCompleteError)}`);
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

    private sanitizeForBranchName(input: string): string {
        // Remove or replace characters not allowed in Git branch names
        // Git branch names cannot contain: spaces, ~, ^, :, ?, *, [, \, .., @{, //
        return input
            .replace(/[\/\\:*?"<>|~^[\]@{}]/g, '-') // Replace forbidden chars with dash
            .replace(/\s+/g, '-') // Replace spaces with dash
            .replace(/\.{2,}/g, '-') // Replace multiple dots with dash
            .replace(/-+/g, '-') // Replace multiple dashes with single dash
            .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
    }

    private async findPullRequest(
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
}
