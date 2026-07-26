import { describe, it, expect } from 'vitest';
import { createSupabaseClientForTest, resetSupabaseClient } from '../../core/supabase/client';

describe('Supabase Client', () => {
  it('should create a test client', () => {
    resetSupabaseClient();
    const client = createSupabaseClientForTest();
    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
  });

  it('should reset client', () => {
    const c1 = createSupabaseClientForTest();
    resetSupabaseClient();
    const c2 = createSupabaseClientForTest();
    expect(c1).not.toBe(c2);
  });
});
