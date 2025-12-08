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

interface AzureDevOpsEnvironment {
    teamFoundationServerUri: string;
    teamProjectId: string;
    buildRepositoryName: string;
    buildReason: string;
    pullRequestId?: string;
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
            systemAccessToken: process.env.SYSTEM_ACCESSTOKEN,
            myAccessToken: process.env.MY_ACCESSTOKEN
        };
    }

    private getAuthorizationHeaders(): { [key: string]: string } {
        if (this.environment.myAccessToken) {
            const pair = `:${this.environment.myAccessToken}`;
            const encodedCreds = Buffer.from(pair).toString('base64');
            return { 'Authorization': `Basic ${encodedCreds}` };
        } else if (this.environment.systemAccessToken) {
            return { 'Authorization': `Bearer ${this.environment.systemAccessToken}` };
        } else {
            throw new Error('No access token available for Azure DevOps API');
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
        return this.environment.buildReason === 'PullRequest';
    }

    public async getPullRequestComments(): Promise<PullRequestCommentsResponse> {
        if (!this.environment.pullRequestId) {
            throw new Error('Pull Request ID not available');
        }

        const queryString = `/git/repositories/${this.environment.buildRepositoryName}/pullRequests/${this.environment.pullRequestId}/threads?api-version=6.0`;
        return await this.makeApiCall(queryString);
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
        await this.makeApiCall(queryString, 'POST', body);
    }

    public async addPullRequestCommentIfNotExists(commentContent: string): Promise<boolean> {
        try {
            // Get existing comments
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
            await this.addPullRequestComment(commentContent);
            tl.debug(`Added PR comment: ${commentContent.substring(0, 50)}...`);
            return true;
        } catch (error) {
            tl.warning(`Failed to add PR comment: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
}