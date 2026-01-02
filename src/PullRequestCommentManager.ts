import * as tl from 'azure-pipelines-task-lib';
import { AzureDevOpsApi } from './azureDevOpsApi';
import { SubmoduleInfo } from './SubmoduleInfo';
import { debugLog } from './utils';

export class PullRequestCommentManager {

    public async addPullRequestCommentsForOutdatedSubmodules(submodules: SubmoduleInfo[]): Promise<void> {
        
        const azDoApi = new AzureDevOpsApi();
        if (!azDoApi.isPullRequest()) {
            console.log(`ℹ️  Build reason (${process.env.BUILD_REASON || 'unknown'}) indicates this is not a Pull Request - no PR to add comments to`);
            debugLog('Not running in a Pull Request build, skipping PR comments');            
            return;
        }

        const outdatedSubmodules = submodules.filter(r => r.needsUpdate);

        if (outdatedSubmodules.length === 0) {
            console.log('✅ No submodules need updating - no PR comments required');
            debugLog('No outdated submodules found, no PR comments to add');
            return;
        }

        console.log(`💬 Adding PR comments for ${outdatedSubmodules.length} outdated submodule(s)...`);

        for (const submodule of outdatedSubmodules) {
            const commentContent = this.createPullRequestCommentContent(submodule);
            const added = await azDoApi.addPullRequestCommentIfNotExists(commentContent);

            if (added) {
                console.log(`  ✅ Added PR comment for ${submodule.path}`);
            } else {
                console.log(`  ℹ️ PR comment already exists for ${submodule.path}`);
            }
        }
    }

    private createPullRequestCommentContent(submodule: SubmoduleInfo): string {

        let comment = `⚠ Submodule needs update:\n[${submodule.path}](${submodule.url}): ${submodule.currentDisplayVersion} → ${submodule.latestDisplayVersion}`;

        // Add PR link if a PR was created for this submodule
        if (submodule.pullRequestId) {
            comment += `\n\n🔄 **Update PR:** !${submodule.pullRequestId}`;
        }

        return comment;
    }

}
