# Git Submodule Updater

A powerful Azure DevOps pipeline task that automatically checks your git submodules and determines which ones need updating to their latest commits.

## 🚀 Features

- **Automated Submodule Analysis**: Parses your `.gitmodules` file and checks all configured submodules
- **Commit Comparison**: Compares current submodule commits with the latest commits on remote branches
- **Flexible Branch Support**: Check against any branch (main, master, develop, etc.)
- **Rich Output**: Detailed logging with clear status indicators and summary reports
- **Pipeline Integration**: Sets output variables for use in subsequent pipeline tasks
- **Error Handling**: Graceful handling of network issues and missing repositories
- **Configurable Behavior**: Optional task failure when submodules are outdated

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
    outputFormat: 'detailed'
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
    defaultBranch: 'main'
    outputFormat: 'detailed'

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
| `workingDirectory` | Directory containing the .gitmodules file | No | `$(System.DefaultWorkingDirectory)` |
| `gitmodulesPath` | Path to .gitmodules file relative to working directory | No | `.gitmodules` |
| `defaultBranch` | Default branch name to check for latest commits | No | `main` |
| `failOnOutdated` | Fail the task if submodules are outdated | No | `false` |
| `outputFormat` | Level of detail in output (detailed/summary) | No | `detailed` |

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
  📌 Current commit: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
  🏷️  Latest commit: x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0
  ⚠️  Status: NEEDS UPDATE

[2/3] Checking submodule: libs/utils
  📍 URL: https://github.com/myorg/utils-lib.git
  📌 Current commit: p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z3y2x1w0
  🏷️  Latest commit: p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z3y2x1w0
  ✅ Status: UP TO DATE

[3/3] Checking submodule: vendor/third-party
  📍 URL: https://github.com/external/library.git
  📌 Current commit: m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
  🏷️  Latest commit: m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
  ✅ Status: UP TO DATE

📊 SUMMARY
══════════════════════════════════════════════════
📦 Total submodules: 3
✅ Up to date: 2
⚠️  Need updating: 1
❌ Errors: 0

⚠️  SUBMODULES NEEDING UPDATES:
   • libs/common: a1b2c3d4 → x1y2z3a4
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