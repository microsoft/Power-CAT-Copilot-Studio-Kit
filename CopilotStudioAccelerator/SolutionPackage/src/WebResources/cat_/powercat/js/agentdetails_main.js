/**
 * @function navigateToAgentInventory
 * @description This function navigates to a custom page when clicking the record in model driven view.
 * @param {Array} selectedControlItemsReferences - The array of selected control items references.
 */
function navigateToAgentInventory(selectedControlItemsReferences) {
  "use strict";

  if (!selectedControlItemsReferences || selectedControlItemsReferences.length !== 1) {
    return;
  }

  let selectedItem = selectedControlItemsReferences[0];
  var id = selectedItem.Id.replace("{", "").replace("}", "");

  const pageInput = {
    pageType: "custom",
    name: "cat_agentinventory_0b104",
    entityName: selectedItem.TypeName,
    recordId: id,
  };
  const navigationOptions = {
    target: 1
  };
  Xrm.Navigation.navigateTo(pageInput, navigationOptions)
}