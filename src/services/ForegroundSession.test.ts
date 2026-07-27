import { beginForegroundSession } from './ForegroundSession';

describe('ForegroundSession', () => {
  it('is current immediately after beginning, with no other session started', () => {
    const session = beginForegroundSession();
    expect(session.isCurrent()).toBe(true);
  });

  it('is superseded by a later session begun anywhere, even without calling end()', () => {
    const first = beginForegroundSession();
    const second = beginForegroundSession();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('stops being current once end() is called, even with no later session', () => {
    const session = beginForegroundSession();
    session.end();
    expect(session.isCurrent()).toBe(false);
  });

  it('does not resurrect an already-superseded session when its own end() is called', () => {
    const first = beginForegroundSession();
    const second = beginForegroundSession();
    first.end();
    expect(second.isCurrent()).toBe(true);
  });
});
