# Git Submodule Updater

A powerful Azure DevOps pipeline task that automatically checks your git submodules and determines which ones need updating to their latest commits.

## 🚀 Features

- **Automated Submodule Analysis**: Parses your `.gitmodules` file and checks all configured submodules
  - **Commit Comparison**: Compares current submodule commits with the latest commits on remote branches
  - **Configurable Behavior**: Optional input to fail the build if submodules are outdated
  - **Pipeline Integration**: Sets output variables for use in subsequent pipeline tasks
  - **Flexible Branch Support**: If the submodule branch is not given in the `.gitmodules` file, the `main` branch is assumed.  But this can be overridden.
- **Pull Request Integration**: Automatically adds comments to PRs highlighting outdated submodules
  - **Hyperlinks**: The PR Comment has a hyperlink to the submodule.  Its release notes can be reviewed to check for breaking changes in the update.
- **Automatic Pull Request Creation**: Creates PRs to update outdated submodules
  - **Smart Branch Management**: Creates branches with format `{source-branch}.build/Pipeline-{submodule-path}-{commit}`
  - **Automated Updates**: Updates submodules to latest remote commits and creates commits
  - **Intelligent Targeting**: Targets the current PR's source branch and adds original author as reviewer
  - **Linked Comments**: PR comments include links to created update PRs
- **Core Features**
  - **Rich Output**: Detailed logging with clear status indicators and summary reports
  - **Error Handling**: Graceful handling of network issues and missing repositories

## 📋 Usage

Add the Git Submodule Updater task to your `azure-pipelines.yml`:

```yaml
steps:
- task: GitSubmoduleUpdater@1
  displayName: 'Check Git Submodules'
  inputs:
    workingDirectory: '$(System.DefaultWorkingDirectory)'
    gitmodulesPath: '.gitmodules'
    defaultBranch: 'main'
    failOnOutdated: false
    addPullRequestComments: true
    createPullRequests: true
```

### Complete Example with Conditional Updates

```yaml
steps:
# Checkout with submodules
- checkout: self
  submodules: true

# Check submodule status
- task: GitSubmoduleUpdater@1
  displayName: 'Check Git Submodules'
  inputs:
    failOnOutdated: false
    addPullRequestComments: true

# Display results
- script: |
    echo "Total submodules: $(SubmodulesTotal)"
    echo "Up to date: $(SubmodulesUpToDate)"
    echo "Need updating: $(SubmodulesNeedingUpdate)"
    echo "Outdated submodules: $(SubmodulesNeedingUpdateList)"
  displayName: 'Show Submodule Status'

# Conditionally update outdated submodules
- script: |
    echo "Updating outdated submodules..."
    git submodule update --remote --merge
  displayName: 'Update Outdated Submodules'
  condition: gt(variables['SubmodulesNeedingUpdate'], 0)
```

## ⚙️ Task Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|----------|
| `failOnOutdated` | Fail the task if submodules are outdated | No | `false` |
| `addPullRequestComments` | Add comments to pull requests for each outdated submodule | No | `true` |
| `createPullRequests` | Automatically create PRs to update outdated submodules | No | `true` |
| `workingDirectory` | Directory containing the .gitmodules file | No | `$(System.DefaultWorkingDirectory)` |
| `defaultBranch` | Default branch name to check for latest commits on submodule repos | No | `main` |
| `gitmodulesPath` | Path to .gitmodules file relative to working directory | No | `.gitmodules` |


## 📊 Output Variables

The task sets these variables for use in subsequent tasks:

- `SubmodulesTotal` - Total number of submodules found
- `SubmodulesUpToDate` - Number of submodules that are up to date  
- `SubmodulesNeedingUpdate` - Number of submodules that need updating
- `SubmodulesNeedingUpdateList` - Comma-separated list of outdated submodule paths

## 🔍 Sample Output

```
🔍 Git Submodule Updater - Starting Analysis
📁 Working Directory: D:\a\1\s
📄 .gitmodules Path: D:\a\1\s\.gitmodules  
🌿 Default Branch: main

📦 Found 3 submodule(s) configured in .gitmodules

[1/3] Checking submodule: libs/common
  📍 URL: https://github.com/myorg/common-lib.git
  📌 Current commit: a1b2c3d4 (v1.8.5)
  🏷️  Latest commit: x1y2z3a4 (v2.1.0, v2.0.8)
  ⚠️  Status: NEEDS UPDATE

[2/3] Checking submodule: libs/utils
  📍 URL: https://github.com/myorg/utils-lib.git
  📌 Current commit: p9o8n7m6 (v4.2.1, v4.2.0 +1 more)
  🏷️  Latest commit: p9o8n7m6 (v4.2.1, v4.2.0 +1 more)
  ✅ Status: UP TO DATE

[3/3] Checking submodule: vendor/third-party
  📍 URL: https://github.com/external/library.git
  📌 Current commit: m3n4o5p6 (v0.9.12)
  🏷️  Latest commit: m3n4o5p6 (v0.9.12)
  ✅ Status: UP TO DATE

📊 SUMMARY
══════════════════════════════════════════════════
📦 Total submodules: 3
✅ Up to date: 2
⚠️  Need updating: 1
❌ Errors: 0

⚠️  SUBMODULES NEEDING UPDATES:
   • libs/common: a1b2c3d4 (v1.8.5) → x1y2z3a4 (v2.1.0, v2.0.8)
══════════════════════════════════════════════════

💬 Add Pull Request Comments: true
💬 Adding PR comments for 1 outdated submodule(s)...
  ✅ Added PR comment for libs/common
```

## 🛠️ How It Works

1. **Parse .gitmodules**: Reads your `.gitmodules` file to discover configured submodules
2. **Get Current State**: Uses `git ls-tree` to find the commit currently referenced by your main repository
3. **Check Remote**: Uses `git ls-remote` to find the latest commit on the specified branch of each submodule
4. **Compare & Report**: Compares commits and provides detailed output with update recommendations

## 🔧 Requirements

- Azure DevOps Pipelines
- Git repository with submodules configured in `.gitmodules`
- Network access to submodule repositories
- Agent with Git installed (standard on Microsoft-hosted agents)

## 🤝 Support

If you encounter issues or have feature requests:

- 📋 [Report an Issue](https://github.com/TimothyK/GitSubmoduleUpdater/issues)
- 💡 [Request a Feature](https://github.com/TimothyK/GitSubmoduleUpdater/issues/new)
- 📖 [View Documentation](https://github.com/TimothyK/GitSubmoduleUpdater/blob/main/README.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/TimothyK/GitSubmoduleUpdater/blob/main/LICENSE) file for details.