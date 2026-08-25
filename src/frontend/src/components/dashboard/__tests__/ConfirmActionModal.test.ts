import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ConfirmActionModal from '../ConfirmActionModal.vue';

describe('ConfirmActionModal', () => {
  const mountModal = (overrides = {}) =>
    mount(ConfirmActionModal, {
      props: {
        open: true,
        title: '封存這個短網址？',
        description: '封存後連結會停止轉址，但你可以立即還原。',
        confirmLabel: '確認封存',
        ...overrides
      },
      attachTo: document.body
    });

  it('renders the title, description, and confirm label', () => {
    const wrapper = mountModal();

    expect(wrapper.text()).toContain('封存這個短網址？');
    expect(wrapper.text()).toContain('封存後連結會停止轉址');
    expect(wrapper.get('[data-testid="confirm-action"]').text()).toBe('確認封存');
  });

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mountModal();

    await wrapper.get('[data-testid="confirm-action"]').trigger('click');

    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('emits close on cancel, backdrop click, and Escape', async () => {
    const wrapper = mountModal();

    await wrapper.get('[data-testid="cancel-action"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.get('.modal-scrim').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('close')).toHaveLength(3);

    wrapper.unmount();
  });

  it('shows an error message when provided and disables actions while loading', () => {
    const wrapper = mountModal({ error: '封存失敗', loading: true });

    expect(wrapper.text()).toContain('封存失敗');
    expect(wrapper.get('[data-testid="cancel-action"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="confirm-action"]').attributes('aria-busy')).toBe('true');
  });

  it('renders nothing when closed', () => {
    const wrapper = mountModal({ open: false });

    expect(wrapper.find('.modal-scrim').exists()).toBe(false);
  });
});
