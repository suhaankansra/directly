import { describe, expect, it } from 'vitest';
import { parseHostMessage, parsePageMessage } from '../src/bridge';
import { DEFAULT_SETTINGS, mergeSettings, settingsEqual } from '../src/settings';

describe('mergeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts booleans and ignores wrong types', () => {
    const merged = mergeSettings({ allowStories: true, allowReelsFromDms: 'yes' });
    expect(merged.allowStories).toBe(true);
    expect(merged.allowReelsFromDms).toBe(DEFAULT_SETTINGS.allowReelsFromDms);
  });

  it('drops keys that are not part of the schema', () => {
    const merged = mergeSettings({ allowStories: true, remoteCode: 'alert(1)' });
    expect(Object.keys(merged).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('detects equality', () => {
    expect(settingsEqual(DEFAULT_SETTINGS, mergeSettings({}))).toBe(true);
    expect(settingsEqual(DEFAULT_SETTINGS, mergeSettings({ allowStories: true }))).toBe(false);
  });
});

describe('parsePageMessage', () => {
  it('accepts a well-formed url message', () => {
    const message = parsePageMessage({ v: 1, type: 'di:url', path: '/direct/inbox/', layout: 'mobile', pinId: null });
    expect(message).toEqual({ v: 1, type: 'di:url', path: '/direct/inbox/', layout: 'mobile', pinId: null });
  });

  it('accepts JSON strings, as the React Native bridge delivers them', () => {
    const message = parsePageMessage(JSON.stringify({ v: 1, type: 'di:tab', tab: 'inbox' }));
    expect(message).toEqual({ v: 1, type: 'di:tab', tab: 'inbox' });
  });

  it('drops the wrong protocol version', () => {
    expect(parsePageMessage({ v: 2, type: 'di:tab', tab: 'inbox' })).toBeNull();
  });

  it('drops unknown types', () => {
    expect(parsePageMessage({ v: 1, type: 'di:secret' })).toBeNull();
  });

  it('rejects non-path, over-long and backslash paths', () => {
    expect(parsePageMessage({ v: 1, type: 'di:blocked', path: 'javascript:alert(1)', reason: 'x' })).toBeNull();
    expect(parsePageMessage({ v: 1, type: 'di:blocked', path: '/' + 'a'.repeat(600), reason: 'x' })).toBeNull();
    expect(parsePageMessage({ v: 1, type: 'di:blocked', path: '/a\\b', reason: 'x' })).toBeNull();
  });

  it('sanitises an unsafe pin id rather than passing it on', () => {
    const message = parsePageMessage({
      v: 1,
      type: 'di:url',
      path: '/reel/Cabc/',
      layout: 'mobile',
      pinId: '../../etc/passwd',
    });
    expect(message).toMatchObject({ pinId: null });
  });

  it('drops invalid layout values', () => {
    expect(parsePageMessage({ v: 1, type: 'di:url', path: '/', layout: 'tablet', pinId: null })).toBeNull();
  });

  it('drops oversized payloads', () => {
    expect(parsePageMessage('x'.repeat(5000))).toBeNull();
  });

  it('accepts a username for the Lock tab and rejects anything that is not one', () => {
    expect(
      parsePageMessage({ v: 1, type: 'di:account', username: 'alice.b', signedIn: true }),
    ).toEqual({
      v: 1,
      type: 'di:account',
      username: 'alice.b',
      signedIn: true,
    });
    expect(
      parsePageMessage({ v: 1, type: 'di:account', username: null, signedIn: false }),
    ).toEqual({
      v: 1,
      type: 'di:account',
      username: null,
      signedIn: false,
    });
    expect(
      parsePageMessage({ v: 1, type: 'di:account', username: '<img onerror=1>', signedIn: true }),
    ).toBeNull();
    // Session state is required: without it the host would have to guess, which
    // is how the Lock tab ended up claiming a session that did not exist.
    expect(parsePageMessage({ v: 1, type: 'di:account', username: 'alice.b' })).toBeNull();
  });
});

describe('parseHostMessage', () => {
  it('clamps settings from the host', () => {
    const message = parseHostMessage({ v: 1, type: 'di:settings', settings: { allowStories: true, evil: true } });
    expect(message).toMatchObject({ type: 'di:settings', settings: { allowStories: true } });
  });

  it('accepts an absolute-path navigate and rejects anything else', () => {
    expect(parseHostMessage({ v: 1, type: 'di:navigate', path: '/direct/inbox/' })).toMatchObject({
      path: '/direct/inbox/',
    });
    expect(parseHostMessage({ v: 1, type: 'di:navigate', path: 'https://evil.example/' })).toBeNull();
  });

  it('accepts pin and unpin', () => {
    expect(parseHostMessage({ v: 1, type: 'di:pin', id: 'Cabc' })).toMatchObject({ id: 'Cabc' });
    expect(parseHostMessage({ v: 1, type: 'di:pin', id: null })).toMatchObject({ id: null });
    expect(parseHostMessage({ v: 1, type: 'di:pin', id: '<script>' })).toBeNull();
  });
});
