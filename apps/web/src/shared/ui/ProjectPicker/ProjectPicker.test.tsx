import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPicker } from './ProjectPicker';

const projects = [
  { id: '1', name: 'Trip to France', status: 'active' as const },
  { id: '2', name: 'Home office', status: 'closed' as const },
];

function renderPicker(value: string | null, onChange = vi.fn<(value: string | null) => void>()) {
  render(
    <>
      <label htmlFor="project">Project</label>
      <ProjectPicker id="project" value={value} onChange={onChange} projects={projects} />
    </>,
  );
  return onChange;
}

describe('ProjectPicker', () => {
  it('offers active projects only, plus a way back to no project', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker(null);
    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    expect(screen.getByRole('option', { name: 'No project' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Home office/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Trip to France' }));
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('keeps a closed project that is already selected visible but not choosable', async () => {
    const user = userEvent.setup();
    renderPicker('2');
    const combo = screen.getByRole('combobox', { name: 'Project' });
    expect(combo).toHaveTextContent('Home office');
    await user.click(combo);
    expect(screen.getByRole('option', { name: /Home office/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
