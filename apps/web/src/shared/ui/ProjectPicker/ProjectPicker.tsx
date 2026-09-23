import { Picker, PickerOption } from '../Picker/Picker';

export type ProjectOption = {
  id: string;
  name: string;
  status: 'active' | 'closed';
};

type ProjectPickerProps = {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  projects: ProjectOption[];
  invalid?: boolean;
  describedBy?: string;
};

export function ProjectPicker({
  id,
  value,
  onChange,
  projects,
  invalid,
  describedBy,
}: ProjectPickerProps) {
  const options: PickerOption[] = projects
    .filter((project) => project.status === 'active' || project.id === value)
    .map((project) =>
      project.status === 'closed'
        ? { value: project.id, label: project.name, note: 'closed', disabled: true }
        : { value: project.id, label: project.name },
    );
  return (
    <Picker
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="No project"
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
