# Automated Publishing Setup

This document explains how to set up automated publishing for the Git Submodule Updater extension.

## Overview

The project includes two GitHub Actions workflows:

1. **CI Build** (`.github/workflows/ci.yml`) - Runs on every push/PR
2. **Release and Publish** (`.github/workflows/release.yml`) - Runs when version tags are created

## Version Management Strategy

### Automatic Versioning (CI Builds)
- CI builds automatically increment the patch version based on the latest Git tag
- If no tags exist, starts from `0.0.1`
- Example: Latest tag `v1.2.3` → CI builds use `1.2.4`

### Release Versioning (Manual)
- Releases use exact version from Git tags
- Tag format: `v1.2.3` (with 'v' prefix)
- The workflow extracts version from tag and updates manifests

## Setup Instructions

### 1. Configure Azure DevOps Personal Access Token

1. **Create Personal Access Token in Azure DevOps:**
   - Go to https://dev.azure.com/
   - Click on your profile → Personal Access Tokens
   - Click "New Token"
   - Configure:
     - **Name**: "Visual Studio Marketplace Publishing"
     - **Expiration**: Set appropriate duration (recommend 1 year)
     - **Scopes**: Select "Marketplace" → "Manage"
   - Copy the generated token (you won't see it again!)

2. **Add Token to GitHub Repository Secrets:**
   - Go to your GitHub repository
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - **Name**: `AZURE_DEVOPS_EXT_PAT`
   - **Secret**: Paste your Personal Access Token
   - Click "Add secret"

### 2. Publishing a Release

#### Option A: Manual Tag Creation
```bash
# Create and push a version tag
git tag v1.2.3
git push origin v1.2.3
```

#### Option B: GitHub UI Release
1. Go to your repository on GitHub
2. Click "Releases" → "Create a new release"
3. Click "Choose a tag" → Type new tag (e.g., `v1.2.3`)
4. Fill in release title and description
5. Click "Publish release"

### 3. Workflow Behavior

#### CI Build Workflow
- **Triggers**: Push to `main`/`develop`, Pull Requests
- **Actions**:
  - Calculates next patch version
  - Updates version in manifests (temporarily)
  - Builds and packages extension
  - Uploads artifacts for testing
- **Does NOT**: Publish to marketplace

#### Release Workflow
- **Triggers**: When version tags are pushed (e.g., `v1.2.3`)
- **Actions**:
  - Extracts version from Git tag
  - Updates manifests with exact version
  - Builds and packages extension
  - Publishes to Visual Studio Marketplace
  - Creates GitHub release with artifacts

## Version Number Format

The extension uses semantic versioning:
- **Major.Minor.Patch** (e.g., `1.2.3`)
- **Major**: Breaking changes
- **Minor**: New features, backwards compatible
- **Patch**: Bug fixes, backwards compatible

## Troubleshooting

### Release Workflow Fails

1. **"AZURE_DEVOPS_EXT_PAT secret not set"**
   - Verify the secret is added to repository settings
   - Check the secret name matches exactly: `AZURE_DEVOPS_EXT_PAT`

2. **"Extension validation failed"**
   - Check `vss-extension.json` and `task.json` format
   - Ensure all required files are included

3. **"Version already exists"**
   - The version has already been published
   - Use a new, higher version number

### Manual Publishing (Backup)

If automated publishing fails, you can publish manually:

```bash
# Build the extension
npm run build
npm run package

# Publish to marketplace
npx tfx extension publish --token YOUR_PERSONAL_ACCESS_TOKEN
```

## Security Notes

- **Never commit Personal Access Tokens** to the repository
- **Use GitHub Secrets** for sensitive information
- **Limit PAT scope** to only Marketplace management
- **Set reasonable expiration** on Personal Access Tokens
- **Rotate tokens regularly** for security

## Monitoring

- Check the "Actions" tab in your GitHub repository for workflow status
- Failed workflows will send notifications to repository watchers
- Successful releases will appear in:
  - GitHub Releases page
  - Visual Studio Marketplace
  - Azure DevOps Extensions