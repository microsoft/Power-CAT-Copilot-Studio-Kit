/**
 * @function openInlineView function to open conversation kpi view
 */
function openInlineView() {
  "use strict";
  try {
    // Define the page input parameters
    var pageInput = {
      pageType: "entitylist",
      entityName: "cat_copilotkpi",
      viewId: "7bc21b4b-8836-4b08-9d52-7436fddc49f9",
      viewType: "savedquery",
    };

    // Define navigation options
    var navigationOptions = {
      target: 1, // 1 for inline, 2 for dialog
    };

    // Navigate to the specified view
    Xrm.Navigation.navigateTo(pageInput, navigationOptions).then(function error(
      err
    ) {
      showErrorDialog(
        "Unable to navigate to the Conversation KPI details view.",
        err.message
      );
    });
  } catch (e) {
    showErrorDialog(
      "An unexpected error occurred while navigating to the Conversation KPI details view.",
      e.message
    );
  }
}

/**
 * Displays an error dialog with the provided message and details.
 * @param {string} message - The main error message to display.
 * @param {string} [details] - Detailed information about the error.
 */
function showErrorDialog(message, details) {
  "use strict";
  var errorOptions = {
    message: message,
    details: details,
  };

  Xrm.Navigation.openErrorDialog(errorOptions);
}
