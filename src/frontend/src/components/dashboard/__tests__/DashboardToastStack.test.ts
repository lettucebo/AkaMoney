import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardToastStack from '../DashboardToastStack.vue';
import type { DashboardToast } from '../DashboardToastStack.vue';

describe('DashboardToastStack', () => {
  it('renders nothing when there are no toasts', () => {
    const wrapper = mount(DashboardToastStack, { props: { toasts: [] } });

    expect(wrapper.find('.toast').exists()).toBe(false);
  });

  it('renders a success and an error toast with distinct tones', () => {
    const toasts: DashboardToast[] = [
      { id: '1', message: '已建立短網址：demo1', tone: 'ok' },
      { id: '2', message: '複製失敗，請手動複製網址。', tone: 'err' }
    ];
    const wrapper = mount(DashboardToastStack, { props: { toasts } });

    const items = wrapper.findAll('.toast');
    expect(items).toHaveLength(2);
    expect(items[0].classes()).toContain('ok');
    expect(items[1].classes()).toContain('err');
    expect(items[0].text()).toContain('已建立短網址：demo1');
    expect(items[1].text()).toContain('複製失敗');
  });

  it('emits dismiss with the toast id when the close button is clicked', async () => {
    const toasts: DashboardToast[] = [{ id: 'abc', message: '訊息', tone: 'ok' }];
    const wrapper = mount(DashboardToastStack, { props: { toasts } });

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('dismiss')).toEqual([['abc']]);
  });
});
