import { Picker, PickerOption } from '../Picker/Picker';

export type AccountOption = { id: string; name: string; archived: boolean };

type AccountPickerProps = {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  accounts: AccountOption[];
  sourceId?: string | null;
  invalid?: boolean;
  describedBy?: string;
};

export function AccountPicker({
  id,
  value,
  onChange,
  accounts,
  sourceId,
  invalid,
  describedBy,
}: AccountPickerProps) {
  const options: PickerOption[] = accounts.map((account) => {
    if (sourceId != null && account.id === sourceId) {
      return { value: account.id, label: account.name, note: '— source', disabled: true };
    }
    if (account.archived) {
      return { value: account.id, label: account.name, note: '— archived', disabled: true };
    }
    return { value: account.id, label: account.name };
  });
  return (
    <Picker
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="—"
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
