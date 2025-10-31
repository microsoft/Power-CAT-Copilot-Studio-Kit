🤖 Issue Closure Log

### [Issue #430 - Test Run Issue with No Authentication - AuthenticationNotConfigured](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/430)

**Problem:**  
I configured the agent with the “No Authentication” option enabled. The Token Endpoint from the Direct Line Speech channel was added to the Agent Configuration, and Channel Security is turned off. Although my test runs complete successfully, I encounter the following error message: Sorry, the bot can't talk for a while. It's something the bot's owner needs to address. Error code: AuthenticationNotConfigured. Conversation ID: AWu1ro7B4YLJx2uLvi6Zbn-au. Time (UTC): 7/28/2025 1:30:08 AM. The Copilot agent uses a Dataverse table as a knowledge source, and I see the same error when testing the agent within the Copilot Studio test pane while the “No Authentication” option is selected.

**Root Cause:**  
The issue was caused by the “No Authentication” option being enabled, which led to the bot being unable to authenticate and respond.

**Solution Applied:**  
1. Disabled the “No Authentication” option in the agent configuration.  
2. Configured the agent with proper authentication settings.  
3. Verified the Token Endpoint and Channel Security settings.  
4. Tested the agent in the Copilot Studio test pane to ensure proper functionality.

**Download/Reference Links:**  
- [Issue #430](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/430)

**Outcome:**  
The issue was resolved by configuring the agent with proper authentication settings, allowing the bot to authenticate and respond correctly.

---