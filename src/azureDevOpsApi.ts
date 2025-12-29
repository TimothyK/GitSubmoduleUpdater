import * as tl from 'azure-pipelines-task-lib/task';
import * as https from 'https';

export interface PullRequestComment {
    id: number;
    content: string;
    commentType: number;
}

export interface PullRequestThread {
    id: number;
    comments: PullRequestComment[];
    status: number;
}

export interface PullRequestCommentsResponse {
    value: PullRequestThread[];
    count: number;
}

export interface CreatePullRequestRequest {
    sourceRefName: string;
    targetRefName: string;
    title: string;
    description: string;
    reviewers?: PullRequestReviewer[];
}

export interface PullRequestReviewer {
    id: string;
    displayName?: string;
    uniqueName?: string;
}

export interface PullRequest {
    pullRequestId: number;
    title: string;
    description: string;
    sourceRefName: string;
    targetRefName: string;
    status: string;
    createdBy: {
        id: string;
        displayName: string;
        uniqueName: string;
    };
}

interface AzureDevOpsEnvironment {
    teamFoundationServerUri: string;
    teamProjectId: string;
    buildRepositoryName: string;
    buildReason: string;
    pullRequestId?: string;
    pullRequestSourceBranch?: string;
    pullRequestCreatedBy?: string;
    systemAccessToken?: string;
    myAccessToken?: string;
}

export class AzureDevOpsApi {
    private environment: AzureDevOpsEnvironment;

    constructor() {
        this.environment = {
            teamFoundationServerUri: process.env.SYSTEM_TEAMFOUNDATIONSERVERURI || '',
            teamProjectId: process.env.SYSTEM_TEAMPROJECTID || '',
            buildRepositoryName: process.env.BUILD_REPOSITORY_NAME || '',
            buildReason: process.env.BUILD_REASON || '',
            pullRequestId: process.env.SYSTEM_PULLREQUEST_PULLREQUESTID,
            pullRequestSourceBranch: process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH,
            pullRequestCreatedBy: process.env.SYSTEM_PULLREQUEST_CREATEDBY_ID,
            systemAccessToken: process.env.SYSTEM_ACCESSTOKEN,
            myAccessToken: tl.getInput('accessToken', false) || process.env.MY_ACCESSTOKEN
        };
    }

    private getAuthorizationHeaders(): { [key: string]: string } {
        // Try Azure DevOps task library token first (automatically available)
        let taskLibToken: string | null = null;
        try {
            taskLibToken = tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'AccessToken', false) || null;
        } catch (error) {
            // This will fail in local debug mode, which is expected
            tl.debug('Azure DevOps service connection token not available (likely running in debug mode)');
        }
        
        if (taskLibToken) {
            return { 'Authorization': `Bearer ${taskLibToken}` };
        } else if (this.environment.myAccessToken) {
            const pair = `:${this.environment.myAccessToken}`;
            const encodedCreds = Buffer.from(pair).toString('base64');
            return { 'Authorization': `Basic ${encodedCreds}` };
        } else if (this.environment.systemAccessToken) {
            return { 'Authorization': `Bearer ${this.environment.systemAccessToken}` };
        } else {
            throw new Error('No access token available for Azure DevOps API. Consider adding "SYSTEM_ACCESSTOKEN: $(System.AccessToken)" to your task environment variables.');
        }
    }

    private getApiBaseUrl(): string {
        return `${this.environment.teamFoundationServerUri}${this.environment.teamProjectId}/_apis`;
    }

    private async makeApiCall(queryString: string, method: string = 'GET', body?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const baseUrl = this.getApiBaseUrl();
            const url = baseUrl + queryString;
            const parsedUrl = new URL(url);
            
            const headers: { [key: string]: string } = {
                ...this.getAuthorizationHeaders(),
                'Content-Type': 'application/json'
            };

            if (body) {
                headers['Content-Length'] = Buffer.byteLength(body).toString();
            }

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: method,
                headers: headers
            };

            tl.debug(`${method} ${url}`);

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse JSON response: ${error}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (body) {
                req.write(body);
            }

            req.end();
        });
    }

    public isPullRequest(): boolean {
        return this.environment.buildReason === 'PullRequest' && !!this.environment.pullRequestId;
    }

    public async getPullRequestComments(): Promise<PullRequestCommentsResponse> {
        if (!this.environment.pullRequestId) {
            throw new Error('Pull Request ID not available');
        }

        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullRequests/${this.environment.pullRequestId}/threads?api-version=6.0`;
        try {
            return await this.makeApiCall(queryString);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get PR comments: ${errorMessage}`);
        }
    }

    public async addPullRequestComment(commentContent: string): Promise<void> {
        if (!this.environment.pullRequestId) {
            throw new Error('Pull Request ID not available');
        }

        const body = JSON.stringify({
            comments: [
                {
                    parentCommentId: 0,
                    content: commentContent,
                    commentType: 1
                }
            ],
            status: 1
        });

        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullRequests/${this.environment.pullRequestId}/threads?api-version=6.0`;
        try {
            await this.makeApiCall(queryString, 'POST', body);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to add PR comment: ${errorMessage}`);
        }
    }

    public async addPullRequestCommentIfNotExists(commentContent: string): Promise<boolean> {
        try {
            // Get existing comments
            tl.debug('Checking for existing PR comments...');
            const commentsResponse = await this.getPullRequestComments();
            
            // Check if comment already exists
            const hasComment = commentsResponse.value.some(thread => 
                thread.comments.some(comment => comment.content === commentContent)
            );

            if (hasComment) {
                tl.debug(`Comment already exists: ${commentContent.substring(0, 50)}...`);
                return false;
            }

            // Add the comment
            tl.debug('Adding new PR comment...');
            await this.addPullRequestComment(commentContent);
            tl.debug(`Added PR comment: ${commentContent.substring(0, 50)}...`);
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check for specific permission-related errors
            if (errorMessage.includes('403') || errorMessage.includes('Forbidden') || errorMessage.includes('Access Denied')) {
                console.error(`❌ Permission denied: Unable to access pull request comments. Please check your Azure DevOps Personal Access Token permissions.`);
                console.error(`Required permissions: Code (read) and Pull requests (read/write)`);
            } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                console.error(`❌ Authentication failed: Invalid or missing Azure DevOps Personal Access Token.`);
            } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
                console.error(`❌ Pull request not found: Unable to locate the pull request or repository.`);
            } else {
                console.error(`❌ Failed to manage PR comments: ${errorMessage}`);
            }
            
            tl.warning(`Failed to add PR comment: ${errorMessage}`);
            return false;
        }
    }

    public async getCurrentPullRequest(): Promise<PullRequest | null> {
        if (!this.environment.pullRequestId) {
            return null;
        }

        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullrequests/${this.environment.pullRequestId}?api-version=6.0`;
        
        try {
            return await this.makeApiCall(queryString, 'GET');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get current pull request: ${errorMessage}`);
        }
    }

    public async createPullRequest(request: CreatePullRequestRequest): Promise<PullRequest> {
        const body = JSON.stringify(request);
        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullrequests?api-version=6.0`;
        
        try {
            return await this.makeApiCall(queryString, 'POST', body);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create pull request: ${errorMessage}`);
        }
    }

    public async searchPullRequests(sourceBranch: string, targetBranch: string): Promise<PullRequest[]> {
        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullrequests?searchCriteria.sourceRefName=refs/heads/${sourceBranch}&searchCriteria.targetRefName=refs/heads/${targetBranch}&searchCriteria.status=active&api-version=6.0`;
        
        try {
            const response = await this.makeApiCall(queryString);
            return response.value || [];
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to search pull requests: ${errorMessage}`);
        }
    }

    public async findPullRequestBySourceBranch(sourceBranchRef: string): Promise<PullRequest | null> {
        // Ensure the sourceBranchRef is in the correct format
        const sourceRef = sourceBranchRef.startsWith('refs/heads/') ? sourceBranchRef : `refs/heads/${sourceBranchRef}`;
        
        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullrequests?searchCriteria.sourceRefName=${encodeURIComponent(sourceRef)}&api-version=6.0`;
        
        try {
            const response = await this.makeApiCall(queryString);
            const pullRequests = response.value || [];
            
            // Return the first open PR found for this source branch
            return pullRequests.length > 0 ? pullRequests[0] : null;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to find open pull request by source branch: ${errorMessage}`);
        }
    }

    public async setAutoComplete(pullRequestId: number, autoCompleteSetById: string, deleteSourceBranch: boolean = true): Promise<void> {
        const updateRequest = {
            autoCompleteSetBy: {
                id: autoCompleteSetById
            },
            completionOptions: {
                deleteSourceBranch: deleteSourceBranch,
                squashMerge: false,
                bypassPolicy: false,
                bypassReason: ''
            }
        };
        
        const body = JSON.stringify(updateRequest);
        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullrequests/${pullRequestId}?api-version=6.0`;
        
        try {
            await this.makeApiCall(queryString, 'PATCH', body);
            tl.debug(`Auto-complete set for PR #${pullRequestId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to set auto-complete for PR #${pullRequestId}: ${errorMessage}`);
        }
    }

    public async getCurrentPullRequestLabels(): Promise<Array<{id: string, name: string, active: boolean}>> {
        if (!this.environment.pullRequestId) {
            return [];
        }

        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullrequests/${this.environment.pullRequestId}/labels?api-version=6.0`;
        
        try {
            const response = await this.makeApiCall(queryString, 'GET');
            return response.value || [];
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            tl.debug(`Failed to get PR labels for PR #${this.environment.pullRequestId}: ${errorMessage}`);
            return [];
        }
    }
}