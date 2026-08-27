import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { UrlResponse } from '@/types';

const apiMock = vi.hoisted(() => ({
  createUrl: vi.fn(),
  uploadImage: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import UrlCreateModal from '../UrlCreateModal.vue';

function mountCreateModal(open = true) {
  return mount(UrlCreateModal, { props: { open } });
}

function buildUrl(overrides: Partial<UrlResponse> = {}): UrlResponse {
  return {
    id: 'new-1',
    short_code: 'new-link',
    original_url: 'https://example.com/target',
    short_url: 'https://aka.money/new-link',
    created_at: Date.now(),
    updated_at: Date.now(),
    is_active: true,
    click_count: 0,
    ...overrides
  };
}

function buildFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

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

async function selectFile(wrapper: ReturnType<typeof mount>, file: File): Promise<void> {
  const fileInput = wrapper.get('input[type="file"]');
  Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true });
  await fileInput.trigger('change');
}

async function fillRequiredFields(wrapper: ReturnType<typeof mount>, alias: string): Promise<void> {
  await wrapper.find('input[type="url"]').setValue('https://example.com/target');
  await wrapper.find('.prefix-input input[type="text"]').setValue(alias);
}

describe('UrlCreateModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render the dialog while closed', () => {
    const wrapper = mountCreateModal(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('renders the create dialog while open', () => {
    const wrapper = mountCreateModal();
    expect(wrapper.get('[role="dialog"]').text()).toContain('新增短網址');
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('emits close from the cancel button', async () => {
    const wrapper = mountCreateModal();
    await wrapper.get('[data-testid="create-cancel"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('discards an abandoned draft before the modal is reopened', async () => {
    const wrapper = mountCreateModal();
    await wrapper.get('#qc-original-url').setValue('https://example.com/draft');
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    expect((wrapper.get('#qc-original-url').element as HTMLInputElement).value).toBe('');
  });

  it('renders the required original URL and short code fields', () => {
    const wrapper = mountCreateModal();

    expect(wrapper.find('input[type="url"]').exists()).toBe(true);
    expect(wrapper.find('.prefix-input input[type="text"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('aka.money/');
  });

  describe('keyboard-operable upload area', () => {
    it('exposes button semantics, focusability, and an accessible label', () => {
      const wrapper = mountCreateModal();
      const uploadArea = wrapper.get('.upload-area');

      expect(uploadArea.attributes('role')).toBe('button');
      expect(uploadArea.attributes('tabindex')).toBe('0');
      expect(uploadArea.attributes('aria-label')).toBeTruthy();
    });

    it('activates the hidden file input when Enter is pressed', async () => {
      const wrapper = mountCreateModal();
      const clickSpy = vi.spyOn(wrapper.get('input[type="file"]').element as HTMLInputElement, 'click');

      await wrapper.get('.upload-area').trigger('keydown.enter');

      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('activates the hidden file input when Space is pressed', async () => {
      const wrapper = mountCreateModal();
      const clickSpy = vi.spyOn(wrapper.get('input[type="file"]').element as HTMLInputElement, 'click');

      await wrapper.get('.upload-area').trigger('keydown.space');

      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects submission with an invalid short code and does not call the API', async () => {
    const wrapper = mountCreateModal();

    await wrapper.find('input[type="url"]').setValue('https://example.com/target');
    await wrapper.find('.prefix-input input[type="text"]').setValue('ab');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(apiMock.createUrl).not.toHaveBeenCalled();
    expect(wrapper.get('.field-error').text()).toMatch(/3.{0,2}20/);
  });

  it('fills a random valid short code when the random button is clicked', async () => {
    const wrapper = mountCreateModal();
    const randomButton = wrapper.findAll('button').find((b) => b.text().includes('隨機'))!;

    await randomButton.trigger('click');

    const value = (wrapper.get('.prefix-input input[type="text"]').element as HTMLInputElement).value;
    expect(value.length).toBeGreaterThanOrEqual(3);
    expect(value.length).toBeLessThanOrEqual(20);
  });

  it('creates a url with the entered fields and emits created, then resets the form', async () => {
    const created = buildUrl();
    apiMock.createUrl.mockResolvedValue(created);
    const wrapper = mountCreateModal();

    await wrapper.find('input[type="url"]').setValue('https://example.com/target');
    await wrapper.find('.prefix-input input[type="text"]').setValue('new-link');
    await wrapper.find('#qc-title').setValue('My Title');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(apiMock.createUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: 'https://example.com/target',
        short_code: 'new-link',
        title: 'My Title'
      })
    );
    expect(wrapper.emitted('created')?.[0]).toEqual([created]);
    expect((wrapper.find('input[type="url"]').element as HTMLInputElement).value).toBe('');
  });

  it('shows a server error and does not emit created when creation fails', async () => {
    apiMock.createUrl.mockRejectedValue({ response: { data: { message: '短代碼已存在' } } });
    const wrapper = mountCreateModal();

    await wrapper.find('input[type="url"]').setValue('https://example.com/target');
    await wrapper.find('.prefix-input input[type="text"]').setValue('taken-code');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('短代碼已存在');
    expect(wrapper.emitted('created')).toBeUndefined();
  });

  it('uploads a selected image file, previews it, and includes the url on submit', async () => {
    apiMock.uploadImage.mockResolvedValue({ url: 'https://storage.example.com/cover.jpg' });
    apiMock.createUrl.mockResolvedValue(buildUrl({ image_url: 'https://storage.example.com/cover.jpg' }));
    const wrapper = mountCreateModal();

    const fileInput = wrapper.get('input[type="file"]');
    const file = buildFile('cover.jpg', 'image/jpeg');
    Object.defineProperty(fileInput.element, 'files', { value: [file] });
    await fileInput.trigger('change');
    await flushPromises();

    expect(apiMock.uploadImage).toHaveBeenCalledWith(file);
    expect(wrapper.find('.preview-thumb img').attributes('src')).toBe('blob:mock-preview');

    await wrapper.find('input[type="url"]').setValue('https://example.com/target');
    await wrapper.find('.prefix-input input[type="text"]').setValue('with-image');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(apiMock.createUrl).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: 'https://storage.example.com/cover.jpg' })
    );
  });

  it('rejects an oversized or disallowed image file before uploading', async () => {
    const wrapper = mountCreateModal();
    const fileInput = wrapper.get('input[type="file"]');

    const badType = buildFile('doc.pdf', 'application/pdf');
    Object.defineProperty(fileInput.element, 'files', { value: [badType] });
    await fileInput.trigger('change');
    await flushPromises();

    expect(apiMock.uploadImage).not.toHaveBeenCalled();
    expect(wrapper.text()).toMatch(/不支援|JPEG/);
  });

  it('removes the uploaded image preview and revokes the object URL', async () => {
    apiMock.uploadImage.mockResolvedValue({ url: 'https://storage.example.com/cover.jpg' });
    const wrapper = mountCreateModal();
    const fileInput = wrapper.get('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [buildFile('cover.jpg', 'image/jpeg')] });
    await fileInput.trigger('change');
    await flushPromises();

    expect(wrapper.find('.preview-thumb').exists()).toBe(true);

    const removeButton = wrapper.findAll('button').find((b) => b.text().includes('移除'))!;
    await removeButton.trigger('click');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview');
    expect(wrapper.find('.preview-thumb').exists()).toBe(false);
  });

  it('shows a loading state on the submit button while creating', async () => {
    let resolveCreate: (value: UrlResponse) => void = () => {};
    apiMock.createUrl.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const wrapper = mountCreateModal();

    await wrapper.find('input[type="url"]').setValue('https://example.com/target');
    await wrapper.find('.prefix-input input[type="text"]').setValue('slow-code');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const submitButton = wrapper.get('[data-testid="create-submit"]');
    expect(submitButton.attributes('aria-busy')).toBe('true');

    resolveCreate(buildUrl());
    await flushPromises();
  });

  describe('submission guards', () => {
    it('does not emit close when the modal-close control is used while a create request is pending', async () => {
      const create = deferred<UrlResponse>();
      apiMock.createUrl.mockReturnValue(create.promise);
      const wrapper = mountCreateModal();

      await fillRequiredFields(wrapper, 'pending-code');
      await wrapper.get('[data-testid="create-submit"]').trigger('click');
      await flushPromises();

      expect(wrapper.get('[data-testid="create-submit"]').attributes('aria-busy')).toBe('true');

      await wrapper.get('[data-testid="modal-close"]').trigger('click');
      expect(wrapper.emitted('close')).toBeUndefined();

      create.resolve(buildUrl({ short_code: 'pending-code' }));
      await flushPromises();

      expect(wrapper.emitted('created')).toBeDefined();
    });

    it('calls createUrl exactly once when the footer button click and the form submit fire in immediate succession', async () => {
      const create = deferred<UrlResponse>();
      apiMock.createUrl.mockReturnValue(create.promise);
      const wrapper = mountCreateModal();

      await fillRequiredFields(wrapper, 'dual-submit');

      // Models a real browser where clicking a `form="..."`-owned submit button
      // both fires its own click handler and submits the owning form; both event
      // dispatches are triggered here without awaiting in between so the
      // `submitting` guard in `handleSubmit` is exercised the same way it would
      // be if a browser dispatched both in the same task.
      await Promise.all([
        wrapper.get('[data-testid="create-submit"]').trigger('click'),
        wrapper.get('form').trigger('submit')
      ]);
      await flushPromises();

      expect(apiMock.createUrl).toHaveBeenCalledTimes(1);

      create.resolve(buildUrl({ short_code: 'dual-submit' }));
      await flushPromises();
    });
  });

  describe('image upload races', () => {
    it('creates nothing while an image upload is still in flight, then succeeds once it finishes', async () => {
      const upload = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValue(upload.promise);
      apiMock.createUrl.mockResolvedValue(buildUrl({ image_url: 'https://storage.example.com/cover.jpg' }));
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('cover.jpg', 'image/jpeg'));
      await fillRequiredFields(wrapper, 'with-image');

      expect(wrapper.get('[data-testid="create-submit"]').attributes('disabled')).toBeDefined();
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(apiMock.createUrl).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('圖片上傳中');
      expect(wrapper.emitted('created')).toBeUndefined();

      upload.resolve({ url: 'https://storage.example.com/cover.jpg' });
      await flushPromises();

      expect(wrapper.get('[data-testid="create-submit"]').attributes('disabled')).toBeUndefined();
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(apiMock.createUrl).toHaveBeenCalledWith(
        expect.objectContaining({ image_url: 'https://storage.example.com/cover.jpg' })
      );
    });

    it('keeps the newest selection when an earlier upload resolves last', async () => {
      const first = deferred<{ url: string }>();
      const second = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      apiMock.createUrl.mockResolvedValue(buildUrl());
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('first.jpg', 'image/jpeg'));
      await selectFile(wrapper, buildFile('second.jpg', 'image/jpeg'));

      second.resolve({ url: 'https://storage.example.com/second.jpg' });
      await flushPromises();
      first.resolve({ url: 'https://storage.example.com/first.jpg' });
      await flushPromises();

      await fillRequiredFields(wrapper, 'race-code');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(apiMock.createUrl).toHaveBeenCalledWith(
        expect.objectContaining({ image_url: 'https://storage.example.com/second.jpg' })
      );
    });

    it('never re-enables submit from a stale upload that resolves after a newer one', async () => {
      const first = deferred<{ url: string }>();
      const second = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('first.jpg', 'image/jpeg'));
      await selectFile(wrapper, buildFile('second.jpg', 'image/jpeg'));

      first.resolve({ url: 'https://storage.example.com/first.jpg' });
      await flushPromises();

      expect(wrapper.text()).toContain('上傳圖片中');
      expect(wrapper.get('[data-testid="create-submit"]').attributes('disabled')).toBeDefined();

      second.resolve({ url: 'https://storage.example.com/second.jpg' });
      await flushPromises();

      expect(wrapper.text()).not.toContain('上傳圖片中');
      expect(wrapper.get('[data-testid="create-submit"]').attributes('disabled')).toBeUndefined();
    });

    it('does not surface a stale upload failure over the newest upload', async () => {
      const first = deferred<{ url: string }>();
      const second = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('first.jpg', 'image/jpeg'));
      await selectFile(wrapper, buildFile('second.jpg', 'image/jpeg'));

      second.resolve({ url: 'https://storage.example.com/second.jpg' });
      await flushPromises();
      first.reject({ response: { data: { message: '舊的上傳失敗' } } });
      await flushPromises();

      expect(wrapper.text()).not.toContain('舊的上傳失敗');
      expect(wrapper.find('.preview-thumb').exists()).toBe(true);
    });

    it('prevents an upload abandoned by modal close from attaching after reopen', async () => {
      const upload = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValue(upload.promise);
      apiMock.createUrl.mockResolvedValue(buildUrl());
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('cover.jpg', 'image/jpeg'));
      await wrapper.setProps({ open: false });
      await wrapper.setProps({ open: true });

      upload.resolve({ url: 'https://storage.example.com/stale.jpg' });
      await flushPromises();

      await fillRequiredFields(wrapper, 'fresh-modal');
      await wrapper.get('[data-testid="create-submit"]').trigger('click');
      await flushPromises();

      expect(apiMock.createUrl.mock.calls[0][0].image_url).toBeUndefined();
    });

    it('prevents a cleared upload from attaching to the next submission', async () => {
      const upload = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValue(upload.promise);
      apiMock.createUrl.mockResolvedValue(buildUrl());
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('cover.jpg', 'image/jpeg'));
      const removeButton = wrapper.findAll('button').find((b) => b.text().includes('移除'))!;
      await removeButton.trigger('click');

      upload.resolve({ url: 'https://storage.example.com/stale.jpg' });
      await flushPromises();

      await fillRequiredFields(wrapper, 'after-clear');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      const payload = apiMock.createUrl.mock.calls[0][0];
      expect(payload.image_url).toBeUndefined();
    });

    it('ignores an upload that resolves after the panel is unmounted', async () => {
      const upload = deferred<{ url: string }>();
      apiMock.uploadImage.mockReturnValue(upload.promise);
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('cover.jpg', 'image/jpeg'));
      wrapper.unmount();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview');
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);

      upload.resolve({ url: 'https://storage.example.com/stale.jpg' });
      await flushPromises();

      // A second revoke would mean the unmounted instance still owned the preview.
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });
  });

  describe('image upload response missing a public url', () => {
    it('treats a resolved response without url as an explicit upload error, not a silent success', async () => {
      apiMock.uploadImage.mockResolvedValue({
        key: 'uploads/mock-user/cover.jpg',
        contentType: 'image/jpeg',
        originalName: 'cover.jpg'
      });
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('cover.jpg', 'image/jpeg'));
      await flushPromises();

      expect(wrapper.text()).toMatch(/圖片上傳失敗/);
      expect(wrapper.find('.preview-thumb').exists()).toBe(false);
    });

    it('does not silently attach an image on submit when the upload response lacked a url', async () => {
      apiMock.uploadImage.mockResolvedValue({
        key: 'uploads/mock-user/cover.jpg',
        contentType: 'image/jpeg',
        originalName: 'cover.jpg'
      });
      apiMock.createUrl.mockResolvedValue(buildUrl());
      const wrapper = mountCreateModal();

      await selectFile(wrapper, buildFile('cover.jpg', 'image/jpeg'));
      await flushPromises();
      await fillRequiredFields(wrapper, 'no-image-url');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      const payload = apiMock.createUrl.mock.calls[0][0];
      expect(payload.image_url).toBeUndefined();
    });
  });
});
