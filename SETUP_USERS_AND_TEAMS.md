# Setup users and teams in Copilot Studio Accelerator

After completing the installation of Copilot Studio Accelerator, you can grant security roles to your users so that they can configure new copilots and tests.

It's a best practice to security assign roles via Entra ID group and team memberships, but you can also assign them manually and individually to users.

## Copilot Studio Accelerator security roles

| Security role | Description |
| --- | --- |
| Copilot Studio Accelerator Administrator | Full permissions on the Copilot Studio Accelerator tables as well on the standard Copilot Studio tables, such as Conversation Transcripts. |
| Copilot Studio Accelerator Configurator | Full permissions permissions for user-owned Copilot Studio Accelerator tables and Copilot Studio tables. |
| Copilot Studio Accelerator Tester | Permissions to create and run tests. |

## Navigate to the Power Platform Admin Center

1. Go to the [Power Platform Admin Center](https://admin.powerplatform.microsoft.com/).
2. Navigate to **Environments**
3. Select the environments where you have installed the Copilot Studio Accelerator on.

## Assign security roles to users

### Create Entra ID teams to drive security role assignment (option 1)

A great way to drive user permissions is to use Entra ID groups.
That way users can inherit security roles automatically, simply by being member of a group, instead of individual assignment.

1. From the **environment** overview page
2. Go to **Teams**
3. Select **Create team**.
4. Set the required properties, and in **Team type**, select either **Microsoft Entra ID Security Group** or **Microsoft Entra ID Office Group**.
5. Search and select the desired **group**.
6. Select **Next**
7. Select the desired Copilot Studio Accelerator **security role**.
8. **Save**

> [!NOTE]
> More informartion: [Manage group teams](https://learn.microsoft.com/power-platform/admin/manage-group-teams)

### Assign security roles to individual users (option 2)

A great way to drive user permissions is to use Entra ID groups.
That way users can inherit security roles automatically, simply by being member of a group, instead of individual assignment.

1. From the **environment** overview page
2. Go to **Users**
3. If the user isn't present in the list, select** Add user** and add them.
4. Select the **user**.
5. Select **Manage roles**.
6. Select the desired Copilot Studio Accelerator **security role**.
7. **Save**

> [!NOTE]
> More informartion: [Configure user security](https://learn.microsoft.com/en-us/power-platform/admin/database-security)

## Set an Entra ID Security Group to restrict access to the environment (optional)

1. From the **environment** overview page
2. In the **Details** section, select **Edit**.
3. Edit, search, and select a **security group**.
4. **Save**.

> [!NOTE]
> More informartion: [Control user access to environments](https://learn.microsoft.com/power-platform/admin/control-user-access)
