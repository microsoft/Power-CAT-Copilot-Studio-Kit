/**
 * @function setMultiTurnControlsVisibility function to configure visibility of MultiTurn controls.
 * @executionContext Get the executionContext.
 */
function setMultiTurnControlsVisibility(executionContext) {
  ("use strict");
  const formContext = executionContext.getFormContext();

  // Get the test type field value
  const fieldValue = formContext.getAttribute("cat_testtypecode").getValue();

  // Toggle section visibility
  const section = formContext.ui.tabs
    .get("tab_general")
    .sections.get("tab_general_section_multiturntests");
  if (section) {
    section.setVisible(fieldValue === 5);
  }
}

/**
 * @function setTestOrder function to set the order of the child test.
 * @executionContext Get the executionContext.
 */
function setTestOrder(executionContext) {
  ("use strict");
  const formContext = executionContext.getFormContext();
  const parentId = formContext.getAttribute("cat_parent").getValue();

  // Check if the form is a new form
  if (formContext.ui.getFormType() !== 1) {
    return;
  }

  if (parentId && parentId[0]) {
    // Set test as critical by default
    formContext.getAttribute("cat_critical").setValue(true);
    const testType = formContext.getControl("cat_testtypecode");
    if (testType !== null) {
      testType.removeOption(5); // Remove the option for MultiTurn tests
    }

    var parentRecordId = parentId[0].id.replace("{", "").replace("}", "");

    // Retrieve the parent test set and update child test
    getParentTestSet(parentRecordId)
      .then(function (parentTestSet) {
        formContext
          .getAttribute("cat_copilottestsetid")
          .setValue(parentTestSet);
      })
      .catch(function (error) {
        throw new Error("Error retrieving parent test set: " + error.message);
      });

    // Retrieve the max order value and update child test
    getMaxOrderValueWebApi(parentRecordId)
      .then(function (maxOrderValue) {
        formContext.getAttribute("cat_order").setValue(maxOrderValue + 1);
      })
      .catch(function (error) {
        throw new Error("Error retrieving max order value: " + error.message);
      });
  }
}

/**
 * @function getParentTestSet function to retrieve the parent test set.
 * @param parentRecordId The ID of the parent record.
 * @returns {Promise} The parent test set record.
 */
function getParentTestSet(parentRecordId) {
  "use strict";
  return new Promise(function (resolve, reject) {
    Xrm.WebApi.retrieveRecord(
      "cat_copilottest",
      parentRecordId,
      "?$select=_cat_copilottestsetid_value"
    )
      .then(function (record) {
        if (record) {
          const parentTestSet = [
            {
              id: record["_cat_copilottestsetid_value"],
              name: record[
                "_cat_copilottestsetid_value@OData.Community.Display.V1.FormattedValue"
              ],
              entityType:
                record[
                  "_cat_copilottestsetid_value@Microsoft.Dynamics.CRM.lookuplogicalname"
                ],
            },
          ];

          resolve(parentTestSet);
        }
      })
      .catch(function (error) {
        reject(new Error("Web API Error: " + error.message));
      });
  });
}

/**
 * @function getMaxOrderValueWebApi function to retrieve the maximum order of the child tests.
 * @param {} parentRecordId The ID of the parent record.
 * @returns {Promise} The maximum order value.
 */
function getMaxOrderValueWebApi(parentRecordId) {
  "use strict";
  return new Promise(function (resolve, reject) {
    const entityLogicalName = "cat_copilottest";

    // Define the FetchXML query with aggregation
    const fetchXml = `<fetch distinct="false" aggregate="true">
                        <entity name="${entityLogicalName}">
                            <attribute name="cat_order" aggregate="max" alias="max_order" />
                            <filter>
                                <condition attribute="cat_parent" operator="eq" value="${parentRecordId}" />
                            </filter>
                        </entity>
                    </fetch>`;

    Xrm.WebApi.retrieveMultipleRecords(
      entityLogicalName,
      `?fetchXml=${encodeURIComponent(fetchXml)}`
    ).then(
      function (result) {
        if (
          result &&
          result.entities &&
          result.entities.length > 0 &&
          result.entities[0].max_order !== null
        ) {
          resolve(parseInt(result.entities[0].max_order));
        } else {
          resolve(1); // No records found; assume max order is 1
        }
      },
      function (error) {
        reject(new Error("Web API Error: " + error.message));
      }
    );
  });
}
