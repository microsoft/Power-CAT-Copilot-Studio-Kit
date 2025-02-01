# Webchat Playground
## Overview
Webchat Playground simplifies customizing the appearance and behavior of the copilot agent webchat, including colors, fonts, thumbnails and much more. Easy to use UI allows makers to define the look and feel of their webchat, and styles can be exported as JSON snippet or HTML sample.

![theme1](https://github.com/user-attachments/assets/fffea4df-5958-4293-98bd-d798d450af15)

Webchat Playground comes with predefined themes which demonstrate different customization options of the webchat, and can be used a starting point when designing a new theme. Makers can also create new themes from scratch and save them for future use.

![theme2](https://github.com/user-attachments/assets/6b5f07aa-2462-4121-b813-7abddf31c8dc)

## UI explained

![ui](https://github.com/user-attachments/assets/150f4314-5909-4ff8-b788-d064a9a5a82c)

1. Left pane shows the available saved themes along with their primary secondary and accent colors. Theme can be selected by clicking on the color box, and edited by clicking the pencil icon.
2. Middle pane provides a preview of the selected theme or the theme being edited.
3. Right pane can be toggled between **JSON** and **Code Snippet**. **JSON** (pictured) provides the current styles in a JSON array which can be pasted to existing WebChat. **Code Snippet** has sample HTML of a webchat with the styles embedded.

![ui2](https://github.com/user-attachments/assets/19c75edf-20f7-48b1-b43a-b4f26e91a3d4)

1. Left pane turns into style editor when theme is being edited, or new theme is being created. It has sections for **General**, **Send Box**, **Suggestion Box**, **Avatar** and **Bubble**. Editor also includes accessibility checker for all applicable sections. Save and delete actions are available from the top.
2. Right pane showing **Code Snippet**
   
## Functionality

### Theme preview

* Theme can be previewed on the **WebChat Preview** by selecting it from the left pane (the area with the colors visible).

### Creating a new theme

1. New theme can be created by clicking **+ Add a theme** from the left pane.
1. Left pane will turn into the theme editor-view where the theme style can be modified.
1. After entering a theme name, it can be saved by clicking the **Save** icon.

### Editing a theme

1. Existing theme can be edited by clicking the small pencil icon next to its name on the left pane.
1. Left pane will change to the theme editor-view, where the styles of the theme can be edited.
1. Changes can be saved by clicking **Save**.

### Deleting a theme

1. Existing theme can be deleted by first opening it in edit mode,
1. Select the trashcan symbol from the top
   
### Exporting the styles

1. Select the desired theme from the theme selector
1. Select the **JSON** tab from the right pane
1. Select all the text in the view and copy-paste into your webchat html as **styleoptions** variable

Read more from [here](https://learn.microsoft.com/microsoft-copilot-studio/customize-default-canvas?tabs=web#customize-the-agent-icon-background-color-and-name).

### Exporting the HTML snippet

1. Select the desired theme from the theme selector
1. Select the **Code Snippet** tab from the right pane
1. Select all the HTML markup in the view and save it as file with html-extension.
1. The resulting html file can be uploaded to the web server.

Read more from [here](https://learn.microsoft.com/microsoft-copilot-studio/customize-default-canvas?tabs=web#customize-the-default-canvas-simple).

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
