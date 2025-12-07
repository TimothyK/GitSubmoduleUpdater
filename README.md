# Git Submodule Updater for Azure DevOps

[![Build Status](https://dev.azure.com/timothyk/GitSubmoduleUpdater/_apis/build/status/GitSubmoduleUpdater-CI?branchName=main)](https://dev.azure.com/timothyk/GitSubmoduleUpdater/_build/latest?definitionId=1&branchName=main)
[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version/TimothyK.git-submodule-updater.svg)](https://marketplace.visualstudio.com/items?itemName=TimothyK.git-submodule-updater)

An Azure DevOps pipeline task that automatically checks your git submodules and determines which ones need updating to their latest commits.

## 🚀 Features

- **Automated Submodule Analysis**: Parses `.gitmodules` and checks all configured submodules
- **Smart Commit Comparison**: Compares current commits with latest remote commits
- **Flexible Branch Support**: Check against any branch (main, master, develop, etc.)  
- **Rich Pipeline Integration**: Sets output variables for conditional pipeline steps
- **Detailed Logging**: Clear status indicators and comprehensive summary reports
- **Error Resilience**: Graceful handling of network issues and repository problems

## 📋 Quick Start

Add to your `azure-pipelines.yml`:

```yaml
steps:
- task: GitSubmoduleUpdater@1
  displayName: 'Check Git Submodules'
  inputs:
    defaultBranch: 'main'
```

## 📖 Documentation

- **[Overview](overview.md)** - Comprehensive features and usage guide
- **[Development Guide](DEVELOPMENT.md)** - Setup, testing, and contribution instructions
- **[Examples](examples/)** - Real-world pipeline examples

## 🏃‍♂️ Example Pipeline

```yaml
trigger:
- main

pool:
  vmImage: 'ubuntu-latest'

steps:
- checkout: self
  submodules: true

- task: GitSubmoduleUpdater@1
  displayName: 'Check Submodules'
  inputs:
    workingDirectory: '$(System.DefaultWorkingDirectory)'
    defaultBranch: 'main'
    failOnOutdated: false

- script: |
    echo "📊 Submodule Status:"
    echo "Total: $(SubmodulesTotal)"
    echo "Up to date: $(SubmodulesUpToDate)" 
    echo "Need updating: $(SubmodulesNeedingUpdate)"
    echo "Outdated: $(SubmodulesNeedingUpdateList)"
  displayName: 'Display Results'

- script: |
    echo "🔄 Updating submodules..."
    git submodule update --remote --merge
  displayName: 'Update Submodules'
  condition: gt(variables['SubmodulesNeedingUpdate'], 0)
```

## 🎯 Task Outputs

The task provides these pipeline variables:

- `SubmodulesTotal` - Total submodules found
- `SubmodulesUpToDate` - Count of up-to-date submodules  
- `SubmodulesNeedingUpdate` - Count of outdated submodules
- `SubmodulesNeedingUpdateList` - Comma-separated list of outdated paths

## 🔧 Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `workingDirectory` | Repository root directory | `$(System.DefaultWorkingDirectory)` |
| `gitmodulesPath` | Path to .gitmodules file | `.gitmodules` |
| `defaultBranch` | Branch to check for latest commits | `main` |
| `failOnOutdated` | Fail task if submodules are outdated | `false` |


## 🛠️ Development

```bash
# Setup
npm install
npm run build

# Testing  
npm test
npm run lint

# Publishing
npm run package
npm run publish
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development instructions.

## 📊 Sample Output

```
🔍 Git Submodule Updater - Starting Analysis
📁 Working Directory: /workspace
📄 .gitmodules Path: /workspace/.gitmodules
🌿 Default Branch: main

📦 Found 2 submodule(s) configured in .gitmodules

[1/2] Checking submodule: libs/common
  📍 URL: https://github.com/myorg/common.git
  📌 Current commit: a1b2c3d4 (v1.5.2)
  🏷️  Latest commit: x1y2z3a4 (v2.0.0, v2.0.0-rc1)
  ⚠️  Status: NEEDS UPDATE

[2/2] Checking submodule: libs/utils  
  📍 URL: https://github.com/myorg/utils.git
  📌 Current commit: m3n4o5p6 (v3.1.0, v3.0.5 +2 more)
  🏷️  Latest commit: m3n4o5p6 (v3.1.0, v3.0.5 +2 more)
  ✅ Status: UP TO DATE

📊 SUMMARY
══════════════════════════════════════════════════
📦 Total submodules: 2
✅ Up to date: 1  
⚠️  Need updating: 1
❌ Errors: 0

⚠️  SUBMODULES NEEDING UPDATES:
   • libs/common: a1b2c3d4 (v1.5.2) → x1y2z3a4 (v2.0.0, v2.0.0-rc1)
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📝 [Report Issues](https://github.com/TimothyK/GitSubmoduleUpdater/issues)
- 💡 [Request Features](https://github.com/TimothyK/GitSubmoduleUpdater/issues/new)
- 📚 [View Documentation](https://github.com/TimothyK/GitSubmoduleUpdater/wiki)
