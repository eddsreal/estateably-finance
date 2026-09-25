import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NarrativeText } from './NarrativeText';

describe('NarrativeText', () => {
  it('renders bold as strong and bullets as a list', () => {
    const { container } = render(<NarrativeText text={'**Rent** led.\n\n- a\n- b'} />);
    expect(container.querySelector('strong')).toHaveTextContent('Rent');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows an unclosed bold mark literally until its closing piece arrives', () => {
    const { container, rerender } = render(<NarrativeText text="**Re" />);
    expect(container).toHaveTextContent('**Re');
    expect(container.querySelector('strong')).toBeNull();
    rerender(<NarrativeText text="**Rent**" />);
    expect(container.querySelector('strong')).toHaveTextContent('Rent');
  });

  it('renders a heading as plain text', () => {
    const { container } = render(<NarrativeText text="# Summary" />);
    expect(container.querySelector('h1')).toBeNull();
    expect(container).toHaveTextContent('Summary');
  });

  it('renders a link as its label only, with no anchor and no URL', () => {
    const { container } = render(<NarrativeText text="[click here](https://evil.example)" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container).toHaveTextContent('click here');
    expect(container).not.toHaveTextContent('evil.example');
  });

  it('renders an image as its alt text only, with no img element', () => {
    const { container } = render(<NarrativeText text="![a receipt](https://evil.example/x.png)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('a receipt');
    expect(container).not.toHaveTextContent('evil.example');
  });

  it('keeps raw HTML inert as escaped text', () => {
    const { container } = render(<NarrativeText text={'<script>alert(1)</script> <b>x</b>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container).toHaveTextContent('<b>x</b>');
  });
});
