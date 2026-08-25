import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { UrlResponse } from '@/types';

const apiMock = vi.hoisted(() => ({
  updateUrl: vi.fn(),
  uploadImage: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import UrlEditModal from '../UrlEditModal.vue';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildFile(name: string, type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

async function selectFile(wrapper: ReturnType<typeof mount>, file: File): Promise<void> {
  const fileInput = wrapper.get('input[type="file"]');
  Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true });
  await fileInput.trigger('change');
}

function buildUrl(overrides: Partial<UrlResponse> = {}): UrlResponse {
  return {
    id: 'url-1',
    short_code: 'demo1',
    original_url: 'https://example.com/original',
    short_url: 'https://aka.money/demo1',
    title: 'Original title',
    description: 'Original description',
    image_url: 'https://storage.example.com/existing.jpg',
    created_at: 1700000000000,
    updated_at: 1700000000000,
    expires_at: undefined,
    is_active: true,
    click_count: 10,
    ...overrides
  };
}

describe('UrlEditModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const wrapper = mount(UrlEditModal, { props: { open: false, url: buildUrl() }, attachTo: document.body });

    expect(wrapper.find('.modal-scrim').exists()).toBe(false);
    wrapper.unmount();
  });

  it('pre-fills the form from the given url, including the existing image preview', () => {
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    expect((wrapper.get('[data-testid="edit-original-url"]').element as HTMLInputElement).value).toBe(
      'https://example.com/original'
    );
    expect((wrapper.get('[data-testid="edit-title"]').element as HTMLInputElement).value).toBe('Original title');
    expect(wrapper.get('.preview-thumb img').attributes('src')).toBe('https://storage.example.com/existing.jpg');
    wrapper.unmount();
  });

  it('saves the edited fields and emits saved', async () => {
    const updated = buildUrl({ original_url: 'https://example.com/updated', title: 'New title' });
    apiMock.updateUrl.mockResolvedValue(updated);
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-original-url"]').setValue('https://example.com/updated');
    await wrapper.get('[data-testid="edit-title"]').setValue('New title');
    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith(
      'url-1',
      expect.objectContaining({ original_url: 'https://example.com/updated', title: 'New title' })
    );
    expect(wrapper.emitted('saved')?.[0]).toEqual([updated]);
    wrapper.unmount();
  });

  it('sends an explicit null when the expiry field is cleared', async () => {
    apiMock.updateUrl.mockResolvedValue(buildUrl());
    const wrapper = mount(UrlEditModal, {
      props: { open: true, url: buildUrl({ expires_at: Date.parse('2030-01-01T00:00:00Z') }) },
      attachTo: document.body
    });

    await wrapper.get('[data-testid="edit-expires-at"]').setValue('');
    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith('url-1', expect.objectContaining({ expires_at: null }));
    wrapper.unmount();
  });

  it('sends a numeric timestamp when an expiry date is set', async () => {
    apiMock.updateUrl.mockResolvedValue(buildUrl());
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-expires-at"]').setValue('2030-06-15T10:30');
    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    const call = apiMock.updateUrl.mock.calls[0][1];
    expect(typeof call.expires_at).toBe('number');
    wrapper.unmount();
  });

  it('toggles the active state (archive/restore via edit)', async () => {
    apiMock.updateUrl.mockResolvedValue(buildUrl({ is_active: false }));
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl({ is_active: true }) }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-is-active"]').setValue(false);
    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith('url-1', expect.objectContaining({ is_active: false }));
    wrapper.unmount();
  });

  it('clears the existing image and sends an explicit null so the API actually clears it', async () => {
    apiMock.updateUrl.mockResolvedValue(buildUrl({ image_url: undefined }));
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    const removeButton = wrapper.findAll('button').find((b) => b.text().includes('移除'))!;
    await removeButton.trigger('click');
    expect(wrapper.find('.preview-thumb').exists()).toBe(false);

    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith('url-1', expect.objectContaining({ image_url: null }));
    wrapper.unmount();
  });

  it('sends explicit nulls for every cleared optional text field', async () => {
    apiMock.updateUrl.mockResolvedValue(buildUrl());
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-title"]').setValue('');
    await wrapper.get('[data-testid="edit-description"]').setValue('');
    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith(
      'url-1',
      expect.objectContaining({ title: null, description: null })
    );
    wrapper.unmount();
  });

  it('still sends the entered values when the optional fields are filled', async () => {
    apiMock.updateUrl.mockResolvedValue(buildUrl());
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-description"]').setValue('New description');
    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith(
      'url-1',
      expect.objectContaining({ title: 'Original title', description: 'New description' })
    );
    wrapper.unmount();
  });

  it('uploads a replacement image file and shows the new preview', async () => {
    apiMock.uploadImage.mockResolvedValue({ url: 'https://storage.example.com/new.jpg' });
    apiMock.updateUrl.mockResolvedValue(buildUrl({ image_url: 'https://storage.example.com/new.jpg' }));
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    const removeButton = wrapper.findAll('button').find((b) => b.text().includes('移除'))!;
    await removeButton.trigger('click');

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File([new Uint8Array(1024)], 'new.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput.element, 'files', { value: [file] });
    await fileInput.trigger('change');
    await flushPromises();

    expect(apiMock.uploadImage).toHaveBeenCalledWith(file);
    expect(wrapper.get('.preview-thumb img').attributes('src')).toBe('blob:mock-preview');
    wrapper.unmount();
  });

  it('shows a server error without emitting saved when the update fails', async () => {
    apiMock.updateUrl.mockRejectedValue({ response: { data: { message: '更新失敗，請稍後再試' } } });
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('更新失敗，請稍後再試');
    expect(wrapper.emitted('saved')).toBeUndefined();
    wrapper.unmount();
  });

  it('re-seeds the form when a different url is opened', async () => {
    const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

    await wrapper.setProps({ url: buildUrl({ id: 'url-2', original_url: 'https://example.com/other', title: 'Other' }) });

    expect((wrapper.get('[data-testid="edit-original-url"]').element as HTMLInputElement).value).toBe(
      'https://example.com/other'
    );
    wrapper.unmount();
  });

  it('discards an abandoned draft when the same url object is re-opened', async () => {
    const url = buildUrl();
    const wrapper = mount(UrlEditModal, { props: { open: true, url }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-title"]').setValue('Abandoned draft');
    await wrapper.get('[data-testid="edit-original-url"]').setValue('https://example.com/abandoned');

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true, url });

    expect((wrapper.get('[data-testid="edit-title"]').element as HTMLInputElement).value).toBe('Original title');
    expect((wrapper.get('[data-testid="edit-original-url"]').element as HTMLInputElement).value).toBe(
      'https://example.com/original'
    );
    wrapper.unmount();
  });

  it('clears a stale server error when the modal is re-opened', async () => {
    apiMock.updateUrl.mockRejectedValue({ response: { data: { message: '更新失敗，請稍後再試' } } });
    const url = buildUrl();
    const wrapper = mount(UrlEditModal, { props: { open: true, url }, attachTo: document.body });

    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('更新失敗，請稍後再試');

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true, url });

    expect(wrapper.text()).not.toContain('更新失敗，請稍後再試');
    wrapper.unmount();
  });

  describe('image upload races', () => {
    it('blocks saving while an image upload is still in flight, then allows it once done', async () => {
      const upload = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValue(upload.promise);
      apiMock.updateUrl.mockResolvedValue(buildUrl());
      const wrapper = mount(UrlEditModal, {
        props: { open: true, url: buildUrl({ image_url: undefined }) },
        attachTo: document.body
      });

      await selectFile(wrapper, buildFile('cover.jpg'));
      expect(wrapper.text()).toContain('上傳圖片中');
      expect(wrapper.get('[data-testid="edit-submit"]').attributes('disabled')).toBeDefined();

      // Submitting the form directly is what an Enter keypress does, so the
      // disabled button alone is not enough - the handler must guard too.
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(apiMock.updateUrl).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('圖片上傳中，請稍候再儲存');

      upload.resolve({ url: 'https://storage.example.com/cover.jpg' });
      await flushPromises();

      expect(wrapper.get('[data-testid="edit-submit"]').attributes('disabled')).toBeUndefined();
      await wrapper.get('[data-testid="edit-submit"]').trigger('click');
      await flushPromises();

      expect(apiMock.updateUrl).toHaveBeenCalledWith(
        'url-1',
        expect.objectContaining({ image_url: 'https://storage.example.com/cover.jpg' })
      );
      wrapper.unmount();
    });

    it('keeps the newest selection when an earlier upload resolves last', async () => {
      const first = deferred<{ url: string }>();
      const second = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      apiMock.updateUrl.mockResolvedValue(buildUrl());
      const wrapper = mount(UrlEditModal, {
        props: { open: true, url: buildUrl({ image_url: undefined }) },
        attachTo: document.body
      });

      await selectFile(wrapper, buildFile('first.jpg'));
      await selectFile(wrapper, buildFile('second.jpg'));

      second.resolve({ url: 'https://storage.example.com/second.jpg' });
      await flushPromises();
      first.resolve({ url: 'https://storage.example.com/first.jpg' });
      await flushPromises();

      expect(wrapper.get('[data-testid="edit-submit"]').attributes('disabled')).toBeUndefined();
      await wrapper.get('[data-testid="edit-submit"]').trigger('click');
      await flushPromises();

      expect(apiMock.updateUrl).toHaveBeenCalledWith(
        'url-1',
        expect.objectContaining({ image_url: 'https://storage.example.com/second.jpg' })
      );
      wrapper.unmount();
    });

    it('does not let a stale failed upload surface an error over the newest upload', async () => {
      const first = deferred<{ url: string }>();
      const second = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const wrapper = mount(UrlEditModal, {
        props: { open: true, url: buildUrl({ image_url: undefined }) },
        attachTo: document.body
      });

      await selectFile(wrapper, buildFile('first.jpg'));
      await selectFile(wrapper, buildFile('second.jpg'));

      second.resolve({ url: 'https://storage.example.com/second.jpg' });
      await flushPromises();
      first.reject({ response: { data: { message: '舊的上傳失敗' } } });
      await flushPromises();

      expect(wrapper.text()).not.toContain('舊的上傳失敗');
      expect(wrapper.text()).not.toContain('上傳圖片中');
      wrapper.unmount();
    });

    it('discards an upload that is removed while it is still in flight', async () => {
      const upload = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValue(upload.promise);
      apiMock.updateUrl.mockResolvedValue(buildUrl());
      const wrapper = mount(UrlEditModal, {
        props: { open: true, url: buildUrl({ image_url: undefined }) },
        attachTo: document.body
      });

      await selectFile(wrapper, buildFile('cover.jpg'));
      const removeButton = wrapper.findAll('button').find((b) => b.text().includes('移除'))!;
      await removeButton.trigger('click');

      expect(wrapper.text()).not.toContain('上傳圖片中');

      upload.resolve({ url: 'https://storage.example.com/late.jpg' });
      await flushPromises();

      await wrapper.get('[data-testid="edit-submit"]').trigger('click');
      await flushPromises();

      expect(apiMock.updateUrl).toHaveBeenCalledWith('url-1', expect.objectContaining({ image_url: null }));
      wrapper.unmount();
    });

    it('discards an upload that is still in flight when the modal is closed and re-opened', async () => {
      const upload = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValue(upload.promise);
      apiMock.updateUrl.mockResolvedValue(buildUrl());
      const url = buildUrl({ image_url: undefined });
      const wrapper = mount(UrlEditModal, { props: { open: true, url }, attachTo: document.body });

      await selectFile(wrapper, buildFile('cover.jpg'));
      await wrapper.setProps({ open: false });
      await wrapper.setProps({ open: true, url });

      upload.resolve({ url: 'https://storage.example.com/late.jpg' });
      await flushPromises();

      expect(wrapper.text()).not.toContain('上傳圖片中');
      await wrapper.get('[data-testid="edit-submit"]').trigger('click');
      await flushPromises();

      expect(apiMock.updateUrl).toHaveBeenCalledWith('url-1', expect.objectContaining({ image_url: null }));
      wrapper.unmount();
    });
  });

  describe('image upload response missing a public url', () => {
    it('treats a resolved response without url as an explicit error and preserves the prior saved image', async () => {
      apiMock.uploadImage.mockResolvedValue({
        key: 'uploads/mock-user/new.jpg',
        contentType: 'image/jpeg',
        originalName: 'new.jpg'
      });
      const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

      await selectFile(wrapper, buildFile('new.jpg'));
      await flushPromises();

      expect(wrapper.text()).toMatch(/圖片上傳失敗/);
      // The previously saved image must still be the preview, not blanked out.
      expect(wrapper.get('.preview-thumb img').attributes('src')).toBe('https://storage.example.com/existing.jpg');
      wrapper.unmount();
    });

    it('saves the prior image_url, not an empty one, when the upload response lacked a url', async () => {
      apiMock.uploadImage.mockResolvedValue({
        key: 'uploads/mock-user/new.jpg',
        contentType: 'image/jpeg',
        originalName: 'new.jpg'
      });
      apiMock.updateUrl.mockResolvedValue(buildUrl());
      const wrapper = mount(UrlEditModal, { props: { open: true, url: buildUrl() }, attachTo: document.body });

      await selectFile(wrapper, buildFile('new.jpg'));
      await flushPromises();
      await wrapper.get('[data-testid="edit-submit"]').trigger('click');
      await flushPromises();

      expect(apiMock.updateUrl).toHaveBeenCalledWith(
        'url-1',
        expect.objectContaining({ image_url: 'https://storage.example.com/existing.jpg' })
      );
      wrapper.unmount();
    });
  });
});
