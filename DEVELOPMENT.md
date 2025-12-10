# Development Guide

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Azure DevOps organization for testing
- Git (for submodule testing)
- [TFX CLI](https://github.com/Microsoft/tfs-cli) for publishing

### Setup

```bash
# Clone the repository
git clone https://github.com/TimothyK/GitSubmoduleUpdater.git
cd GitSubmoduleUpdater

# Install dependencies
npm install

# Build the project
npm run build
```

## 🏗️ Project Structure

```
├── src/
│   └── index.ts           # Main task implementation
├── assets/                # Icons and screenshots
├── dist/                  # Compiled JavaScript (generated)
├── task.json             # Azure DevOps task manifest
├── vss-extension.json    # VS Marketplace extension manifest
├── package.json          # Node.js package configuration
└── tsconfig.json         # TypeScript configuration
```

## 🧪 Testing

Currently no automated tests are configured. Manual testing should be done using the debugging setup described below.

### Local Testing

You can test the task locally by setting environment variables:

```bash
# Build first
npm run build

# Set task inputs as environment variables
export INPUT_WORKINGDIRECTORY="/path/to/your/repo"
export INPUT_GITMODULESPATH=".gitmodules" 
export INPUT_DEFAULTBRANCH="main"
export INPUT_FAILONOUTDATED="false"

# Run the task
node dist/index.js
```

### Testing with a Sample Repository

Create a test repository with submodules:

```bash
# Create main repo
mkdir test-repo && cd test-repo
git init

# Add some submodules
git submodule add -b main https://github.com/some-org/lib1.git libs/lib1
git submodule add -b main https://github.com/some-org/lib2.git libs/lib2

# Commit the .gitmodules file
git add .
git commit -m "Add submodules"

# Test the task
export INPUT_WORKINGDIRECTORY="$(pwd)"
node /path/to/GitSubmoduleUpdater/dist/index.js
```

### Testing with Azure DevOps

To test the full functionality including PR comment creation, you need to test within an actual Azure DevOps environment:

#### Prerequisites

1. **Azure DevOps Organization**: Set up a test organization
2. **Test Repository**: Create a repository with submodules in Azure DevOps
3. **Personal Access Token**: Create a PAT with appropriate permissions

#### Setting Up Personal Access Token

1. Go to your Azure DevOps organization → User Settings → Personal Access Tokens
2. Create a new token with these scopes:
   - **Code (read)** - Required to read repository and PR information
   - **Code (write)** - Required to add PR comments
   - **Pull Request (read & write)** - Required for PR operations
3. Copy the token value (you won't see it again)

#### Required Environment Variables

When testing in Azure DevOps pipelines, ensure these environment variables are set:

```yaml
# In your azure-pipelines.yml test pipeline
- task: GitSubmoduleUpdater@1
  displayName: 'Test Git Submodules'
  inputs:
    addPullRequestComments: true
  env:
    # Optional: Explicit token (usually not needed due to automatic token detection)
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
    
    # For debugging/development only
    SYSTEM_DEBUG: true
    AGENT_VERBOSE: true
```

#### Testing PR Comment Functionality

1. **Create a Pull Request** in your test repository
2. **Ensure submodules are outdated** (commit older versions)
3. **Run the pipeline** on the PR branch
4. **Verify PR comments** are added for each outdated submodule

#### Manual Testing Environment Variables

For local debugging that simulates Azure DevOps environment:

```bash
# Required Azure DevOps context
export SYSTEM_TEAMFOUNDATIONSERVERURI="https://dev.azure.com/YourOrg/"
export SYSTEM_TEAMPROJECTID="YourProjectId"
export BUILD_REPOSITORY_NAME="YourRepoName"
export BUILD_REASON="PullRequest"
export SYSTEM_PULLREQUEST_PULLREQUESTID="123"

# Authentication - Choose ONE of the following:

# Option 1: Personal Access Token (for local development)
# Uses Basic authentication with base64 encoding
export MY_ACCESSTOKEN="your-personal-access-token-here"

# Option 2: System Access Token (Azure DevOps pipeline context)
# Uses Bearer authentication - typically provided by Azure DevOps automatically
export SYSTEM_ACCESSTOKEN="your-bearer-token-here"

# Task inputs
export INPUT_WORKINGDIRECTORY="/path/to/your/repo"
export INPUT_ADDPULLREQUESTCOMMENTS="true"
export INPUT_FAILONOUTDATED="false"

# Debug settings
export SYSTEM_DEBUG="true"
export AGENT_VERBOSE="true"
```

#### Authentication Methods Explained

The task supports multiple authentication methods with different token formats:

1. **Azure DevOps Service Connection Token** (Automatic)
   - **Format**: Bearer token
   - **Usage**: Automatically obtained in Azure DevOps pipelines
   - **Authentication**: `Authorization: Bearer <token>`

2. **Personal Access Token** (`MY_ACCESSTOKEN`)
   - **Format**: Personal Access Token from Azure DevOps
   - **Usage**: Local development and manual testing
   - **Authentication**: `Authorization: Basic <base64-encoded-credentials>`
   - **Encoding**: Base64 encoding of `:${token}`

3. **System Access Token** (`SYSTEM_ACCESSTOKEN`)
   - **Format**: Bearer token provided by Azure DevOps
   - **Usage**: Pipeline context when explicitly passed
   - **Authentication**: `Authorization: Bearer <token>`

#### Troubleshooting

- **403/401 Errors**: Check PAT permissions and expiration
- **PR Not Found**: Verify `SYSTEM_PULLREQUEST_PULLREQUESTID` is correct
- **No Comments Added**: Ensure `BUILD_REASON="PullRequest"` is set
- **Token Format Issues**: 
  - Use `MY_ACCESSTOKEN` for Personal Access Tokens (Basic auth)
  - Use `SYSTEM_ACCESSTOKEN` for Bearer tokens from Azure DevOps
- **Authentication Errors**: Check console output for specific error details

## 🔨 Build Process

### TypeScript Compilation

```bash
# One-time build
npm run build

# Watch mode for development
npm run watch

# Clean build artifacts
npm run clean
```

### Extension Packaging

```bash
# Package extension for distribution
npm run package

# This creates: TimothyK.git-submodule-updater-1.0.0.vsix
```

## 📦 Publishing
- **[Publishing Guide](PUBLISHING.md)** - Automated release and marketplace publishing setup

### Prerequisites

1. Install TFX CLI globally:
   ```bash
   npm install -g tfx-cli
   ```

2. Create a Personal Access Token in Azure DevOps with **Marketplace (Publish)** scope

3. Create a publisher account at [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)

### Publishing Steps

1. **Update Version Numbers** in:
   - `package.json` 
   - `task.json` (Major.Minor.Patch)
   - `vss-extension.json`

2. **Build and Test**:
   ```bash
   npm run clean
   npm run build

   ```

3. **Package Extension**:
   ```bash
   npm run package
   ```

4. **Publish to Marketplace**:
   ```bash
   # Using npm script
   npm run publish
   
   # Or manually with TFX CLI
   tfx extension publish --manifest-globs vss-extension.json --token YOUR_PAT_TOKEN
   ```

### Version Management

We follow semantic versioning:
- **Major**: Breaking changes to task inputs/outputs
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes, no API changes

## 🏗️ Architecture

### Core Classes

#### `GitSubmoduleChecker`
Main class that orchestrates the submodule checking process:

- `parseGitmodules()`: Parses the .gitmodules file
- `checkSubmodule()`: Analyzes individual submodule status 
- `getCurrentSubmoduleCommit()`: Gets commit referenced by main repo
- `getLatestRemoteCommit()`: Gets latest commit from remote
- `printSummary()`: Formats and displays results
- `setOutputVariables()`: Sets Azure DevOps pipeline variables

#### Data Structures

```typescript
interface SubmoduleInfo {
    name: string;           // Submodule name
    path: string;           // Submodule path
    url: string;            // Remote repository URL
    branch?: string;        // Branch to check (optional)
    currentCommit: string;  // Current commit in main repo
    latestCommit: string;   // Latest commit on remote
    needsUpdate: boolean;   // Whether update is needed
    error?: string;         // Error message if any
}
```

### Pipeline Integration

The task integrates with Azure DevOps through:

- **Task Library**: Uses `azure-pipelines-task-lib` for input/output
- **Environment Variables**: Reads inputs as `INPUT_*` variables
- **Logging**: Structured output with console.log and tl.debug
- **Variables**: Sets pipeline variables for subsequent tasks
- **Exit Codes**: Returns appropriate success/failure status

### Git Operations

The task uses two main git commands:

1. **`git ls-tree HEAD <submodule-path>`**: Get current submodule commit
2. **`git ls-remote <repo-url> refs/heads/<branch>`**: Get latest remote commit

These are executed using the `simple-git` library for reliable cross-platform operation.

## 🐛 Debugging

### Enable Debug Output

```bash
export SYSTEM_DEBUG="true"
node dist/index.js
```

### Common Issues

1. **"Cannot find .gitmodules"**:
   - Check working directory path
   - Verify .gitmodules file exists
   - Ensure correct relative path

2. **"Failed to get remote commit"**:
   - Check network connectivity  
   - Verify submodule URL is accessible
   - Confirm branch name exists

3. **"Permission denied"**:
   - Check git credentials
   - Verify repository access permissions
   - For private repos, ensure proper authentication

### Logging Levels

- `console.log()`: User-visible output
- `tl.debug()`: Debug information (only when SYSTEM_DEBUG=true)
- `tl.warning()`: Non-fatal issues
- `tl.error()`: Fatal errors

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for new functionality

7. Commit changes: `git commit -m 'Add amazing feature'`
8. Push to branch: `git push origin feature/amazing-feature`
9. Create a Pull Request

### Code Style

- Use TypeScript strict mode

- Add JSDoc comments for public methods
- Write unit tests for new features
- Update documentation for user-facing changes

