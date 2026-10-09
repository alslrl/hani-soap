"use client";

import { Children, Fragment, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type ValueEvent = { target: { value: string }; currentTarget: { value: string } };
type Props = {
  children: ReactNode; value?: string | number; defaultValue?: string | number;
  onChange?: (event: ValueEvent) => void; disabled?: boolean; className?: string;
  id?: string; name?: string; title?: string; style?: CSSProperties;
  'aria-label'?: string; 'aria-labelledby'?: string;
};
type Option = { value: string; label: ReactNode; text: string; disabled: boolean };
const EMPTY_VALUE = '__hani_empty_option__';
const textContent = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : String(child)).join('');
function readOptions(children: ReactNode): Option[] {
  const values = new Map<string, Option>();
  function visit(nodes: ReactNode) {
    Children.forEach(nodes, child => {
      if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)) return;
      if (child.type === Fragment || child.type === 'optgroup') { visit(child.props.children); return; }
      if (child.type !== 'option') return;
      const text = textContent(child.props.children);
      const value = String(child.props.value ?? text);
      if (!values.has(value)) values.set(value, { value, label: child.props.children, text, disabled: Boolean(child.props.disabled) });
    });
  }
  visit(children);
  return [...values.values()];
}

/** Shared app menu; retains the value-only change callbacks used by existing forms. */
export function AppSelect({ children, value, defaultValue, onChange, disabled, className = '', id, name, title, style, 'aria-label': ariaLabel, 'aria-labelledby': labelledBy }: Props) {
  const options = readOptions(children);
  const [internal, setInternal] = useState(() => String(defaultValue ?? options[0]?.value ?? ''));
  const current = value === undefined ? internal : String(value);
  const trigger = useRef<HTMLButtonElement>(null);
  const [implicitLabel, setImplicitLabel] = useState<string>();
  useEffect(() => {
    if (ariaLabel || labelledBy) return;
    const label = trigger.current?.closest('label');
    if (!label) return;
    const copy = label.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('button,select,input,textarea,small').forEach(element => element.remove());
    setImplicitLabel(copy.textContent?.trim() || undefined);
  }, [ariaLabel, labelledBy]);
  const selected = options.find(option => option.value === current);
  return <Select.Root value={current === '' ? EMPTY_VALUE : current} disabled={disabled || !options.length} onValueChange={next => {
    const actual = next === EMPTY_VALUE ? '' : next;
    if (value === undefined) setInternal(actual);
    onChange?.({ target: { value: actual }, currentTarget: { value: actual } });
  }}>
    <Select.Trigger ref={trigger} id={id} title={title} style={style} className={`hs-select-trigger ${className}`} aria-label={ariaLabel ?? implicitLabel} aria-labelledby={labelledBy} data-value={current} data-hs-select="">
      <Select.Value><span className="hs-select-value">{selected?.label ?? '선택해 주세요'}</span></Select.Value>
      <Select.Icon asChild><ChevronDown className="hs-select-chevron" size={16} strokeWidth={1.8} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
    <Select.Portal><Select.Content className="hs-select-menu" position="popper" sideOffset={6} collisionPadding={12} align="start">
      <Select.ScrollUpButton className="hs-select-scroll"><ChevronUp size={16} strokeWidth={1.8} aria-hidden="true" /></Select.ScrollUpButton>
      <Select.Viewport className="hs-select-options">{options.map(option => <Select.Item className="hs-select-option" key={option.value} value={option.value === '' ? EMPTY_VALUE : option.value} disabled={option.disabled} textValue={option.text} data-option-value={option.value}>
        <Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator className="hs-select-check"><Check size={15} strokeWidth={1.8} aria-hidden="true" /></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="hs-select-scroll"><ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" /></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
