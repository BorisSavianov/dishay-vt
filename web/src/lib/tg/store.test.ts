import { describe, expect, it } from 'vitest';
import { memoryStore } from './store';

describe('memoryStore', () => {
  it('upsert then get returns the sub', async () => {
    const s = memoryStore();
    await s.upsert({ chatId: 7, profile: 'child', stationId: 'sc-1' });
    expect(await s.get(7)).toEqual({ chatId: 7, profile: 'child', stationId: 'sc-1' });
  });
  it('deactivate hides the sub; upsert reactivates', async () => {
    const s = memoryStore();
    await s.upsert({ chatId: 7, profile: 'child', stationId: 'sc-1' });
    await s.deactivate(7);
    expect(await s.get(7)).toBeNull();
    expect(await s.active()).toEqual([]);
    await s.upsert({ chatId: 7, profile: 'asthma', stationId: 'sc-1' });
    expect((await s.active()).map((x) => x.profile)).toEqual(['asthma']);
  });
  it('remembers sent keys', async () => {
    const s = memoryStore();
    await s.markSent(['a']);
    expect((await s.sentKeys()).has('a')).toBe(true);
  });
});
