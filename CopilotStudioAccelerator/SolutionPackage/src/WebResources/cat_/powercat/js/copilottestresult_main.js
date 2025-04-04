/**
 * @function setMultiTurnResultsGridVisibility function to configure visibility of MultiTurn Results Grid.
 * @executionContext Get the executionContext.
 */
function setMultiTurnResultsGridVisibility(executionContext) {
  "use strict";
  const formContext = executionContext.getFormContext();

  // Get the test type field value
  const fieldValue = formContext.getAttribute("cat_testtypecode").getValue();

  // Toggle section visibility
  const sectionMultiturn = formContext.ui.tabs
    .get("tab_general")
    .sections.get("tab_general_section_multiturntestresults");
  const sectionEnrichResults = formContext.ui.tabs
    .get("tab_general")
    .sections.get("tab_general_section_enrichedresults");

  // Set visibility based on the test type field value
  if (sectionMultiturn) {
    sectionMultiturn.setVisible(fieldValue === 5);
  }
  if (sectionEnrichResults) {
    sectionEnrichResults.setVisible(fieldValue !== 5);
  }
}
