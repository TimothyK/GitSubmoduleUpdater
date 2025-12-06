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

# Run tests
npm test

# Lint the code
npm run lint
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
├── tsconfig.json         # TypeScript configuration
├── jest.config.js        # Test configuration
└── .eslintrc.js          # Linting configuration
```

## 🧪 Testing

### Unit Tests

```bash
npm test
```

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
export INPUT_OUTPUTFORMAT="detailed"

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
git submodule add https://github.com/some-org/lib1.git libs/lib1
git submodule add https://github.com/some-org/lib2.git libs/lib2

# Commit the .gitmodules file
git add .
git commit -m "Add submodules"

# Test the task
export INPUT_WORKINGDIRECTORY="$(pwd)"
node /path/to/GitSubmoduleUpdater/dist/index.js
```

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
   npm test
   npm run lint
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
5. Run the test suite: `npm test`
6. Lint your code: `npm run lint`
7. Commit changes: `git commit -m 'Add amazing feature'`
8. Push to branch: `git push origin feature/amazing-feature`
9. Create a Pull Request

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Add JSDoc comments for public methods
- Write unit tests for new features
- Update documentation for user-facing changes

## 📋 TODO

- [ ] Add support for private repositories with authentication
- [ ] Implement caching for remote commit lookups
- [ ] Add option to check specific submodules only
- [ ] Support for different authentication methods
- [ ] Integration tests with real repositories
- [ ] Performance optimization for large numbers of submodules