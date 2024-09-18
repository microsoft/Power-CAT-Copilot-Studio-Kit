/**
 * @function hideAndShowConversationKPISettings
 * @description Shows or hides KPI settings based on the configuration type.
 * @param {object} executionContext - The form execution context.
 */
function hideAndShowConversationKPISettings(executionContext) {
    const formContext = executionContext.getFormContext();
    const configurationTypeValue = formContext.getAttribute("cat_configurationtypecode").getValue();
    const tabGeneral = formContext.ui.tabs.get("tab_general");
    const kpiSection = tabGeneral.sections.get("tab_general_section_kpisettings");

    const sectionsToHideOrShow = [
        "tab_general_section_directlinesettings",
        "tab_general_section_userauthentication",
        "tab_general_section_resultsenrichment",
        "tab_general_section_conversationtranscriptsenrichment", 
        "tab_general_section_generativeaitesting"
    ];

    if (configurationTypeValue === 2) {
        kpiSection.setVisible(true);
        toggleSectionVisibility(tabGeneral, sectionsToHideOrShow, false); 

        setFieldRequirements(formContext, ["cat_copilotid", "cat_dataverseurl"], "required");

    } else if(configurationTypeValue === 1) {
        kpiSection.setVisible(false);
        toggleSectionVisibility(tabGeneral, sectionsToHideOrShow, true); 

        setFieldRequirements(formContext, ["cat_copilotid"], "none");
        
        formContext.getAttribute("cat_copilotid").setValue(null);
        formContext.getAttribute("cat_trackedvariables").setValue(null);

        hideAndShowFields(executionContext);
    }
    else {
      
        kpiSection.setVisible(false);
        toggleSectionVisibility(tabGeneral, sectionsToHideOrShow, false); 

    }
}

/**
 * @function hideAndShowFields
 * @description Shows or hides fields in the Conversation Transcript Enrichment section based on cat_isenrichedwithconversationtranscripts.
 * @param {object} executionContext - The form execution context.
 */
function hideAndShowFields(executionContext) {
    const formContext = executionContext.getFormContext();
    const isEnrichedWithTranscripts = formContext.getAttribute("cat_isenrichedwithconversationtranscripts").getValue();
    const configurationTypeValue = formContext.getAttribute("cat_configurationtypecode").getValue();
    const section = formContext.ui.tabs.get("tab_general").sections.get("tab_general_section_conversationtranscriptsenrichment");

    if (configurationTypeValue === 2) {
        section.setVisible(false); 
    } else if (configurationTypeValue === 1) {
        const controls = [
            { controlName: "cat_dataverseurl1", fieldName: "cat_dataverseurl", requiredLevel: isEnrichedWithTranscripts ? "required" : "none", value: isEnrichedWithTranscripts ? null : "" },
            { controlName: "cat_iscopyfulltranscriptenabled1", fieldName: "cat_iscopyfulltranscriptenabled", requiredLevel: "none", value: isEnrichedWithTranscripts ? null : false }
        ];

        controls.forEach(({ controlName, fieldName, requiredLevel, value }) => {
            const control = section.controls.get(controlName);
            if (control) {
                control.setVisible(isEnrichedWithTranscripts); 
                const attribute = formContext.getAttribute(fieldName);
                if (attribute) {
                    attribute.setRequiredLevel(requiredLevel);

                    if (value !== null) {
                        attribute.setValue(value);
                    }
                }
            }
        });
    }
}

/**
 * @function toggleSectionVisibility
 * @description Shows or hides a list of sections within a tab.
 * @param {object} tab - The tab containing the sections.
 * @param {string[]} sectionNames - List of section names to show or hide.
 * @param {boolean} visible - Whether to show or hide the sections.
 */
function toggleSectionVisibility(tab, sectionNames, visible) {
    sectionNames.forEach(sectionName => {
        const section = tab.sections.get(sectionName);
        if (section) {
            section.setVisible(visible);
        }
    });
}

/**
 * @function setFieldRequirements
 * @description Sets the requirement level for a list of fields.
 * @param {object} formContext - The form context.
 * @param {string[]} fieldNames - List of field names to set the requirement level.
 * @param {string} requiredLevel - The required level ("required" or "none").
 */
function setFieldRequirements(formContext, fieldNames, requiredLevel) {
    fieldNames.forEach(fieldName => {
        const attribute = formContext.getAttribute(fieldName);
        if (attribute) {
            attribute.setRequiredLevel(requiredLevel);
        }
    });
}
