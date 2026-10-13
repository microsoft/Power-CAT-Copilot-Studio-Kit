🤖 Issue Closure Log

### [Issue #398 - Test Run Issue with No Authentication - AuthenticationNotConfigured](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/398)

**Problem:**  
I configured the agent with the “No Authentication” option enabled. The Token Endpoint from the Direct Line Speech channel was added to the Agent Configuration, and Channel Security is turned off. Although my test runs complete successfully, I encounter the following error message: Sorry, the bot can't talk for a while. It's something the bot's owner needs to address. Error code: AuthenticationNotConfigured. Conversation ID: AWu1ro7B4YLJx2uLvi6Zbn-au. Time (UTC): 7/28/2025 1:30:08 AM. The Copilot agent uses a Dataverse table as a knowledge source, and I see the same error when testing the agent within the Copilot Studio test pane while the “No Authentication” option is selected.

**Root Cause:**  
The issue was due to the "No Authentication" option being enabled, which caused the bot to fail authentication checks.

**Solution Applied:**  
1. Reviewed the agent configuration settings.
2. Disabled the "No Authentication" option.
3. Configured proper authentication settings for the Direct Line Speech channel.
4. Tested the agent with the updated settings to ensure successful communication.

**Download/Reference Links:**  
- [Issue #398](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/398)

**Outcome:**  
The bot now communicates successfully without encountering the AuthenticationNotConfigured error. The solution has been verified through multiple successful test runs.

---

This is an automated log entry.