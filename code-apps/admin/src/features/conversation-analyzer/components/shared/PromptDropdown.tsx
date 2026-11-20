import { Option, OptionGroup, type DropdownProps } from '@fluentui/react-components';
import type { PromptRow } from '../../contracts/types';
import { getPromptLabel } from '../../utils/format';
import { SingleLineDropdown } from './SingleLineDropdown';

interface PromptDropdownProps {
  prompts: readonly PromptRow[];
  selectedPromptId?: string;
  onSelectPrompt: (promptId: string) => void;
  /** Adds an "All prompts" option with an empty value (Analysis results switcher). */
  allOptionLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  size?: DropdownProps['size'];
}

/** Prompt picker grouped into System and Custom (CV-16, NA-1, AR-1). */
export function PromptDropdown({
  prompts,
  selectedPromptId,
  onSelectPrompt,
  allOptionLabel,
  placeholder = 'Select a prompt',
  disabled,
  className,
  size,
  ...aria
}: PromptDropdownProps) {
  const system = prompts.filter((p) => p.scope === 'system');
  const custom = prompts.filter((p) => p.scope === 'custom');
  const selected = prompts.find((p) => p.id === selectedPromptId);
  const value = selected ? getPromptLabel(selected) : selectedPromptId === '' && allOptionLabel ? allOptionLabel : '';

  return (
    <SingleLineDropdown
      className={className}
      size={size}
      placeholder={placeholder}
      value={value}
      selectedOptions={selectedPromptId != null ? [selectedPromptId] : []}
      onOptionSelect={(_e, data) => {
        if (data.optionValue != null) onSelectPrompt(data.optionValue);
      }}
      disabled={disabled}
      {...aria}
    >
      {allOptionLabel && <Option value="">{allOptionLabel}</Option>}
      {system.length > 0 && (
        <OptionGroup label="System">
          {system.map((p) => (
            <Option key={p.id} value={p.id}>
              {getPromptLabel(p)}
            </Option>
          ))}
        </OptionGroup>
      )}
      {custom.length > 0 && (
        <OptionGroup label="Custom">
          {custom.map((p) => (
            <Option key={p.id} value={p.id}>
              {getPromptLabel(p)}
            </Option>
          ))}
        </OptionGroup>
      )}
    </SingleLineDropdown>
  );
}
