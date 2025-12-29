import * as tl from 'azure-pipelines-task-lib';
import { AzureDevOpsApi } from './azureDevOpsApi';
import { SubmoduleInfo } from './SubmoduleInfo';

export class PullRequestCommentManager {

    public async addPullRequestCommentsForOutdatedSubmodules(submodules: SubmoduleInfo[], azDoApi: AzureDevOpsApi, createdPullRequests?: Map<string, number>): Promise<void> {
        const outdatedSubmodules = submodules.filter(r => r.needsUpdate);

        if (outdatedSubmodules.length === 0) {
            console.log('✅ No submodules need updating - no PR comments required');
            tl.debug('No outdated submodules found, no PR comments to add');
            return;
        }

        console.log(`💬 Adding PR comments for ${outdatedSubmodules.length} outdated submodule(s)...`);

        for (const submodule of outdatedSubmodules) {
            const commentContent = this.createPullRequestCommentContent(submodule, createdPullRequests);
            const added = await azDoApi.addPullRequestCommentIfNotExists(commentContent);

            if (added) {
                console.log(`  ✅ Added PR comment for ${submodule.path}`);
            } else {
                console.log(`  ℹ️ PR comment already exists for ${submodule.path}`);
            }
        }
    }

    private createPullRequestCommentContent(submodule: SubmoduleInfo, createdPullRequests?: Map<string, number>): string {

        let comment = `⚠ Submodule needs update:\n[${submodule.path}](${submodule.url}): ${submodule.currentDisplayVersion} → ${submodule.latestDisplayVersion}`;

        // Add PR link if a PR was created for this submodule
        if (createdPullRequests && createdPullRequests.has(submodule.path)) {
            const prId = createdPullRequests.get(submodule.path);
            comment += `\n\n🔄 **Update PR:** !${prId}`;
        }

        return comment;
    }

}
