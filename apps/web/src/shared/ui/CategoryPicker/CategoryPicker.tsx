import { Picker, PickerOption } from '../Picker/Picker';

export type CategoryOption = {
  id: string;
  name: string;
  type: 'expense' | 'income';
  archived: boolean;
};

type CategoryPickerProps = {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  categories: CategoryOption[];
  type: 'expense' | 'income';
  invalid?: boolean;
  describedBy?: string;
};

export function CategoryPicker({
  id,
  value,
  onChange,
  categories,
  type,
  invalid,
  describedBy,
}: CategoryPickerProps) {
  const options: PickerOption[] = categories
    .filter((category) => category.type === type && !category.archived)
    .map((category) => ({ value: category.id, label: category.name }));
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
