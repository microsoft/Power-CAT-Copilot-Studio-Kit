# Adaptive cards gallery
## About adaptive cards

Adaptive Cards are a lightweight UI framework that enables developers to create dynamic and interactive content that can be rendered consistently across different platforms and applications. They are defined using a JSON-based schema, allowing for flexibility in layout and interactivity while adapting to the look and feel of the host application.

Learn more about adaptive cards from [here](https://adaptivecards.io/).

## Adaptive cards gallery overview

Adaptive cards gallery is a collection of adaptive cards demonstrating different scenarios with the focus being on Copilot Studio custom agent interactions.

![adaptivecards1](https://github.com/user-attachments/assets/e35288e3-77e5-4f76-8b57-4406332d4544)

Each sample adaptive card comes with a template and sample data. Adaptive cards are all implemented in a Copilot Studio custom agent as well, which can be activated for live preview, by entering its token endpoint in an environment variable **Agent Token Endpoint**. **Open in Copilot Studio** opens a topic associated with the selected adaptive card from the custom agent into a new tab so that backend implementation details can be studied and copied.

![adaptivecards2](https://github.com/user-attachments/assets/d4e7ca66-2e7c-497c-94e8-0695e12253dd)

> [!NOTE]
> By default, emulator is used to preview the adaptive cards. To preview the adaptive cards using a real Copilot Studio webchat, publish the "**Adaptive Card Gallery**"-agent that ships with Copilot Studio Kit, and set the environment variable **cat_AgentTokenEndpoint** to its Token Endpoint. The token endpoint of Copilot Studio custom agent can be copied from Channels -> Mobile app.


Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
