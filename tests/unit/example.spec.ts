import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import HomePage from '@/views/HomePage.vue';

describe('HomePage.vue', () => {
  test('shows Firebase setup instructions when the project is not configured', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.text()).toContain('Configure as variáveis do Firebase');
  });
});
