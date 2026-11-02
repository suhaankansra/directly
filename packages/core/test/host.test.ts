import { describe, expect, it } from 'vitest';
import { hostVerdict } from '../src/host';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';

function decide(url: string, prev: string | null, settings: Partial<Settings> = {}): string {
  return hostVerdict(url, { settings: { ...DEFAULT_SETTINGS, ...settings }, loggedIn: true, pinId: null }, prev)
    .action;
}

function reason(url: string, prev: string | null, settings: Partial<Settings> = {}): string {
  return hostVerdict(
    url,
    { settings: { ...DEFAULT_SETTINGS, ...settings }, loggedIn: true, pinId: null },
    prev,
  ).reason;
}

describe('hostVerdict', () => {
  it('blocks the feed, explore and the reels tab on a document load', () => {
    expect(decide('/', '/')).toBe('block');
    expect(decide('/explore/', '/direct/inbox/')).toBe('block');
    expect(decide('/reels/', '/direct/inbox/')).toBe('block');
  });

  it('allows the inbox, a thread and activity', () => {
    expect(decide('/direct/inbox/', null)).toBe('allow');
    expect(decide('/direct/t/1/', '/direct/inbox/')).toBe('allow');
    expect(decide('/accounts/activity/', '/direct/inbox/')).toBe('allow');
  });

  it('allows a reel link tapped inside a DM thread', () => {
    expect(decide('/reel/Cabc/', '/direct/t/42/')).toBe('allow');
    expect(reason('/reel/Cabc/', '/direct/t/42/')).toBe('opened-from-surface');
  });

  it('allows a post tapped from a profile grid', () => {
    expect(decide('/p/Cabc/', '/alice/')).toBe('allow');
  });

  it('blocks a reel deep link with no DM or profile behind it', () => {
    expect(decide('/reel/Cabc/', null)).toBe('block');
    expect(decide('/reel/Cabc/', '/explore/')).toBe('block');
    expect(decide('/reel/Cabc/', 'https://example.com/')).toBe('block');
  });

  it('blocks stories on a document load even from a DM', () => {
    expect(decide('/stories/alice/1/', '/direct/t/42/')).toBe('block');
    expect(decide('/stories/alice/1/', '/direct/t/42/', { allowStories: true })).toBe('allow');
  });

  it('blocks reels entirely in strict mode', () => {
    expect(decide('/reel/Cabc/', '/direct/t/42/', { allowReelsFromDms: false })).toBe('block');
  });
});
