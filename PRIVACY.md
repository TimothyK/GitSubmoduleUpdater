# Privacy Policy - Git Submodule Updater

**Effective Date:** December 29, 2025  
**Last Updated:** December 29, 2025

## Overview

The Git Submodule Updater is an Azure DevOps pipeline extension that helps you manage and update git submodules in your repositories. We are committed to protecting your privacy and being transparent about our data practices.

## Data Collection

**We do not collect, store, or transmit any personal data or telemetry.**

This extension:
- ❌ Does **NOT** collect user analytics or telemetry
- ❌ Does **NOT** store personal information
- ❌ Does **NOT** send data to external third-party services
- ❌ Does **NOT** track user behavior or usage patterns

## Data Processing

### Local Operations
- All git operations are performed locally within your Azure DevOps pipeline environment
- Repository analysis happens entirely within your pipeline context
- No repository data leaves your Azure DevOps organization

### Azure DevOps API Usage
When enabled, this extension may use Azure DevOps REST APIs to:
- Create pull requests for submodule updates
- Add comments to existing pull requests
- Read pull request information and labels

**Important:** These API calls:
- Use your existing Azure DevOps authentication and permissions
- Only access repositories and pull requests you explicitly configure
- Operate entirely within your Azure DevOps organization
- Do not send data outside of your Azure DevOps environment

## Data Storage

- **No data is stored** by this extension
- All processing is done in real-time during pipeline execution
- No logs, cache files, or persistent data are maintained by the extension

## Third-Party Services

This extension **does not** integrate with or send data to any third-party services outside of:
- Azure DevOps APIs (when pull request features are enabled)
- Git repositories you configure (for submodule analysis)

## Your Rights and Control

You maintain full control over:
- Which repositories the extension analyzes
- Whether pull request features are enabled
- All Azure DevOps permissions and access controls
- Pipeline configuration and usage

## Security

- The extension operates with the minimum required permissions
- All operations respect your existing Azure DevOps security model
- No credentials or sensitive information is processed or stored

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above and published in new versions of the extension.

## Contact Information

For questions, concerns, or requests regarding this privacy policy:

- **GitHub Issues**: [https://github.com/TimothyK/GitSubmoduleUpdater/issues](https://github.com/TimothyK/GitSubmoduleUpdater/issues)
- **Repository**: [https://github.com/TimothyK/GitSubmoduleUpdater](https://github.com/TimothyK/GitSubmoduleUpdater)

## Compliance

This extension is designed to comply with:
- GDPR (General Data Protection Regulation)
- CCPA (California Consumer Privacy Act)
- Azure DevOps privacy and security standards

By using this extension, you acknowledge that you have read and understood this privacy policy.