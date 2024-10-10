using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

/// <summary>
/// Utility class for updating organization settings.
/// </summary>
public class OrganizationSettingsUpdater
{
    private IOrganizationService CrmSvc;

    /// <summary>
    /// Initializes a new instance of the <see cref="OrganizationSettingsUpdater"/> class.
    /// </summary>
    /// <param name="organizationService">The CRM organization service.</param>
    public OrganizationSettingsUpdater(IOrganizationService organizationService)
    {
        CrmSvc = organizationService ?? throw new ArgumentNullException(nameof(organizationService));
    }

    /// <summary>
    /// Updates organization settings for a specific setting.
    /// </summary>
    /// <param name="settingName">The name of the organization setting to update.</param>
    /// <param name="settingValue">The new value for the organization setting.</param>
    public void UpdateOrganizationSettings(string settingName, object settingValue)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(settingName))
            {
                Console.WriteLine("Setting name cannot be null or empty.");
                return;
            }

            // Retrieve organization settings
            var query = new QueryExpression("organization");
            query.ColumnSet.AddColumns(settingName);

            var result = CrmSvc.RetrieveMultiple(query);

            if (result.Entities != null && result.Entities.Count > 0)
            {
                var environmentSettings = result.Entities[0];

                // Check if settingValue is a boolean
                if (settingValue is string stringValue && bool.TryParse(stringValue, out var boolValue))
                {
                    // Convert string value to boolean
                    environmentSettings[settingName] = boolValue;
                }
                else
                {
                    // Update the specified setting
                    environmentSettings[settingName] = settingValue;
                }

                // Update the organization settings
                CrmSvc.Update(environmentSettings);

                // Log or handle success
                Console.WriteLine($"Organization settings updated successfully. {settingName}: {settingValue}");
            }
            else
            {
                // Handle the case where no organization settings were found
                Console.WriteLine("No organization settings found.");
            }
        }
        catch (Exception ex)
        {
            // Handle exceptions
            Console.WriteLine($"Error updating organization settings: {ex.Message}");
        }
    }
}