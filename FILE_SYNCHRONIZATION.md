## SharePoint synchronization

SharePoint synchronization allows makers to configure periodical selective content synchronization from SharePoint locations to custom agent knowledge base as files.

Benefits of using SharePoint synchronization (compared to using SharePoint site as knowledge source):
- Support for additional file types
- Support for larger files (up to 512MB)
- Lower latency in responses
- Indexing of non-text elements in PDFs

Please see [agent configuration](./CONFIGURE_COPILOTS.md) for more details and how to configure SharePoint synchronization. SharePoint synchronization is automatically performed daily and it can be run on-demand by selecting "**Sync Files**" from the agent configuration.

You can do a dry run validation of your configuration by pressing "Validate Connection".

Read more on how to configure agent for [SharePoint synchronization](./CONFIGURE_COPILOTS.md#configure-a-new-agent-for-file-synchronization)

## Technical Details

### Canvas App

| App | Description |
|---|---|
| Validate SharePoint Connection (`cat_validatesharepointconnection`) | Validates the SharePoint connection and site configuration before running a full synchronization |

### Cloud Flows

| Flow | Trigger | Description |
|---|---|---|
| SharePoint Synchronization \| On Demand | Manual | Triggers an on-demand file synchronization for a selected agent |
| SharePoint Synchronization \| Scheduler | Scheduled (daily) | Runs file synchronization automatically on a daily schedule |
| SharePoint Synchronization \| Synchronize files to Agent (Child) | Child flow | Performs the actual file synchronization logic for a given agent configuration |
| SharePoint Synchronization \| Validate Connection On Demand | Manual | Validates the SharePoint connection and configuration without synchronizing files |

### Connection References

| Connection Reference | Connector | Required |
|---|---|---|
| Copilot Studio Kit - Dataverse | Microsoft Dataverse | Yes |
| Copilot Studio Kit - SharePoint | SharePoint (`shared_sharepointonline`) | Yes |

### Environment Variables

| Display Name | Schema Name | Description |
|---|---|---|
| Instance Url | `cat_InstanceUrl` | Dataverse environment URL, required for file sync API calls |

### Dataverse Tables

| Display Name | Schema Name | Notes |
|---|---|---|
| File Indexer Configuration | `cat_CopilotFileIndexerConfiguration` | Stores SharePoint synchronization configuration per agent |
| Agent Configuration | `cat_CopilotConfiguration` | Shared table used across kit features |

### DLP Considerations

The following connectors must be in the same DLP group for file synchronization to function:

- **Microsoft Dataverse**
- **SharePoint**

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
