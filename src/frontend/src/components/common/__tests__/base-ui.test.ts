import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseButton from '../BaseButton.vue';
import BaseBadge from '../BaseBadge.vue';
import BaseModal from '../BaseModal.vue';
import EmptyState from '../EmptyState.vue';
import StateBlock from '../StateBlock.vue';

describe('BaseButton', () => {
  it('renders a default button', () => {
    const wrapper = mount(BaseButton, { slots: { default: '建立連結' } });
    const button = wrapper.get('button');

    expect(button.classes()).toContain('btn');
    expect(button.attributes('type')).toBe('button');
    expect(button.text()).toBe('建立連結');
  });

  it('applies the variant and size modifiers', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'primary', size: 'sm' } });

    expect(wrapper.get('button').classes()).toEqual(expect.arrayContaining(['btn', 'primary', 'sm']));
  });

  it('supports a submit button', () => {
    const wrapper = mount(BaseButton, { props: { type: 'submit' } });

    expect(wrapper.get('button').attributes('type')).toBe('submit');
  });

  it('emits a click when enabled', async () => {
    const wrapper = mount(BaseButton);

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('disables itself while loading and shows the busy label', () => {
    const wrapper = mount(BaseButton, { props: { loading: true, loadingLabel: '儲存中…' } });

    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true');
    expect(wrapper.text()).toContain('儲存中…');
  });

  it('disables itself when the disabled prop is set', () => {
    const wrapper = mount(BaseButton, { props: { disabled: true } });

    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });

  it('associates a submit button with an external form', () => {
    const wrapper = mount(BaseButton, { props: { type: 'submit', form: 'url-create-form' } });

    expect(wrapper.get('button').attributes('type')).toBe('submit');
    expect(wrapper.get('button').attributes('form')).toBe('url-create-form');
  });
});

describe('BaseBadge', () => {
  it('renders a neutral badge by default', () => {
    const wrapper = mount(BaseBadge, { slots: { default: '未知' } });

    expect(wrapper.get('span').classes()).toContain('badge');
    expect(wrapper.text()).toBe('未知');
  });

  it.each([
    ['on', '作用中'],
    ['off', '已封存'],
    ['exp', '已過期']
  ] as const)('renders the %s tone', (tone, label) => {
    const wrapper = mount(BaseBadge, { props: { tone }, slots: { default: label } });

    expect(wrapper.get('span').classes()).toContain(tone);
  });
});

describe('EmptyState', () => {
  it('renders the headline, description and action slot', () => {
    const wrapper = mount(EmptyState, {
      props: { title: '尚未建立任何短網址', description: '建立第一個短網址開始追蹤成效。' },
      slots: { action: '<button>建立連結</button>' }
    });

    expect(wrapper.find('.empty-cta').exists()).toBe(true);
    expect(wrapper.text()).toContain('尚未建立任何短網址');
    expect(wrapper.text()).toContain('建立第一個短網址開始追蹤成效。');
    expect(wrapper.get('button').text()).toBe('建立連結');
  });

  it('omits the description when it is not provided', () => {
    const wrapper = mount(EmptyState, { props: { title: '沒有符合的結果' } });

    expect(wrapper.find('.empty-desc').exists()).toBe(false);
  });
});

describe('StateBlock', () => {
  it('renders a loading state with a live region', () => {
    const wrapper = mount(StateBlock, { props: { state: 'loading', message: '載入連結中…' } });
    const block = wrapper.get('.state');

    expect(block.attributes('data-state')).toBe('loading');
    expect(block.attributes('role')).toBe('status');
    expect(wrapper.text()).toContain('載入連結中…');
  });

  it('renders an error state as an alert with a title', () => {
    const wrapper = mount(StateBlock, {
      props: { state: 'error', title: '無法載入連結', message: '請稍後再試。' }
    });
    const block = wrapper.get('.state');

    expect(block.attributes('data-state')).toBe('error');
    expect(block.attributes('role')).toBe('alert');
    expect(wrapper.text()).toContain('無法載入連結');
    expect(wrapper.text()).toContain('請稍後再試。');
  });

  it('renders an action slot when supplied', () => {
    const wrapper = mount(StateBlock, {
      props: { state: 'error', message: '失敗' },
      slots: { action: '<button>重試</button>' }
    });

    expect(wrapper.get('button').text()).toBe('重試');
  });
});

describe('BaseModal', () => {
  const mountModal = (open: boolean) =>
    mount(BaseModal, {
      props: { open, title: '封存這個短網址？' },
      slots: { default: '<p>封存後連結會停止轉址。</p>', footer: '<button>確認封存</button>' },
      attachTo: document.body
    });

  it('renders nothing while closed', () => {
    const wrapper = mountModal(false);

    expect(wrapper.find('.modal-scrim').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders an accessible dialog when open', () => {
    const wrapper = mountModal(true);
    const panel = wrapper.get('.modal-panel');

    expect(panel.attributes('role')).toBe('dialog');
    expect(panel.attributes('aria-modal')).toBe('true');
    expect(wrapper.text()).toContain('封存這個短網址？');
    expect(wrapper.text()).toContain('封存後連結會停止轉址。');
    expect(wrapper.text()).toContain('確認封存');
    wrapper.unmount();
  });

  it('emits close when the scrim is clicked', async () => {
    const wrapper = mountModal(true);

    await wrapper.get('.modal-scrim').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not emit close when the panel itself is clicked', async () => {
    const wrapper = mountModal(true);

    await wrapper.get('.modal-panel').trigger('click');

    expect(wrapper.emitted('close')).toBeUndefined();
    wrapper.unmount();
  });

  it('emits close from the header close button', async () => {
    const wrapper = mountModal(true);

    await wrapper.get('[data-testid="modal-close"]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits close when Escape is pressed', async () => {
    const wrapper = mountModal(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('stops listening for Escape once unmounted', async () => {
    const wrapper = mountModal(true);
    wrapper.unmount();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
