/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, type FC, type CSSProperties } from "react";
import { Image20Regular } from "@fluentui/react-icons";
import {
  Button,
  Checkbox,
  Dropdown,
  Input,
  Option,
  Radio,
  RadioGroup,
  Textarea,
} from "@fluentui/react-components";
import type {
  AdaptiveCardContent,
  AdaptiveCardElement,
  AdaptiveCardAction,
  AdaptiveCardColumn,
} from "./types";
import { formatMessageText } from "./format-message-text";
import "./AdaptiveCardRenderer.css";

interface AdaptiveCardRendererProps {
  card: AdaptiveCardContent;
}

const AdaptiveCardRenderer: FC<AdaptiveCardRendererProps> = ({
  card,
}) => {
  if (!card || card.type !== "AdaptiveCard") {
    return null;
  }

  return (
    <div className="adaptive-card adaptive-card-readonly" role="group" aria-label="Adaptive Card (read-only)">
      {card.body &&
        card.body.map((element, index) => (
          <ElementRenderer key={index} element={element} />
        ))}
      {card.actions && card.actions.length > 0 && (
        <div className="adaptive-card-actions">
          {card.actions.map((action, index) => (
            <ActionRenderer key={index} action={action} />
          ))}
        </div>
      )}
    </div>
  );
};

const ElementRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  switch (element.type) {
    case "TextBlock":
      return <TextBlockRenderer element={element} />;
    case "Container":
      return <ContainerRenderer element={element} />;
    case "ColumnSet":
      return <ColumnSetRenderer element={element} />;
    case "Column":
      return <ColumnRenderer element={element as AdaptiveCardColumn} />;
    case "Input.Text":
      return <InputTextRenderer element={element} />;
    case "Input.ChoiceSet":
      return <InputChoiceSetRenderer element={element} />;
    case "ActionSet":
      return <ActionSetRenderer element={element} />;
    case "Image":
      return <ImageRenderer element={element} />;
    case "RichTextBlock":
      return <RichTextRenderer element={element} />;
    default:
      return <div className="unknown-element">Unknown: {element.type}</div>;
  }
};

const TextBlockRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  const classes = ["text-block"];
  if (element.size) classes.push(`size-${element.size.toLowerCase()}`);
  if (element.weight) classes.push(`weight-${element.weight.toLowerCase()}`);
  if (element.color) classes.push(`color-${element.color.toLowerCase()}`);
  if (element.spacing) classes.push(`spacing-${element.spacing.toLowerCase()}`);
  if (element.wrap) classes.push("wrap");

  return (
    <div className={classes.join(" ")}>
      {element.separator && <hr className="separator" />}
      {element.text && (
        <div dangerouslySetInnerHTML={{ __html: formatMessageText(element.text) }} />
      )}
    </div>
  );
};

const ContainerRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  return (
    <div className="container">
      {element.items?.map((item, index) => (
        <ElementRenderer key={index} element={item} />
      ))}
    </div>
  );
};

const ColumnSetRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  return (
    <div className="column-set">
      {element.columns?.map((column, index) => (
        <ColumnRenderer key={index} element={column} />
      ))}
    </div>
  );
};

const ColumnRenderer: FC<{ element: AdaptiveCardColumn }> = ({
  element,
}) => {
  const style: CSSProperties = {};
  if (element.width === "auto") {
    style.flex = "0 0 auto";
  } else if (element.width === "stretch") {
    style.flex = "1 1 0";
  } else if (typeof element.width === "number") {
    style.flex = `${element.width} ${element.width} 0`;
  }

  return (
    <div className="column" style={style}>
      {element.items?.map((item, index) => (
        <ElementRenderer key={index} element={item} />
      ))}
    </div>
  );
};

const InputTextRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  const isMultiline =
    element.style === "multiline" ||
    (element.type === "Input.Text" && (element as any).isMultiline);

  return (
    <div className="input-container">
      {element.label && <label className="input-label">{element.label}</label>}
      {isMultiline ? (
        <Textarea
          className="input-text multiline"
          placeholder={element.placeholder}
          defaultValue={element.value}
          rows={3}
          disabled
          readOnly
          resize="vertical"
          style={{ width: "100%" }}
        />
      ) : (
        <Input
          type="text"
          className="input-text"
          placeholder={element.placeholder}
          defaultValue={element.value}
          id={element.id}
          disabled
          readOnly
          style={{ width: "100%" }}
        />
      )}
    </div>
  );
};

const InputChoiceSetRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  const isMultiSelect = element.isMultiSelect;
  const isExpanded = element.style === "expanded";
  const selectedValues = new Set(
    String(element.value ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  if (isExpanded || isMultiSelect) {
    return (
      <div className="input-container">
        {element.label && (
          <label className="input-label">{element.label}</label>
        )}
        <div className="choice-set-expanded">
          {isMultiSelect
            ? element.choices?.map((choice, index) => (
                <Checkbox
                  key={index}
                  className="choice-item"
                  label={choice.title}
                  checked={selectedValues.has(choice.value)}
                  disabled
                />
              ))
            : (
                <RadioGroup
                  name={element.id}
                  value={element.value}
                  disabled
                >
                  {element.choices?.map((choice, index) => (
                    <Radio
                      key={index}
                      className="choice-item"
                      value={choice.value}
                      label={choice.title}
                    />
                  ))}
                </RadioGroup>
              )}
        </div>
      </div>
    );
  }

  const selectedChoice = element.choices?.find((choice) => choice.value === element.value);

  return (
    <div className="input-container">
      {element.label && <label className="input-label">{element.label}</label>}
      <Dropdown
        className="input-select"
        id={element.id}
        disabled
        placeholder="Select..."
        selectedOptions={element.value ? [element.value] : []}
        value={selectedChoice?.title}
        style={{ width: "100%" }}
      >
        <Option value="">Select...</Option>
        {element.choices?.map((choice, index) => (
          <Option key={index} value={choice.value}>
            {choice.title}
          </Option>
        ))}
      </Dropdown>
    </div>
  );
};

const ImageRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  const [failed, setFailed] = useState(false);
  const url = (element as any).url as string | undefined;
  const alt = (element as any).altText || "";
  const width = (element as any).width;
  const height = (element as any).height;

  if (failed || !url) {
    return (
      <div
        className="image-placeholder"
        title={alt || url || "Image unavailable"}
        style={{
          width: width || "36px",
          height: height || "36px",
        }}
      >
        <Image20Regular style={{ width: "16px", height: "16px" }} />
      </div>
    );
  }

  return (
    <div className="image-container">
      <img
        src={url}
        alt={alt}
        className="adaptive-image"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

const RichTextRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  return (
    <div className="rich-text">
      {element.text && (
        <div dangerouslySetInnerHTML={{ __html: formatMessageText(element.text) }} />
      )}
    </div>
  );
};

const ActionSetRenderer: FC<{ element: AdaptiveCardElement }> = ({
  element,
}) => {
  return (
    <div className="action-set">
      {(element as any).actions?.map(
        (action: AdaptiveCardAction, index: number) => (
          <ActionRenderer key={index} action={action} />
        )
      )}
    </div>
  );
};

const ActionRenderer: FC<{ action: AdaptiveCardAction }> = ({
  action,
}) => {
  const classes = ["adaptive-action"];
  if (action.style === "positive") classes.push("positive");
  if (action.style === "destructive") classes.push("destructive");

  switch (action.type) {
    case "Action.Submit":
      return (
        <Button className={classes.join(" ")} disabled aria-disabled="true">
          {action.title || "Submit"}
        </Button>
      );
    case "Action.OpenUrl":
      return (
        <Button className={classes.join(" ")} disabled aria-disabled="true">
          {action.title || "Open"}
        </Button>
      );
    case "Action.ShowCard":
      return (
        <Button className={classes.join(" ")} disabled aria-disabled="true">
          {action.title || "Show"}
        </Button>
      );
    default:
      return (
        <Button className={classes.join(" ")} disabled aria-disabled="true">
          {action.title || action.type}
        </Button>
      );
  }
};

export default AdaptiveCardRenderer;
