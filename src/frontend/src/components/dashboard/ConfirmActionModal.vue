<template>
  <BaseModal :open="open" :title="title" @close="handleClose">
    <p>{{ description }}</p>
    <StateBlock v-if="error" state="error" :message="error" />
    <template #footer>
      <BaseButton variant="ghost" data-testid="cancel-action" :disabled="loading" @click="handleClose">取消</BaseButton>
      <BaseButton
        :variant="confirmVariant"
        data-testid="confirm-action"
        :loading="loading"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * Generic confirm dialog on top of BaseModal - shared by the archive and
 * restore confirmations so their near-identical chrome isn't duplicated.
 * Cancel / backdrop click / Escape all route through BaseModal's own
 * `close` emit.
 */
import BaseModal from '@/components/common/BaseModal.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import StateBlock from '@/components/common/StateBlock.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    confirmVariant?: 'default' | 'primary' | 'ghost' | 'danger';
    loading?: boolean;
    error?: string | null;
  }>(),
  {
    confirmVariant: 'primary',
    loading: false,
    error: null
  }
);

const emit = defineEmits<{ close: []; confirm: [] }>();

const handleClose = (): void => {
  if (props.loading) {
    return;
  }
  emit('close');
};
</script>
