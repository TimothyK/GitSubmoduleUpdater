import * as tl from 'azure-pipelines-task-lib/task';
import { GitSubmoduleChecker } from './GitSubmoduleChecker';
import { PullRequestCommentManager } from './PullRequestCommentManager';
import { PullRequestCreator } from './PullRequestCreator';

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

        // Check submodules
        const checker = new GitSubmoduleChecker(workingDirectory, gitmodulesPath, defaultBranch, suppressTagNames);
        const submodules = await checker.checkSubmodules();

        // Create PRs for updates if enabled and in a pull request build
        console.log(`🔄 Create Pull Requests for Updates: ${createPullRequests}`);
        if (createPullRequests) {
            try {
                const prCreator = new PullRequestCreator();
                await prCreator.createPullRequestsForOutdatedSubmodules(submodules, workingDirectory);
            } catch (error) {
                tl.warning(`Failed to create PRs: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Add PR comments if enabled and in a pull request build
        console.log(``);
        console.log(`💬 Add Pull Request Comments: ${addPullRequestComments}`);
        if (addPullRequestComments) {
            try {                
                const commentManager = new PullRequestCommentManager();
                await commentManager.addPullRequestCommentsForOutdatedSubmodules(submodules);
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