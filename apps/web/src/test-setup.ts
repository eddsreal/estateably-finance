import '@testing-library/jest-dom/vitest';

if (!('showPopover' in HTMLElement.prototype)) {
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      this.style.display = 'block';
    },
    hidePopover(this: HTMLElement) {
      this.style.display = 'none';
    },
  });
}
