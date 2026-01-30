/**
 * @function setExampleTypeVisibility
 * @description Shows/hides Example Type controls based on Marked as Example value
 * @param {object} formContext - The form context
 * @param {boolean} showExampleType - Whether to show the Example Type controls
 */
function setExampleTypeVisibility(formContext, showExampleType) {
    "use strict";
    const exampleTypeControl = formContext.getControl("cat_exampletypecode");
    const exampleTypeControl1 = formContext.getControl("cat_exampletypecode1");
    
    if (exampleTypeControl) exampleTypeControl.setVisible(showExampleType);
    if (exampleTypeControl1) exampleTypeControl1.setVisible(showExampleType);
    
    // Clear the value when hiding
    if (!showExampleType) {
        const exampleTypeAttr = formContext.getAttribute("cat_exampletypecode");
        if (exampleTypeAttr) exampleTypeAttr.setValue(null);
    }
}

/**
 * @function setMultiTurnResultsGridVisibility 
 * @description Configures visibility of MultiTurn Results Grid, Rubric Result section, and Example Type control
 *              Also registers the OnPostSave handler to re-apply visibility after save
 * @param {object} executionContext - The execution context
 */
function setMultiTurnResultsGridVisibility(executionContext) {
    "use strict";
    const formContext = executionContext.getFormContext();
    
    // Apply visibility logic on load
    applyVisibilityLogic(formContext);
    
    // Register OnPostSave handler ONCE during form load to re-apply visibility after save
    if (formContext && formContext.data && formContext.data.entity) {
        formContext.data.entity.addOnPostSave(function() {
            // Use setTimeout to wait for form UI to finish refreshing
            setTimeout(function() {
                applyVisibilityLogic(formContext);
            }, 500);
        });
    }
}

/**
 * @function applyVisibilityLogic
 * @description Core visibility logic - applies all visibility rules based on field values
 * @param {object} formContext - The form context
 */
function applyVisibilityLogic(formContext) {
    "use strict";

    // Helper function to safely set section visibility
    const setSectionVisible = (section, visible) => {
        if (section) section.setVisible(visible);
    };

    // Helper function to safely get attribute value
    const getAttributeValue = (attrName) => {
        const attr = formContext.getAttribute(attrName);
        return attr ? attr.getValue() : null;
    };

    // Get field values
    const testTypeCode = getAttributeValue("cat_testtypecode");
    const rubricValue = getAttributeValue("cat_rubricid");
    const markedAsExample = getAttributeValue("cat_markedasexample");

    // Check if rubric has data (handle lookup array)
    const hasRubricValue = rubricValue !== null && 
        (Array.isArray(rubricValue) ? rubricValue.length > 0 : true);

    // Get tabs
    const tabGeneral = formContext.ui.tabs.get("tab_general");
    if (!tabGeneral) return;
    
    const tabRubricRefinement = formContext.ui.tabs.get("tab_rubric_refinement_full");

    // Get sections from General tab
    const sections = {
        multiturn: tabGeneral.sections.get("tab_general_section_multiturntestresults"),
        enrichResults: tabGeneral.sections.get("tab_general_section_enrichedresults"),
        rubricResult: tabGeneral.sections.get("tab_general_section_rubrics_result"),
        result: tabGeneral.sections.get("tab_general_section_result"),
        performance: tabGeneral.sections.get("tab_general_section_performance"),
        response: tabGeneral.sections.get("tab_general_section_response"),
        actualCompleteResponse: tabGeneral.sections.get("tab_general_section_actual_complete_response"),
        suggestedActions: tabGeneral.sections.get("tab_general_section_suggestedactions"),
        section8: tabGeneral.sections.get("tab_general_section_8"),
        citations: tabGeneral.sections.get("tab_general_section_citations")
    };

    // Show/hide Rubric Refinement tab based on rubric data
    if (tabRubricRefinement) {
        tabRubricRefinement.setVisible(hasRubricValue);
    }

    // Configure section visibility based on rubric data
    if (hasRubricValue) {
        setSectionVisible(sections.performance, false);
        setSectionVisible(sections.response, false);
        setSectionVisible(sections.actualCompleteResponse, false);
        setSectionVisible(sections.suggestedActions, false);
        setSectionVisible(sections.section8, false);
        setSectionVisible(sections.citations, false);
        setSectionVisible(sections.multiturn, false);
        setSectionVisible(sections.enrichResults, false);
        setSectionVisible(sections.result, true);
        setSectionVisible(sections.rubricResult, true);
    } else {
        const isMultiTurn = testTypeCode === 5;
        
        setSectionVisible(sections.multiturn, isMultiTurn);
        setSectionVisible(sections.enrichResults, !isMultiTurn);
        setSectionVisible(sections.rubricResult, false);
    }

    // Show/hide Example Type control based on Marked as Example
    setExampleTypeVisibility(formContext, markedAsExample === true);

    // Hide specific fields when TestType = 4 and rubric has data
    // Note: Only hide when condition is true; don't explicitly show to avoid overriding Business Rules
    const hideRubricTestFields = testTypeCode === 4 && hasRubricValue;
    
    if (hideRubricTestFields) {
        const rubricTestFields = [
            "cat_adaptivecardpayload",
            "cat_operationtypecode",
            "cat_comparisonoperator",
            "cat_expectedattachmentsjson",
            "cat_generativeansweroutcomecode",
            "cat_expectedresponse",
            "cat_expectedtools",
            "cat_expectedtopicname",
            "cat_externalvariablesjson",
            "cat_passthreshold",
            "cat_isstartconversationeventsent",
            "cat_resultreason"
        ];

        rubricTestFields.forEach((fieldName) => {
            const control = formContext.getControl(fieldName);
            if (control) {
                control.setVisible(false);
            }
        });
    }
}

/**
 * @function onMarkedAsExampleChange
 * @description Handles onChange event for cat_markedasexample field to show/hide cat_exampletypecode
 * @param {object} executionContext - The execution context
 */
function onMarkedAsExampleChange(executionContext) {
    "use strict";
    const formContext = executionContext.getFormContext();

    const markedAsExampleAttr = formContext.getAttribute("cat_markedasexample");
    const showExampleType = markedAsExampleAttr ? markedAsExampleAttr.getValue() === true : false;

    setExampleTypeVisibility(formContext, showExampleType);
}

/**
 * @function onTestTypeOrRubricChange
 * @description Handles onChange event for cat_testtypecode or cat_rubricid fields
 *              to update field visibility based on TestType = 4 and rubric data
 * @param {object} executionContext - The execution context
 */
function onTestTypeOrRubricChange(executionContext) {
    "use strict";
    const formContext = executionContext.getFormContext();
    applyVisibilityLogic(formContext);
}