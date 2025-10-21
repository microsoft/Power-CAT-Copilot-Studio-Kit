### 🤖 Issue Closure Log

### [Issue #402 - Limited access in Copilot Studio Kit despite correct roles](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/402)

**Problem:**  
I currently only have access to a single screen in Copilot Studio Kit, which includes the Features Setup Wizard, Configure Agent, and Test Runs History. However, my account has been assigned the following roles: Copilot Kit Studio - Administrator, Copilot Kit Studio - Configurator, Copilot Kit Studio - Tester/KPI Viewer. What am I missing to have access to all the features of the Kit?

**Root Cause:**  
The issue was due to additional requirements beyond role assignment, such as Data Loss Prevention (DLP) policies, environment type, licensing, and flow activation.

**Solution Applied:**  
1. **Review Data Loss Prevention (DLP) Policies:**  
   - Ensure all required connectors (Dataverse, SharePoint, Power Platform as Admin, Office 365 Outlook, Microsoft Entra ID, Power Apps for Makers) are allowed in your environment’s DLP policies. Restricted connectors can block feature access even with correct roles.
2. **Check Environment and Licensing:**  
   - Confirm your environment is not a preview or restricted developer environment and has proper licensing for all required connectors and features.
3. **Reinstall or Refresh the Kit:**  
   - If issues persist, reinstall the Copilot Studio Kit from AppSource and use the Setup Wizard to reconfigure the environment.
4. **Activate All Required Flows:**  
   - Make sure all Power Automate flows are activated. Toggle setup wizard flows off/on after DLP policy updates.
5. **Update to the Latest Version:**  
   - Ensure you are using the latest version of the kit, as recent releases may have changed UI options and feature availability.

**Download/Reference Links:**  
- 📚 [Power CAT Copilot Studio Kit – Access Troubleshooting Guide](#)
- 📚 [Power Platform DLP Policies Documentation](https://learn.microsoft.com/power-platform/admin/wp-data-loss-prevention)
- 📚 [Copilot Studio Kit Installation Guide](#)

**Outcome:**  
The user was able to gain full access to all features of the Copilot Studio Kit after following the provided steps.

---

This automated log entry is based on the resolution of the issue. If further assistance is needed, a maintainer will follow up.

---