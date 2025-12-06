import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';

interface SubmoduleInfo {
    name: string;
    path: string;
    url: string;
    branch?: string;
    currentCommit: string;
    latestCommit: string;
    needsUpdate: boolean;
    error?: string;
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
    private outputFormat: string;
    private git: SimpleGit;

    constructor(workingDir: string, gitmodulesPath: string, defaultBranch: string = 'main', outputFormat: string = 'detailed') {
        this.workingDirectory = workingDir;
        this.gitmodulesPath = path.resolve(workingDir, gitmodulesPath);
        this.defaultBranch = defaultBranch;
        this.outputFormat = outputFormat;
        this.git = simpleGit(workingDir);
    }

    public async checkSubmodules(): Promise<SubmoduleInfo[]> {
        tl.debug(`Starting Git Submodule Updater analysis`);
        tl.debug(`Working directory: ${this.workingDirectory}`);
        tl.debug(`Gitmodules path: ${this.gitmodulesPath}`);
        tl.debug(`Default branch: ${this.defaultBranch}`);

        console.log('🔍 Git Submodule Updater - Starting Analysis');
        console.log(`📁 Working Directory: ${this.workingDirectory}`);
        console.log(`📄 .gitmodules Path: ${this.gitmodulesPath}`);
        console.log(`🌿 Default Branch: ${this.defaultBranch}`);
        console.log('');

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
                
                if (this.outputFormat === 'detailed') {
                    console.log(`  📍 URL: ${result.url}`);
                    console.log(`  📌 Current commit: ${result.currentCommit}`);
                    console.log(`  🏷️  Latest commit: ${result.latestCommit}`);
                    
                    if (result.needsUpdate) {
                        console.log('  ⚠️  Status: NEEDS UPDATE');
                    } else {
                        console.log('  ✅ Status: UP TO DATE');
                    }
                } else {
                    if (result.needsUpdate) {
                        console.log('  ⚠️  NEEDS UPDATE');
                    } else {
                        console.log('  ✅ UP TO DATE');
                    }
                }
            } catch (error) {
                const errorResult: SubmoduleInfo = {
                    name: submodule.path,
                    path: submodule.path,
                    url: submodule.url,
                    branch: submodule.branch,
                    currentCommit: 'unknown',
                    latestCommit: 'unknown',
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
        
        const needsUpdate = currentCommit !== latestCommit;
        
        return {
            name: path.basename(submodule.path),
            path: submodule.path,
            url: submodule.url,
            branch: branchToCheck,
            currentCommit,
            latestCommit,
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

    private printSummary(results: SubmoduleInfo[]): void {
        console.log('📊 SUMMARY');
        console.log('═'.repeat(50));
        
        const total = results.length;
        const upToDate = results.filter(r => !r.needsUpdate && !r.error).length;
        const needsUpdate = results.filter(r => r.needsUpdate).length;
        const errors = results.filter(r => r.error).length;
        
        console.log(`📦 Total submodules: ${total}`);
        console.log(`✅ Up to date: ${upToDate}`);
        console.log(`⚠️  Need updating: ${needsUpdate}`);
        console.log(`❌ Errors: ${errors}`);
        console.log('');
        
        if (needsUpdate > 0) {
            console.log('⚠️  SUBMODULES NEEDING UPDATES:');
            const outdatedSubmodules = results.filter(r => r.needsUpdate);
            for (const submodule of outdatedSubmodules) {
                const shortCurrent = submodule.currentCommit.substring(0, 8);
                const shortLatest = submodule.latestCommit.substring(0, 8);
                console.log(`   • ${submodule.path}: ${shortCurrent} → ${shortLatest}`);
            }
            console.log('');
        }
        
        if (errors > 0) {
            console.log('❌ SUBMODULES WITH ERRORS:');
            const errorSubmodules = results.filter(r => r.error);
            for (const submodule of errorSubmodules) {
                console.log(`   • ${submodule.path}: ${submodule.error}`);
            }
        }
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

async function run(): Promise<void> {
    try {
        // Get task inputs
        const workingDirectory = tl.getPathInput('workingDirectory') || process.cwd();
        const gitmodulesPath = tl.getInput('gitmodulesPath') || '.gitmodules';
        const defaultBranch = tl.getInput('defaultBranch') || 'main';
        const failOnOutdated = tl.getBoolInput('failOnOutdated') || false;
        const outputFormat = tl.getInput('outputFormat') || 'detailed';

        tl.debug(`Task inputs - workingDirectory: ${workingDirectory}, gitmodulesPath: ${gitmodulesPath}, defaultBranch: ${defaultBranch}, failOnOutdated: ${failOnOutdated}, outputFormat: ${outputFormat}`);

        const checker = new GitSubmoduleChecker(workingDirectory, gitmodulesPath, defaultBranch, outputFormat);
        const results = await checker.checkSubmodules();

        // Check if we should fail the task
        const needsUpdateCount = results.filter(r => r.needsUpdate).length;
        if (failOnOutdated && needsUpdateCount > 0) {
            tl.setResult(tl.TaskResult.Failed, `Task configured to fail when submodules are outdated. ${needsUpdateCount} submodule(s) need updating.`);
            return;
        }

        // Check for errors
        const errorCount = results.filter(r => r.error).length;
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