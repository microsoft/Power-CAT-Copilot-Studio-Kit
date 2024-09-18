/**
 * @function executeTestRunAction parent function to execute action based on command label.
 * @primaryControl Get the formContext.
 * @commandLabel Get the command label.
 */
function executeTestRunAction(primaryControl, commandLabel) {
  //variable declarations/assignments
  let actionExecutionRequest = null;
  let confirmationMessage = "";
  let successMessage = "";
  const formContext = primaryControl;

  // Create target entity object
  const copilotTestRunId = formContext.data.entity
    .getId()
    .replace("{", "")
    .replace("}", "");
  const copilotTestRun = {
    entityType: "cat_copilottestrun",
    id: copilotTestRunId,
  };

  // Retrieve action parameters
  const skipDelay = true;
  const copilotConfigurationId = formContext
    .getAttribute("cat_copilotconfigurationid")
    .getValue()[0]
    .id.replace("{", "")
    .replace("}", "");
  const copilotTestSetId = formContext
    .getAttribute("cat_copilottestsetid")
    .getValue()[0]
    .id.replace("{", "")
    .replace("}", "");
  const dataverseUriHost = Xrm.Utility.getGlobalContext()
    .getClientUrl()
    .replace("https://", "")
    .replace("http://", "");

  // Create action request based on command label
  switch (commandLabel) {
    case "Enrich with App Insights":
      confirmationMessage =
        "Do you want to rerun Azure Application Insights enrichment for this test run? Existing results will be overwritten.";
      successMessage = "Azure Application Insights enrichment is in progress.";
      actionExecutionRequest = createExecutionRequest(
        copilotTestRun,
        skipDelay,
        copilotTestRunId,
        copilotTestSetId,
        copilotConfigurationId,
        null,
        "cat_RunAzureApplicationInsightsEnrichment"
      );
      break;
    case "Analyze with AI Builder":
      confirmationMessage =
        "Do you want to rerun Analyze with AI Builder for this test run? Existing results will be overwritten.";
      successMessage = "Analyze with AI Builder is in progress.";
      actionExecutionRequest = createExecutionRequest(
        copilotTestRun,
        null,
        copilotTestRunId,
        copilotTestSetId,
        null,
        null,
        "cat_RunAIBuilderAnalysis"
      );
      break;
    case "Enrich with Dataverse":
      confirmationMessage =
        "Do you want to rerun Dataverse enrichment for this test run? Existing results will be overwritten.";
      successMessage = "Dataverse enrichment is in progress.";
      actionExecutionRequest = createExecutionRequest(
        copilotTestRun,
        skipDelay,
        copilotTestRunId,
        copilotTestSetId,
        copilotConfigurationId,
        null,
        "cat_RunDataverseConversationTranscriptsEnrichment"
      );
      break;
    case "Update Rollup Columns":
      confirmationMessage = "Do you want to update rollup columns?";
      successMessage = "Rollup Columns update is in progress.";
      actionExecutionRequest = createExecutionRequest(
        copilotTestRun,
        null,
        copilotTestRunId,
        null,
        null,
        dataverseUriHost,
        "cat_RunRollupColumnsUpdates"
      );
      break;
    default:
      break;
  }

  // Execute action request
  executeActionRequest(
    confirmationMessage,
    actionExecutionRequest,
    formContext,
    successMessage
  );
}

/**
 * @function executeActionRequest action request based on user confirmation.
 * @confirmationMessage confirmation message.
 * @actionExecutionRequest action execution request.
 * @formContext form context.
 * @successMessage success message.
 */
function executeActionRequest(
  confirmationMessage,
  actionExecutionRequest,
  formContext,
  successMessage
) {
  const confirmStrings = {
    text: confirmationMessage,
    title: "Confirmation Dialog",
  };
  const confirmOptions = { height: 150, width: 450 };
  Xrm.Navigation.openConfirmDialog(confirmStrings, confirmOptions).then(
    function (success) {
      if (success.confirmed)
        //execute action
        Xrm.WebApi.online
          .execute(actionExecutionRequest)
          .then(
            function success(result) {
              if (result.ok) {
                displayNotification(
                  formContext,
                  successMessage,
                  "INFO",
                  "TESTRUN_SUCCESS_NOTIFICATION"
                );
                removeNotification(formContext, "TESTRUN_SUCCESS_NOTIFICATION");
              } else {
                displayNotification(
                  formContext,
                  "An error occurred while executing the action. Please try again.",
                  "ERROR",
                  "TESTRUN_ERROR_NOTIFICATION"
                );
                removeNotification(formContext, "TESTRUN_ERROR_NOTIFICATION");
              }
            },
            function (error) {
              displayNotification(
                formContext,
                `An error occurred while submitting record for test run execution. Please try again. Error Message: ${error.message}`,
                "ERROR",
                "TESTRUN_ERROR_NOTIFICATION"
              );
              removeNotification(formContext, "TESTRUN_ERROR_NOTIFICATION");
            }
          )
          .catch(function (error) {
            displayNotification(
              formContext,
              `An error occurred while executing the action. Please try again. Error Message: ${error.message}`,
              "ERROR",
              "TESTRUN_ERROR_NOTIFICATION"
            );
            removeNotification(formContext, "TESTRUN_ERROR_NOTIFICATION");
          });
    }
  );
}

/**
 * @function createExecutionRequest create an execution request with all required parameters.
 * @copilotTestRun target Copilot Test Run entity object.
 * @skipDelay skip delay flag.
 * @copilotTestRunId Copilot Test Run Id.
 * @copilotTestSetId Copilot Test Set Id.
 * @copilotConfigurationId Copilot Configuration Id.
 * @dataverseUriHost Dataverse Uri Host.
 * @operationName operation name.
 * @returns execution request.
 */
function createExecutionRequest(
  copilotTestRun,
  skipDelay,
  copilotTestRunId,
  copilotTestSetId,
  copilotConfigurationId,
  dataverseUriHost,
  operationName
) {
  const executionRequest = {
    entity: copilotTestRun,
    CopilotTestRunId: copilotTestRunId,
    getMetadata: function () {
      return {
        boundParameter: "entity",
        parameterTypes: {
          entity: {
            typeName: "mscrm.cat_copilottestrun",
            structuralProperty: 5,
          },
          SkipDelay: {
            typeName: "Edm.Boolean",
            structuralProperty: 1,
          },
          CopilotConfigurationId: {
            typeName: "Edm.String",
            structuralProperty: 1,
          },
          CopilotTestRunId: {
            typeName: "Edm.String",
            structuralProperty: 1,
          },
          CopilotTestSetId: {
            typeName: "Edm.String",
            structuralProperty: 1,
          },
          DataverseUriHost: {
            typeName: "Edm.String",
            structuralProperty: 1,
          },
        },
        operationType: 0,
        operationName: operationName,
      };
    },
  };

  // Set additional parameters
  if (skipDelay !== null) {
    executionRequest.SkipDelay = skipDelay;
  }
  if (copilotConfigurationId !== null) {
    executionRequest.CopilotConfigurationId = copilotConfigurationId;
  }
  if (copilotTestSetId !== null) {
    executionRequest.CopilotTestSetId = copilotTestSetId;
  }
  if (dataverseUriHost !== null) {
    executionRequest.DataverseUriHost = dataverseUriHost;
  }

  return executionRequest;
}

/**
 * @function copyRecord
 * @description Copy a record and navigate to the new form.
 * @param formContext - The form context of the record to copy.
 */
function copyRecord(formContext) {
  const entityName = formContext.data.entity.getEntityName();

  try {
    // Prepare the form options for the new record
    const entityFormOptions = {
      entityName: entityName,
    };

    // Prepare the default values for the new form
    const name = formContext.getAttribute("cat_name").getValue() + " (Copy)";
    const copilotConfigIdField = formContext
      .getAttribute("cat_copilotconfigurationid")
      .getValue();
    const copilotTestSetIdField = formContext
      .getAttribute("cat_copilottestsetid")
      .getValue();
    const ownerField = formContext.getAttribute("ownerid").getValue();

    const formParameters = {
      cat_name: name,
      cat_copilotconfigurationid: copilotConfigIdField[0].id,
      cat_copilotconfigurationidname: copilotConfigIdField[0].name,
      cat_copilottestsetid: copilotTestSetIdField[0].id,
      cat_copilottestsetidname: copilotTestSetIdField[0].name,
      ownerid: ownerField[0].id,
      owneridname: ownerField[0].name,
      owneridtype: ownerField[0].entityType,
    };

    // Open the form
    Xrm.Navigation.openForm(entityFormOptions, formParameters).then(
      function (success) {
        // Success - do nothing
      },
      function (error) {
        throw new Error("Error opening the new form: " + error.message);
      }
    );
  } catch (error) {
    displayNotification(
      formContext,
      "Error copying record: " + error.message,
      "ERROR",
      "COPYERROR"
    );
    removeNotification(formContext, "COPYERROR");
  }
}

/**
 * @function displayNotification display notification on form.
 * @formContext form context.
 * @message notification message.
 * @level notification type.
 * @uniqueId unique id for notification.
 */
function displayNotification(formContext, message, type, uniqueId) {
  formContext.ui.setFormNotification(message, type, uniqueId);
}

/**
 * @function removeNotification remove notification from form after fixed seconds.
 * @formContext form context.
 * @uniqueId unique id for notification.
 */
function removeNotification(formContext, uniqueId) {
  setTimeout(function () {
    formContext.ui.clearFormNotification(uniqueId);
  }, 7000);
}