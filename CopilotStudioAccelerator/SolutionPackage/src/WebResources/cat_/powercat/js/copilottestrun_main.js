/**
 * @function copyRecord
 * @description Copy a record and navigate to the new form.
 * @param formContext - The form context of the record to copy.
 */
function copyRecord(formContext) {
  "use strict";
  const entityName = formContext. data.entity.getEntityName();

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
    const rubricIdField = formContext. getAttribute("cat_rubricid")?.getValue();
    const passingGradeCode = formContext.getAttribute("cat_passinggradecode")?.getValue();

    const formParameters = {
      cat_name: name,
      cat_copilotconfigurationid: copilotConfigIdField[0].id,
      cat_copilotconfigurationidname: copilotConfigIdField[0].name,
      cat_copilottestsetid: copilotTestSetIdField[0].id,
      cat_copilottestsetidname: copilotTestSetIdField[0].name,
      ownerid: ownerField[0].id,
      owneridname: ownerField[0].name,
      owneridtype: ownerField[0]. entityType,
    };

    if (rubricIdField !== null && rubricIdField !== undefined) {
      formParameters.cat_rubricid = rubricIdField[0].id;
      formParameters.cat_rubricidname = rubricIdField[0].name;
    }

    if (passingGradeCode !== null && passingGradeCode !== undefined) {
      formParameters. cat_passinggradecode = passingGradeCode;
    }

    // Open the form
    Xrm.Navigation. openForm(entityFormOptions, formParameters).then(
      function (success) {
        // Success - do nothing
      },
      function (error) {
        throw new Error("Error opening the new form:  " + error.message);
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