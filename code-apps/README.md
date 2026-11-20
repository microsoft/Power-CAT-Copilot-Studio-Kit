# Code apps

This folder has the source code of the Power Apps code apps of the Copilot Agent Kit.

> **What is a code app?** A [Power Apps code app](https://learn.microsoft.com/power-apps/developer/code-apps/overview) is a web app that you build in a code editor, for example with React and TypeScript. It runs in Power Apps, and it can use Power Platform connectors.

## Available apps

| Folder | Package | App |
| --- | --- | --- |
| `makers` | `copilotstudiokitformakers` | Copilot Agent Kit for Makers |
| `admin` | `copilotstudiokitforadmins` | Copilot Agent Kit for Admins |

> [!NOTE]
> The old name of the kit is Copilot Studio Kit. The package names still use the old name.

The Copilot Agent Kit solution installs these apps. To install the kit, see [Installing the Copilot Agent Kit](../INSTALLATION_INSTRUCTIONS.md).

## Getting started

1. Open the folder of the app. See the table above.
2. Follow the `README.md` in that folder.

## Data collection

The apps send usage events to a cloud flow in your environment. For the details, and for the steps to turn off the data collection, see these sections:

- [Copilot Agent Kit for Makers: Data collection](makers/README.md#data-collection)
- [Copilot Agent Kit for Admins: Data collection](admin/README.md#data-collection)

## Contributing

To contribute to the code apps, see [Contribute to the code apps](../CONTRIBUTING.md#contribute-to-the-code-apps).
