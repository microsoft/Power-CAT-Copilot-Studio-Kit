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

/** @globalvariable used for holding the original Choices of Comparison operator*/
let fullComparisonOptions = []; // Cache the full list on form load

/**
 * @function  setChoicesForComparisonOperatorOnFormLoad function to retrieve the original choices of comparison operator and set the choices.
 * @executionContext Get the executionContext.
 */
function setChoicesForComparisonOperatorOnFormLoad(executionContext) {
    ("use strict");
    const formContext = executionContext.getFormContext();
    const comparisonControl = formContext.getControl("cat_comparisonoperator");
    const operationTypeAttr = formContext.getAttribute("cat_operationtypecode");

    if (comparisonControl && fullComparisonOptions.length === 0) {
        const options = formContext.getAttribute("cat_comparisonoperator").getOptions();
        // Cache only the first 9 options (excluding AI Validation)
        fullComparisonOptions = options.slice(0, 9).map(opt => ({
            text: opt.text,
            value: opt.value
        }));
    }

    // Add onChange handlers for operation type and comparison operator
    if (operationTypeAttr) {
        operationTypeAttr.removeOnChange(setChoicesForComparisonOperator);
        operationTypeAttr.addOnChange(setChoicesForComparisonOperator);
        operationTypeAttr.removeOnChange(updateValidationInstructionField);
        operationTypeAttr.addOnChange(updateValidationInstructionField);
    }

    const comparisonAttr = formContext.getAttribute("cat_comparisonoperator");
    if (comparisonAttr) {
        comparisonAttr.removeOnChange(updateValidationInstructionField);
        comparisonAttr.addOnChange(updateValidationInstructionField);
    }

    // Initial filtering on load
    setChoicesForComparisonOperator(executionContext);
    updateValidationInstructionField(executionContext);
}

/**
 * @function setChoicesForComparisonOperator function to filter and set the choices for response and attachments.
 * @executionContext Get the executionContext.
 */
function setChoicesForComparisonOperator(executionContext) {
    ("use strict");
    const formContext = executionContext.getFormContext();

    const testTypeValue = formContext.getAttribute("cat_testtypecode")?.getValue();
    const comparisonControl = formContext.getControl("cat_comparisonoperator");
    const comparisonAttr = formContext.getAttribute("cat_comparisonoperator");
    const operationTypeValue = formContext.getAttribute("cat_operationtypecode")?.getValue();

    if (!testTypeValue || !comparisonControl || !comparisonAttr || !operationTypeValue) return;

    const TestType = {
        RESPONSE_OR_OTHERS: 1,
        ATTACHMENTS: 3
    };

    const OperationType = {
        COMPARISON_OPERATOR: 1,
        AI_VALIDATION: 2,
        INVOKE_ACTIONS: 3
    };

    // Sort full options by value in ascending order (1 through 9)
    const sortedOptions = [...fullComparisonOptions].sort((a, b) => a.value - b.value);

    let optionsToSet = [];

    if (testTypeValue === TestType.ATTACHMENTS && operationTypeValue === OperationType.COMPARISON_OPERATOR) {
        optionsToSet = sortedOptions.slice(0, 4); // First 4 choices only for Comparison Operator
    } else {
        optionsToSet = sortedOptions; // All 9 choices for everything else (including AI Validation and Invoke Actions)
    }
    // Clear current options
    comparisonControl.clearOptions();

    optionsToSet.forEach(opt => {
        comparisonControl.addOption(opt);
    });

    //get the current value
    const selectedValue = comparisonAttr.getValue();

    //and check if it should be allowed to show in choices, if not allowed set to the first choice
    const isValidValue = optionsToSet.some(opt => opt.value === selectedValue);
    if (!isValidValue) {
        const defaultOption = optionsToSet[0]; // First option from sorted list
        if (defaultOption) {
            comparisonAttr.setValue(defaultOption.value); // set to value = 1 equals
        } else {
            comparisonAttr.setValue(null); // if 1 is not allowed for current type
        }
    }
}

/** @globalvariable previousOperationType used for tracking changes, and isInitialLoad flag for form load */
let previousOperationType = null;
let isInitialLoad = true;

/**
 * @function updateValidationInstructionField function to update the label and clear the input field when the comparison operator selection changes.
 * @executionContext Get the executionContext.
 */
function updateValidationInstructionField(executionContext) {
    "use strict";
    const formContext = executionContext.getFormContext();

    const testTypeAttr = formContext.getAttribute("cat_testtypecode");
    const comparisonAttr = formContext.getAttribute("cat_comparisonoperator");
    const detailAttr = formContext.getAttribute("cat_validationinstructions");
    const detailControl = formContext.getControl("cat_validationinstructions");
    const operationTypeAttr = formContext.getAttribute("cat_operationtypecode");

    if (!testTypeAttr || !comparisonAttr || !detailAttr || !detailControl || !operationTypeAttr) return;

    const testTypeValue = testTypeAttr.getValue();
    const operationTypeValue = operationTypeAttr.getValue();
    const comparisonValue = comparisonAttr.getValue();

    const TestType = {
        ATTACHMENTS: 3,
        GENERATIVE_ANSWER: 4
    };

    const OperationType = {
        COMPARISON_OPERATOR: 1,
        AI_VALIDATION: 2,
        INVOKE_ACTIONS: 3
    };

    const ComparisonOperator = {
        CONTAINS: 3,
        DOES_NOT_CONTAIN: 4
    };

    // Update label based on operation type and comparison operator
    if (operationTypeValue === OperationType.COMPARISON_OPERATOR &&
        (testTypeValue === TestType.ATTACHMENTS ||
            comparisonValue === ComparisonOperator.CONTAINS ||
            comparisonValue === ComparisonOperator.DOES_NOT_CONTAIN)) {
        detailControl.setLabel("Expected Text");
    } else {
        detailControl.setLabel("Validation Instructions");
    }

    // Clear field when switching between AI Validation and Comparison Operator
    if (!isInitialLoad && previousOperationType !== null && testTypeValue === TestType.ATTACHMENTS) {
        const switchedFromAIToComparison = previousOperationType === OperationType.AI_VALIDATION &&
            operationTypeValue === OperationType.COMPARISON_OPERATOR;

        const switchedFromComparisonToAI = previousOperationType === OperationType.COMPARISON_OPERATOR &&
            operationTypeValue === OperationType.AI_VALIDATION;

        if (switchedFromAIToComparison || switchedFromComparisonToAI) {
            detailAttr.setValue(null);
        }
    }

    previousOperationType = operationTypeValue;
    isInitialLoad = false;
}

/**
 * @function updateGenerativeAnswerLabels function to update labels specific to Generative Answer test type
 * @executionContext Get the executionContext.
 */
function updateGenerativeAnswerLabels(executionContext) {
    "use strict";
    const formContext = executionContext.getFormContext();

    const testTypeAttr = formContext.getAttribute("cat_testtypecode");
    const expectedResponseControl = formContext.getControl("cat_expectedresponse");

    if (!testTypeAttr || !expectedResponseControl) return;

    const testTypeValue = testTypeAttr.getValue();

    if (testTypeValue === 4) { // Generative Answer test type
        expectedResponseControl.setLabel("Expected Response/Validation Instructions");
    } else {
        expectedResponseControl.setLabel("Expected Response");
    }
}